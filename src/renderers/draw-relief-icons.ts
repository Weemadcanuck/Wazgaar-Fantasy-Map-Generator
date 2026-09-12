import { Layers } from "@/components/layers";
import type { ReliefIcon } from "@/generators/relief-generator";
import { PerformanceMetrics } from "@/renderers/viewport/performance-metrics";
import {
  type ViewportBounds,
  ViewportLayers,
  type ViewportRenderContext
} from "@/renderers/viewport/viewport-renderer";

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
const layer = ViewportLayers.register({ id: "relief", render: reconcileRelief, isActive: () => Layers.isOn("relief") });

export function drawRelief(): void {
  if (!Layers.isOn("relief")) return void removeRelief();
  // An empty array is authored data. Only an absent field requests initial generation.
  if (!pack.relief) Relief.generate();
  layer.render();
}

export function redrawRelief(mutation: ReliefMutation = { type: "structure" }): void {
  // Read objects at flush time; edits do not rebuild a parallel scene or queue stale object snapshots.
  ViewportLayers.invalidate("relief", `edit ${mutation.type}`);
}

export function getSceneReliefIcon(id: string): ReliefIcon | undefined {
  if (owner !== pack || !Layers.isOn("relief")) return;
  const data = lookup.get(id);
  return data && pack.relief?.includes(data) ? data : undefined;
}

export function removeRelief(): void {
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
    nodes.clear();
    lookup.clear();
    terrain.replaceChildren();
    owner = pack;
    liveRoot = terrain;
  }

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
