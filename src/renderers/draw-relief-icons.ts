import { Layers } from "@/components/layers";
import { viewport } from "@/components/viewport";
import type { ReliefIcon } from "@/generators/relief-generator";
import { PerformanceMetrics } from "@/renderers/viewport/performance-metrics";
import {
  type ViewportBounds,
  ViewportLayers,
  type ViewportRenderContext
} from "@/renderers/viewport/viewport-renderer";
import { ReliefCoverage } from "./relief/relief-coverage";
import {
  planReliefTiles,
  ReliefRasterCache,
  type ReliefTile,
  rasterizeReliefTile,
  reliefTileSvg,
  TILE_SIZE
} from "./relief/relief-raster";

export type ReliefMutation = { type: "geometry" | "appearance"; icon: ReliefIcon } | { type: "order" | "structure" };

interface LiveIcon extends ReliefIcon {
  id: string;
  node: SVGUseElement;
}

const ids = new WeakMap<ReliefIcon, string>();
const ICON_FIELDS = ["icon", "x", "y", "s"] as const;
const nodes = new Map<ReliefIcon, LiveIcon>();
const lookup = new Map<string, ReliefIcon>();
let nextId = 0;
let owner: typeof pack | null = null;
let liveRoot: Element | null = null;
let editing = false;
let rasterVisible = false;
let rasterDefinitions: Element | null = null;
const coverage = new ReliefCoverage();
let rasterMixed = false;
let displayScale = 0;
let rasterReason = "not drawn";
let hiddenSignature: string | null = null;
// Keep the original preference key for compatibility. Set to "off" and reload to use SVG only.
const rasterEnabled = typeof localStorage !== "undefined" && localStorage.getItem("reliefRasterPrototype") !== "off";
const raster = new ReliefRasterCache(
  async (tile, signal) => {
    const start = performance.now();
    const measure = PerformanceMetrics.active
      ? (phase: string, start: number, duration: number) =>
          PerformanceMetrics.record({
            layer: "relief",
            reason: "tile generation",
            phase,
            start,
            duration,
            tileKey: tile.key,
            tilePixels: tile.pixels
          })
      : undefined;
    const svg = reliefTileSvg(tile, pack.relief ?? [], rasterDefinitions!);
    measure?.("SVG prepare", start, performance.now() - start);
    const result = await rasterizeReliefTile(svg, tile.pixels, signal, measure);
    if (PerformanceMetrics.active)
      PerformanceMetrics.record({
        layer: "relief",
        reason: "tile generation",
        phase: "raster tile",
        start,
        duration: performance.now() - start,
        tileKey: tile.key,
        tilePixels: tile.pixels,
        created: 1
      });
    return result;
  },
  () => {
    // Keep the current mixed coverage stable during decoding: repeated clip updates delay tile generation.
    reportReliefDisplay();
    const { ready, requested } = raster.progress;
    if (ready === requested || raster.failed) ViewportLayers.invalidate("relief", "raster coverage ready");
  }
);
const layer = ViewportLayers.register({
  id: "relief",
  render: reconcileRelief,
  isActive: () => Layers.isOn("relief"),
  scaleSensitive: true,
  viewportSensitive: () => rasterEnabled && !editing && viewport.scale <= 2
});

export function getReliefRenderStatus() {
  return {
    enabled: rasterEnabled,
    mode: rasterVisible ? (rasterMixed ? "mixed" : "raster") : "SVG",
    editing,
    cacheBytes: raster.bytes,
    ...raster.diagnostics,
    displayedRasterTiles: rasterVisible ? coverage.imageCount : 0,
    failed: raster.failed,
    reason: rasterReason,
    ...raster.progress
  };
}

export function setReliefEditing(value: boolean): void {
  editing = value;
  if (value) raster.pause();
  layer.render();
}

function invalidateRaster(): void {
  hiddenSignature = null;
  raster.clear();
  rasterDefinitions = null;
}

