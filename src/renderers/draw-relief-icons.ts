import { Layers } from "@/components/layers";
import type { ReliefIcon } from "@/generators/relief-generator";
import { PerformanceMetrics } from "@/renderers/viewport/performance-metrics";
import {
  type ViewportBounds,
  ViewportLayers,
  type ViewportRenderContext
} from "@/renderers/viewport/viewport-renderer";

import {
  planReliefTiles,
  ReliefRasterCache,
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
let rasterSignature = "";
let displayScale = 0;
// Reversible prototype flag. No serialized map/style fields are added.
const rasterEnabled = typeof localStorage !== "undefined" && localStorage.getItem("reliefRasterPrototype") !== "off";
const raster = new ReliefRasterCache(
  async (tile, signal) => {
    const start = performance.now();
    const svg = reliefTileSvg(tile, pack.relief ?? [], rasterDefinitions!);
    const result = await rasterizeReliefTile(svg, tile.pixels, signal);
    if (PerformanceMetrics.active)
      PerformanceMetrics.record({
        layer: "relief",
        reason: "tile generation",
        phase: "raster tile",
        start,
        duration: performance.now() - start,
        created: 1
      });
    return result;
  },
  () => ViewportLayers.invalidate("relief", "raster ready")
);
const layer = ViewportLayers.register({
  id: "relief",
  render: reconcileRelief,
  isActive: () => Layers.isOn("relief"),
  scaleSensitive: true
});

export function getReliefRenderStatus() {
  return {
    enabled: rasterEnabled,
    mode: rasterVisible ? "raster" : "SVG",
    editing,
    cacheBytes: raster.bytes,
    failed: raster.failed
  };
}

export function setReliefEditing(value: boolean): void {
  editing = value;
  if (value) raster.clear();
  layer.render();
}

function invalidateRaster(): void {
  raster.clear();
  rasterDefinitions = null;
  rasterSignature = "";
}

function tryRaster(terrain: Element, context: ViewportRenderContext): boolean {
  if (!rasterEnabled || editing || context.bounds.scale > 2 || !pack.relief?.length || raster.failed) return false;
  const definitions = document.querySelector("#defs-relief");
  if (!definitions) return false;
  const dpr = window.devicePixelRatio || 1;
  if (displayScale !== dpr) {
    invalidateRaster();
    displayScale = dpr;
  }
  const tiles = planReliefTiles(context.bounds, pack.relief, dpr);
  if (!tiles) {
    raster.clear();
    return false;
  }
  rasterDefinitions ??= definitions;
  const ready = raster.request(tiles);
  if (!ready) return false;
  const signature = ready.map(tile => tile.url).join("|");
  if (!rasterVisible || signature !== rasterSignature) {
    const fragment = document.createDocumentFragment();
    for (const tile of ready) {
      const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
      image.setAttribute("href", tile.url);
      image.setAttribute("x", String(tile.x));
      image.setAttribute("y", String(tile.y));
      image.setAttribute("width", String(TILE_SIZE));
      image.setAttribute("height", String(TILE_SIZE));
      image.setAttribute("preserveAspectRatio", "none");
      fragment.append(image);
    }
    terrain.replaceChildren(fragment);
    nodes.clear();
    lookup.clear();
    rasterSignature = signature;
  }
  rasterVisible = true;
  return true;
}

export function drawRelief(): void {
  if (!Layers.isOn("relief")) return void removeRelief();
  invalidateRaster();
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

export function removeRelief(): void {
  invalidateRaster();
  rasterVisible = false;
  nodes.clear();
  lookup.clear();
  owner = null;
  liveRoot = null;
  document.querySelector("#terrain")?.replaceChildren();
  // No relief-specific frame: the shared scheduler skips hidden work and direct draws consume it.
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
    nodes.clear();
    lookup.clear();
    terrain.replaceChildren();
    owner = pack;
    liveRoot = terrain;
  }

  if (tryRaster(terrain, context)) return;
  if (rasterVisible) {
    terrain.replaceChildren();
    rasterVisible = false;
    rasterSignature = "";
  }
  if (editing || context.bounds.scale > 2) raster.clear();

  const start = PerformanceMetrics.active ? performance.now() : 0;
  const source = pack.relief ?? [];
  const visible = source.filter(data => intersects(data, context.bounds));
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
  let cursor = terrain.firstElementChild;
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
      terrain.insertBefore(entry.node, cursor);
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
      live: terrain.childElementCount
    });
  }
}
