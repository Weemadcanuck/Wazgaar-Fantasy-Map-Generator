import { Layers } from "@/components/layers";
import type { ReliefIcon } from "@/generators/relief-generator";
import { PerformanceMetrics } from "@/renderers/viewport/performance-metrics";
import { Scene, ViewportLayers, type ViewportRenderContext } from "@/renderers/viewport/viewport-renderer";

interface ReliefSceneIcon {
  id: string;
  data: ReliefIcon;
}

const scene = new Scene<ReliefSceneIcon>();
const layer = ViewportLayers.register({ id: "relief", render: reconcileRelief, isActive: () => Layers.isOn("relief") });
let frameId: number | null = null;

export const drawRelief = (): void => {
  TIME && console.time("drawRelief");
  if (!pack.relief?.length) Relief.generate();
  const start = PerformanceMetrics.active ? performance.now() : 0;
  scene.replace(pack.relief.map((data, i) => ({ id: String(i), data })));
  if (PerformanceMetrics.active) {
    PerformanceMetrics.record({
      layer: "relief",
      reason: "direct draw",
      phase: "scene preparation",
      start,
      duration: performance.now() - start,
      scanned: pack.relief.length
    });
  }
  layer.render();
  TIME && console.timeEnd("drawRelief");
};

export const redrawRelief = (): void => {
  if (frameId !== null) return;
  frameId = requestAnimationFrame(() => {
    frameId = null;
    Layers.draw("relief");
  });
};

export const getSceneReliefIcon = (id: string): ReliefIcon | undefined => scene.get(id)?.data;

export function removeRelief(): void {
  scene.invalidate();
  document.querySelector("#terrain")?.replaceChildren();
}

function reconcileRelief(context: ViewportRenderContext): void {
  const terrain = context.root.querySelector("#terrain");
  if (!terrain) return;
  if (!scene.valid || !Layers.isOn("relief")) return void terrain.replaceChildren();

  const { x0, y0, x1, y1 } = context.bounds;
  const start = PerformanceMetrics.active ? performance.now() : 0;
  let scanned = 0;
  const markup: string[] = [];

  for (const { id, data } of scene.values()) {
    scanned++;
    const { icon, x, y, s } = data;
    if (x > x1 || y > y1 || x + s < x0 || y + s < y0) continue;
    markup.push(`<use href="#${icon}" data-id="${id}" x="${x}" y="${y}" width="${s}" height="${s}"/>`);
  }

  const queryEnd = PerformanceMetrics.active ? performance.now() : 0;
  const removed = PerformanceMetrics.active ? terrain.childElementCount : 0;
  terrain.innerHTML = markup.join("");
  if (PerformanceMetrics.active) {
    const reason = context.reason ?? "unknown";
    PerformanceMetrics.record({
      layer: "relief",
      reason,
      phase: "scan and markup",
      start,
      duration: queryEnd - start,
      scanned,
      candidates: scanned,
      emitted: markup.length
    });
    PerformanceMetrics.record({
      layer: "relief",
      reason,
      phase: "DOM",
      start: queryEnd,
      duration: performance.now() - queryEnd,
      created: markup.length,
      removed,
      retained: 0,
      updated: 0,
      moved: 0,
      live: terrain.childElementCount
    });
  }
}
