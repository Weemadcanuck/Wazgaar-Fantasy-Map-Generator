import type { ReliefIcon } from "@/generators/relief-generator";
import type { ViewportBounds } from "../viewport/viewport-renderer";
import { ReliefPngEncoder } from "./relief-png";

const NS = "http://www.w3.org/2000/svg";
const pngEncoder = new ReliefPngEncoder();
export const TILE_SIZE = 256;
export const CACHE_BYTES = 512 * 1024 * 1024;
export interface ReliefTile {
  key: string;
  x: number;
  y: number;
  pixels: number;
}
export interface RasterImage {
  url: string;
  dispose: () => void;
}

/** Bound the request before allocating anything, including unusually large windows / display scales. */
export function planReliefTiles(bounds: ViewportBounds, icons: ReliefIcon[], dpr: number): ReliefTile[] | null {
  // Half-step bands always meet the current screen density without paying for 2x at distant zoom.
  const zoomBand = Math.max(1, Math.ceil(bounds.scale * 2) / 2);
  const pixels = Math.ceil(TILE_SIZE * Math.max(1, dpr) * zoomBand);
  if (pixels > 2048 || !Number.isFinite(pixels)) return null;
  if (!icons.length) return [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const icon of icons) {
    x0 = Math.min(x0, icon.x);
    y0 = Math.min(y0, icon.y);
    x1 = Math.max(x1, icon.x + icon.s);
    y1 = Math.max(y1, icon.y + icon.s);
  }
  const left = Math.floor(Math.max(bounds.x0, x0) / TILE_SIZE);
  const top = Math.floor(Math.max(bounds.y0, y0) / TILE_SIZE);
  const right = Math.floor(Math.min(bounds.x1, x1) / TILE_SIZE);
  const bottom = Math.floor(Math.min(bounds.y1, y1) / TILE_SIZE);
  const count = Math.max(0, right - left + 1) * Math.max(0, bottom - top + 1);
  if (!Number.isFinite(count) || count * pixels * pixels * 4 > CACHE_BYTES) return null;
  const tiles: ReliefTile[] = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++)
      tiles.push({ key: `${x},${y},${pixels}`, x: x * TILE_SIZE, y: y * TILE_SIZE, pixels });
  }
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cy = (bounds.y0 + bounds.y1) / 2;
  const distance = (tile: ReliefTile) => (tile.x + TILE_SIZE / 2 - cx) ** 2 + (tile.y + TILE_SIZE / 2 - cy) ** 2;
  return tiles.sort((a, b) => distance(a) - distance(b));
}

export interface ReadyReliefTile extends ReliefTile, RasterImage {
  sourceKey: string;
  sourcePixels: number;
}
interface CachedReliefTile {
  tile: ReliefTile;
  image: RasterImage;
  bytes: number;
}

/** Sequential, latest-request cache. A discarded decode can never publish into a new map or edit revision. */
export class ReliefRasterCache {
  private entries = new Map<string, CachedReliefTile>();
  private wanted: ReliefTile[] = [];
  private running = false;
  private generation = 0;
  private controller = new AbortController();
  failed = false;
  private counters = { cacheHits: 0, cacheMisses: 0, tilesBuilt: 0, tilesEvicted: 0 };

  get diagnostics() {
    return { cacheLimitBytes: this.limitBytes, ...this.counters };
  }

  constructor(
    private readonly build: (tile: ReliefTile, signal: AbortSignal) => Promise<RasterImage>,
    private readonly ready: () => void,
    private readonly limitBytes = CACHE_BYTES
  ) {}

