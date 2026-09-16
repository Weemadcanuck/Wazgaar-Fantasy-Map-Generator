import { PngEncoder } from "./png-encoder";
import { planRasterTiles, type RasterTile, RasterTileCache, rasterizeSvgTile, TILE_SIZE } from "./svg-raster";
import { ViewportLayers, type ViewportRenderContext } from "./viewport/viewport-renderer";

const NS = "http://www.w3.org/2000/svg";
const CACHE_BYTES = 128 * 1024 * 1024;
const encoder = new PngEncoder();
let owner: Element | null = null;
let source = "";
let density = 0;
const cache = new RasterTileCache(
  (tile, signal) => rasterizeSvgTile(coastalTileSvg(tile, source), tile.pixels, signal, undefined, encoder),
  () => ViewportLayers.invalidate("coastalDecoration", "coastal tiles ready"),
  CACHE_BYTES
);
ViewportLayers.register({
  id: "coastalDecoration",
  render,
  scaleSensitive: true,
  viewportSensitive: () => true
});

/** Runtime images never enter a saved map or export; the original vector children remain available. */
export function restoreCoastalVectors(root: ParentNode): void {
  const group = root.querySelector("[data-coastal-raster]");
  const vectors = group?.querySelector("[data-coastal-vectors]");
  if (group && vectors) group.replaceWith(...vectors.childNodes);
}

export function invalidateCoastalRaster(): void {
  cache.clear();
  restoreCoastalVectors(document);
  owner = null;
  source = "";
  ViewportLayers.invalidate("coastalDecoration", "coastline changed");
}

export function getCoastalRenderStatus() {
  return {
    mode: owner?.querySelector("[data-coastal-tile]") ? "raster" : "SVG",
    cacheBytes: cache.bytes,
    ...cache.diagnostics,
    ...cache.progress,
    failed: cache.failed
  };
}

export function coastalTileSvg(tile: RasterTile, content: string): string {
  const gutter = (2 * TILE_SIZE) / tile.pixels;
  return `<svg xmlns="${NS}" width="${tile.pixels + 4}" height="${tile.pixels + 4}" viewBox="${tile.x - gutter} ${tile.y - gutter} ${TILE_SIZE + 2 * gutter} ${TILE_SIZE + 2 * gutter}">${content}</svg>`;
}

function render({ root, bounds }: ViewportRenderContext): void {
  if (root !== document) return void restoreCoastalVectors(root);
  const group = document.getElementById("ocean");
  const originals = [document.getElementById("oceanWaves"), document.getElementById("oceanBands")].filter(
    (element): element is HTMLElement => element !== null
  );
  if (!group || !originals.some(element => element.hasChildNodes())) {
    if (owner) invalidateCoastalRaster();
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  if (owner !== group || density !== dpr) {
    invalidateCoastalRaster();
    owner = group;
    density = dpr;
    const defs = ["featurePaths", "waves-mask", "coastal-bands-mask", "coastal-bands-lines", "coastal-bands-shade"]
      .map(id => document.getElementById(id)?.outerHTML ?? "")
      .join("");
    source = `<defs>${defs}</defs>${originals.map(element => element.outerHTML).join("")}`;
  }
  if (bounds.scale > 2 || customization || cache.failed) {
    cache.pause();
    restoreCoastalVectors(document);
    return;
  }
  const { width, height } = options.map.graph;
  const tiles = planRasterTiles(
    ViewportLayers.getVisibleBounds(),
    { x0: 0, y0: 0, x1: width - 0.001, y1: height - 0.001 },
    dpr,
    CACHE_BYTES
  );
  if (!tiles) {
    cache.pause();
    restoreCoastalVectors(document);
    return;
  }
  const ready = cache.request(tiles);
  if (!ready) return void restoreCoastalVectors(document);
  let raster = group.querySelector<SVGGElement>("[data-coastal-raster]");
  if (!raster) {
    raster = document.createElementNS(NS, "g");
    raster.dataset.coastalRaster = "";
    const vectors = document.createElementNS(NS, "g");
    vectors.dataset.coastalVectors = "";
    vectors.style.display = "none";
    originals[0].before(raster);
    vectors.append(...originals);
    raster.append(vectors);
  }
  const images = new Map(
    Array.from(raster.querySelectorAll<SVGImageElement>("[data-coastal-tile]")).map(image => [
      image.dataset.coastalTile,
      image
    ])
  );
  const keys = new Set(ready.map(tile => tile.key));
  for (const [key, image] of images) if (!keys.has(key!)) image.remove();
  for (const tile of ready) {
    let image = images.get(tile.key);
    if (!image) {
      image = document.createElementNS(NS, "image");
      image.dataset.coastalTile = tile.key;
      image.setAttribute("x", String(tile.x));
      image.setAttribute("y", String(tile.y));
      image.setAttribute("width", String(TILE_SIZE));
      image.setAttribute("height", String(TILE_SIZE));
      raster.append(image);
    }
    if (image.getAttribute("href") !== tile.url) image.setAttribute("href", tile.url);
  }
}