function tryRaster(
  terrain: Element,
  context: ViewportRenderContext
): { vectorRoot: Element; missing: ReliefTile[] } | null {
  rasterReason = !rasterEnabled
    ? "disabled"
    : editing
      ? "editing"
      : context.bounds.scale > 2
        ? "close zoom"
        : !pack.relief?.length
          ? "empty"
          : raster.failed
            ? "tile failure"
            : "warming";
  if (rasterReason !== "warming") return null;
  const definitions = document.querySelector("#defs-relief");
  if (!definitions) {
    rasterReason = "missing symbols";
    return null;
  }
  const dpr = window.devicePixelRatio || 1;
  if (displayScale !== dpr) {
    invalidateRaster();
    displayScale = dpr;
  }
  // Raster coverage follows the actual visible viewport. The scheduler reconciles each distant pan.
  const tiles = planReliefTiles(ViewportLayers.getVisibleBounds(), pack.relief, dpr);
  if (!tiles) {
    raster.pause();
    rasterReason =
      Math.ceil(TILE_SIZE * Math.max(1, dpr) * Math.max(1, Math.ceil(context.bounds.scale * 2) / 2)) > 2048
        ? "tile size limit"
        : "visible viewport exceeds cache budget";
    return null;
  }
  rasterDefinitions ??= definitions;
  raster.request(tiles);
  const { ready, missing } = raster.coverage;
  if (!ready.length && tiles.length) return null;
  const vectorRoot = coverage.render(terrain, ready, missing);
  rasterVisible = true;
  rasterMixed = missing.length > 0;
  rasterReason = rasterMixed ? "warming" : "ready";
  return { vectorRoot, missing };
}

export function drawRelief(): void {
  if (!Layers.isOn("relief")) return void removeRelief();
  // Only an unchanged hidden layer may reuse tiles; ordinary redraws still invalidate them.
  if (hiddenSignature === null || hiddenSignature !== reliefSignature()) invalidateRaster();
  hiddenSignature = null;
  // An empty array is authored data. Only an absent field requests initial generation.
  if (!pack.relief) Relief.generate();
  layer.render();
}

export function redrawRelief(mutation: ReliefMutation = { type: "structure" }): void {
  invalidateRaster();
  // Read objects at flush time; edits do not rebuild a parallel scene or queue stale object snapshots.
  ViewportLayers.invalidate("relief", `edit ${mutation.type}`);
}

export function getSceneReliefIcon(id: string): ReliefIcon | undefined {
  if (owner !== pack || !Layers.isOn("relief")) return;
  const data = lookup.get(id);
  return data && pack.relief?.includes(data) ? data : undefined;
}

function reportReliefDisplay(): void {
  if (rasterEnabled && document.body) {
    let badge = document.getElementById("reliefRenderStatus");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "reliefRenderStatus";
      badge.style.cssText =
        "position:fixed;left:12px;bottom:12px;z-index:10;pointer-events:none;background:#222c;color:#fff;padding:4px 8px;border-radius:4px;font:12px sans-serif";
      document.body.append(badge);
    }
    const { ready, requested } = raster.progress;
    const label = rasterVisible
      ? rasterMixed
        ? `Relief: mixed ${ready}/${requested} tiles`
        : "Relief: raster"
      : rasterReason === "warming"
        ? `Relief: loading tiles ${ready}/${requested}`
        : `Relief: SVG (${rasterReason})`;
    if (badge.textContent !== label) badge.textContent = label;
  }
  if (PerformanceMetrics.active)
    PerformanceMetrics.record({
      layer: "relief",
      phase: "display",
      reason: rasterReason,
      start: performance.now(),
      duration: 0,
      mode: rasterVisible ? (rasterMixed ? "mixed" : "raster") : "SVG",
      cacheBytes: raster.bytes,
      ...raster.diagnostics,
      displayedRasterTiles: rasterVisible ? coverage.imageCount : 0,
      readyTiles: raster.progress.ready,
      requestedTiles: raster.progress.requested,
      reusedHigherResolution: raster.progress.reusedHigherResolution
    });
}

export function removeRelief(): void {
  if (owner !== pack || liveRoot !== document.querySelector("#terrain")) invalidateRaster();
  else if (raster.bytes) hiddenSignature ??= reliefSignature();
  raster.pause();
  rasterVisible = false;
  rasterMixed = false;
  coverage.reset();
  rasterReason = "hidden";
  reportReliefDisplay();
  document.getElementById("reliefRenderStatus")?.remove();
  nodes.clear();
  lookup.clear();
  document.querySelector("#terrain")?.replaceChildren();
  // No relief-specific frame: the shared scheduler skips hidden work and direct draws consume it.
}

function reliefSignature(): string {
  return JSON.stringify([
    pack.relief?.map(({ icon, x, y, s }) => [icon, x, y, s]),
    document.querySelector("#defs-relief")?.outerHTML
  ]);
}

function runtimeId(data: ReliefIcon): string {
  let id = ids.get(data);
  if (!id) {
    id = `relief-${++nextId}`;
    ids.set(data, id);
  }
  return id;
}

function intersects(data: ReliefIcon, bounds: ViewportBounds): boolean {
  return data.x <= bounds.x1 && data.y <= bounds.y1 && data.x + data.s >= bounds.x0 && data.y + data.s >= bounds.y0;
}