  get bytes(): number {
    return [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  }

  get coverage(): { ready: ReadyReliefTile[]; missing: ReliefTile[] } {
    const chosen = new Map<string, CachedReliefTile>();
    let requiredBytes = 0;
    for (const tile of this.wanted) {
      let best = this.entries.get(tile.key);
      if (!best)
        for (const entry of this.entries.values()) {
          if (entry.tile.x !== tile.x || entry.tile.y !== tile.y || entry.tile.pixels <= tile.pixels) continue;
          if (!best || entry.tile.pixels < best.tile.pixels) best = entry;
        }
      if (best) chosen.set(tile.key, best);
      requiredBytes += best?.bytes ?? tile.pixels * tile.pixels * 4;
    }
    // Do not pin oversized reuses at the expense of completing the visible view within the cap.
    const oversized = this.wanted
      .filter(tile => (chosen.get(tile.key)?.tile.pixels ?? 0) > tile.pixels)
      .sort((a, b) => chosen.get(b.key)!.bytes - b.pixels ** 2 * 4 - (chosen.get(a.key)!.bytes - a.pixels ** 2 * 4));
    for (const tile of oversized) {
      if (requiredBytes <= this.limitBytes) break;
      requiredBytes -= chosen.get(tile.key)!.bytes - tile.pixels ** 2 * 4;
      chosen.delete(tile.key);
    }
    const ready: ReadyReliefTile[] = [];
    const missing: ReliefTile[] = [];
    for (const tile of this.wanted) {
      const entry = chosen.get(tile.key);
      if (entry) ready.push({ ...tile, ...entry.image, sourceKey: entry.tile.key, sourcePixels: entry.tile.pixels });
      else missing.push(tile);
    }
    return { ready, missing };
  }

  request(tiles: ReliefTile[]): ReadyReliefTile[] | null {
    this.wanted = tiles;
    const coverage = this.coverage;
    this.counters.cacheHits += coverage.ready.length;
    this.counters.cacheMisses += coverage.missing.length;
    // Map insertion order tracks last requested use, including sharper-tile reuse.
    for (const tile of coverage.ready) {
      const entry = this.entries.get(tile.sourceKey)!;
      this.entries.delete(tile.sourceKey);
      this.entries.set(tile.sourceKey, entry);
    }
    if (!coverage.missing.length) return coverage.ready;
    if (!this.running && !this.failed) void this.pump();
    return null;
  }

  get progress(): { ready: number; requested: number; reusedHigherResolution: number } {
    const { ready } = this.coverage;
    return {
      ready: ready.length,
      requested: this.wanted.length,
      reusedHigherResolution: ready.filter(tile => tile.sourcePixels > tile.pixels).length
    };
  }

  /** Suspend generation while hidden, zoomed in or editing, preserving completed tiles. */
  pause(): void {
    this.generation++;
    this.controller.abort();
    this.controller = new AbortController();
    this.wanted = [];
  }

  private makeRoom(bytes: number): void {
    const protectedKeys = new Set(this.coverage.ready.map(tile => tile.sourceKey));
    for (const [key, entry] of this.entries) {
      if (this.bytes + bytes <= this.limitBytes) return;
      if (protectedKeys.has(key)) continue;
      entry.image.dispose();
      this.entries.delete(key);
      this.counters.tilesEvicted++;
    }
    if (this.bytes + bytes > this.limitBytes) throw new Error("Relief raster cache budget exceeded");
  }

  clear(): void {
    this.pause();
    for (const entry of this.entries.values()) entry.image.dispose();
    this.entries.clear();
    this.failed = false;
    this.counters = { cacheHits: 0, cacheMisses: 0, tilesBuilt: 0, tilesEvicted: 0 };
  }

  private async pump(): Promise<void> {
    this.running = true;
    const generation = this.generation;
    try {
      while (generation === this.generation) {
        const tile = this.coverage.missing[0];
        if (!tile) break;
        const bytes = tile.pixels * tile.pixels * 4;
        this.makeRoom(bytes);
        const image = await this.build(tile, this.controller.signal);
        if (generation !== this.generation) {
          image.dispose();
          continue;
        }
        if (this.bytes + bytes > this.limitBytes) {
          image.dispose();
          throw new Error("Relief raster cache budget exceeded");
        }
        this.entries.set(tile.key, { tile, image, bytes });
        this.counters.tilesBuilt++;
        this.ready();
      }
    } catch (error) {
      if (generation === this.generation) {
        this.failed = true;
        console.warn("Relief raster fell back to SVG", error);
      }
    } finally {
      this.running = false;
      if (generation === this.generation) this.ready();
      else if (this.wanted.length && !this.failed) void this.pump();
    }
  }
}

export function reliefTileSvg(tile: ReliefTile, icons: ReliefIcon[], definitions: Element): string {
  const doc = definitions.ownerDocument;
  const svg = doc.createElementNS(NS, "svg");
  // Render a two-pixel gutter then crop it off, so tile edges sample the same geometry as their neighbours.
  const gutter = (2 * TILE_SIZE) / tile.pixels;
  svg.setAttribute("width", String(tile.pixels + 4));
  svg.setAttribute("height", String(tile.pixels + 4));
  svg.setAttribute(
    "viewBox",
    `${tile.x - gutter} ${tile.y - gutter} ${TILE_SIZE + 2 * gutter} ${TILE_SIZE + 2 * gutter}`
  );
  const visible = icons.filter(
    icon =>
      icon.x <= tile.x + TILE_SIZE + gutter &&
      icon.y <= tile.y + TILE_SIZE + gutter &&
      icon.x + icon.s >= tile.x - gutter &&
      icon.y + icon.s >= tile.y - gutter
  );
  const ids = new Set(visible.map(icon => icon.icon));
  const children = Array.from(definitions.children);
  // Older maps embed their own definitions; newer built-ins may live in the app's separate SVG.
  const extra = [...ids]
    .filter(id => !children.some(child => child.id === id))
    .map(id => doc.getElementById(id))
    .filter(element => element !== null);
  const selected = [...children, ...extra].filter(child => ids.has(child.id));
  // Built-in relief symbols are self-contained. Preserve the full definitions for unfamiliar referenced artwork.
  const independent =
    children.every(child => child.localName === "symbol") &&
    selected.every(child => !child.querySelector("use") && !/url\(/.test(child.outerHTML));
  const subset = definitions.cloneNode(!independent) as Element;
  for (const child of independent ? selected : extra) subset.append(child.cloneNode(true));
  const defs = doc.createElementNS(NS, "defs");
  defs.append(subset);
  svg.append(defs);
  for (const icon of visible) {
    const use = doc.createElementNS(NS, "use");
    use.setAttribute("href", `#${icon.icon}`);
    use.setAttribute("x", String(icon.x));
    use.setAttribute("y", String(icon.y));
    use.setAttribute("width", String(icon.s));
    use.setAttribute("height", String(icon.s));
    svg.append(use);
  }
  return new XMLSerializer().serializeToString(svg);
}

export async function rasterizeReliefTile(
  svg: string,
  pixels: number,
  signal: AbortSignal,
  measure?: (phase: string, start: number, duration: number) => void
): Promise<RasterImage> {
  let started = performance.now();
  const measured = (phase: string) => {
    const now = performance.now();
    measure?.(phase, started, now - started);
    started = now;
  };
  const source = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const image = new Image();
  const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas") as HTMLCanvasElement;
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        image.src = "";
        reject(new DOMException("Cancelled", "AbortError"));
      };
      const cleanup = () => signal.removeEventListener("abort", abort);
      image.onload = () => {
        cleanup();
        resolve();
      };
      image.onerror = () => {
        cleanup();
        reject(new Error("Relief SVG decode failed"));
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      image.src = source;
    });
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    measured("SVG load");
    canvas.width = canvas.height = pixels;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Relief canvas unavailable");
    context.drawImage(image, 2, 2, pixels, pixels, 0, 0, pixels, pixels);
    measured("canvas draw");
    const encoded = await pngEncoder.encode(context, pixels, signal, () => measured("pixel readback"));
    const blob =
      encoded ??
      (await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error("Relief PNG encoding failed"));
        })
      ));
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    measured("PNG encode");
    const url = URL.createObjectURL(blob);
    return { url, dispose: () => URL.revokeObjectURL(url) };
  } finally {
    image.onload = image.onerror = null;
    image.src = "";
    canvas.width = canvas.height = 0;
    URL.revokeObjectURL(source);
  }
}
