import type { ReliefIcon } from "@/generators/relief-generator";
import { planRasterTiles, type RasterTile, RasterTileCache, TILE_SIZE } from "../svg-raster";
import type { ViewportBounds } from "../viewport/viewport-renderer";

export type { RasterImage, RasterTile as ReliefTile, ReadyRasterTile as ReadyReliefTile } from "../svg-raster";
export { rasterizeSvgTile as rasterizeReliefTile, TILE_SIZE } from "../svg-raster";

const NS = "http://www.w3.org/2000/svg";
export const CACHE_BYTES = 512 * 1024 * 1024;
export class ReliefRasterCache extends RasterTileCache {
  constructor(build: ConstructorParameters<typeof RasterTileCache>[0], ready: () => void, limitBytes = CACHE_BYTES) {
    super(build, ready, limitBytes);
  }
}
/** Bound the request before allocating anything, including unusually large windows / display scales. */
export function planReliefTiles(bounds: ViewportBounds, icons: ReliefIcon[], dpr: number): RasterTile[] | null {
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
  return planRasterTiles(bounds, { x0, y0, x1, y1 }, dpr, CACHE_BYTES);
}

export function reliefTileSvg(tile: RasterTile, icons: ReliefIcon[], definitions: Element): string {
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