function createNode(data: ReliefIcon, terrain: Element): SVGUseElement {
  const node = terrain.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "use");
  node.setAttribute("href", `#${data.icon}`);
  node.setAttribute("x", String(data.x));
  node.setAttribute("y", String(data.y));
  node.setAttribute("width", String(data.s));
  node.setAttribute("height", String(data.s));
  return node;
}

function updateNode(entry: LiveIcon, data: ReliefIcon): boolean {
  let changed = false;
  for (const key of ICON_FIELDS) {
    if (entry[key] === data[key]) continue;
    changed = true;
    if (key === "icon") {
      entry.icon = data.icon;
      entry.node.setAttribute("href", `#${data.icon}`);
    } else if (key === "s") {
      entry.s = data.s;
      entry.node.setAttribute("width", String(data.s));
      entry.node.setAttribute("height", String(data.s));
    } else {
      entry[key] = data[key];
      entry.node.setAttribute(key, String(data[key]));
    }
  }
  return changed;
}

/** Use current source data even before a queued edit redraw. Never borrow live nodes or runtime keys. */
export function renderReliefForExport(root: ParentNode, bounds = ViewportLayers.getVisibleBounds()): void {
  const terrain = root.querySelector("#terrain");
  if (!terrain) return;
  const fragment = terrain.ownerDocument.createDocumentFragment();
  if (Layers.isOn("relief")) {
    for (const data of pack.relief ?? []) {
      if (intersects(data, bounds)) fragment.append(createNode(data, terrain));
    }
  }
  terrain.replaceChildren(fragment);
}

function reconcileRelief(context: ViewportRenderContext): void {
  if (context.root !== document) {
    renderReliefForExport(context.root, context.bounds);
    return;
  }
  const terrain = document.querySelector("#terrain");
  if (!terrain) return;
  if (!Layers.isOn("relief")) return void removeRelief();
  if (owner !== pack || liveRoot !== terrain) {
    invalidateRaster();
    rasterVisible = false;
    rasterMixed = false;
    coverage.reset();
    nodes.clear();
    lookup.clear();
    terrain.replaceChildren();
    owner = pack;
    liveRoot = terrain;
  }

  const display = tryRaster(terrain, context);
  if (!display && rasterVisible) {
    terrain.replaceChildren();
    coverage.reset();
    rasterVisible = false;
    rasterMixed = false;
  }
  if (editing || context.bounds.scale > 2) raster.pause();
  reportReliefDisplay();

  const start = PerformanceMetrics.active ? performance.now() : 0;
  const source = pack.relief ?? [];
  const vectorRoot = display?.vectorRoot ?? terrain;
  const missingBounds = display?.missing.map(tile => ({
    scale: context.bounds.scale,
    x0: tile.x,
    y0: tile.y,
    x1: tile.x + TILE_SIZE,
    y1: tile.y + TILE_SIZE
  }));
  const visible =
    missingBounds?.length === 0
      ? []
      : source.filter(
          data =>
            intersects(data, context.bounds) &&
            (!missingBounds || missingBounds.some(bounds => intersects(data, bounds)))
        );
  const visibleSet = new Set(visible);
  const queryEnd = PerformanceMetrics.active ? performance.now() : 0;
  let removed = 0;
  let created = 0;
  let retained = 0;
  let updated = 0;
  let moved = 0;

  for (const [data, entry] of nodes) {
    if (visibleSet.has(data)) continue;
    entry.node.remove();
    lookup.delete(entry.id);
    nodes.delete(data);
    removed++;
  }

  // Advancing a DOM cursor retains overlapping nodes, including when new icons enter between them.
  let cursor = vectorRoot.firstElementChild;
  for (const data of visible) {
    let entry = nodes.get(data);
    const existing = Boolean(entry);
    if (!entry) {
      const id = runtimeId(data);
      const node = createNode(data, terrain);
      node.dataset.id = id;
      entry = { ...data, id, node };
      nodes.set(data, entry);
      lookup.set(id, data);
      created++;
    } else {
      retained++;
      if (updateNode(entry, data)) updated++;
    }
    if (entry.node === cursor) cursor = cursor.nextElementSibling;
    else {
      vectorRoot.insertBefore(entry.node, cursor);
      if (existing) moved++;
    }
  }

  if (PerformanceMetrics.active) {
    const reason = context.reason ?? "unknown";
    PerformanceMetrics.record({
      layer: "relief",
      reason,
      phase: "scan",
      start,
      duration: queryEnd - start,
      scanned: source.length,
      candidates: source.length,
      emitted: visible.length
    });
    PerformanceMetrics.record({
      layer: "relief",
      reason,
      phase: "DOM",
      start: queryEnd,
      duration: performance.now() - queryEnd,
      created,
      removed,
      retained,
      updated,
      moved,
      live: vectorRoot.childElementCount
    });
  }
}
