import type { CustomPointEntity, CustomPointLayer } from "@/types/custom-layers";
import { ensureEl, findEl, rn } from "@/utils";

const SVG_NS = "http://www.w3.org/2000/svg";
const safeColor = (value: string | undefined, fallback: string) =>
  value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
const isImageIcon = (value: string) => /^(https?:\/\/|data:image\/)/i.test(value);

function getPointSize(layer: CustomPointLayer): number {
  const size = layer.size ?? 30;
  return layer.resizeOnZoom === false ? size : Math.max(rn(size / 5 + 24 / scale, 2), 1);
}

function positionPoint(point: SVGSVGElement, entity: CustomPointEntity, size: number): void {
  point.setAttribute("width", String(size));
  point.setAttribute("height", String(size));
  point.setAttribute("x", String(rn(entity.x - size / 2, 1)));
  point.setAttribute("y", String(rn(entity.y - size, 1)));
}

function drawPoint(layer: CustomPointLayer, entity: CustomPointEntity): SVGSVGElement {
  const size = getPointSize(layer);
  const point = document.createElementNS(SVG_NS, "svg");
  point.dataset.customLayerId = layer.id;
  point.dataset.customPointId = entity.id;
  point.setAttribute("viewBox", "0 0 30 30");
  positionPoint(point, entity, size);
  point.setAttribute("aria-label", entity.name);
  point.style.overflow = "visible";

  const iconValue = entity.icon || layer.icon;
  if (isImageIcon(iconValue)) {
    const icon = document.createElementNS(SVG_NS, "image");
    icon.setAttribute("x", "3");
    icon.setAttribute("y", "1");
    icon.setAttribute("width", "24");
    icon.setAttribute("height", "24");
    icon.setAttribute("href", iconValue);
    icon.setAttribute("preserveAspectRatio", "xMidYMid meet");
    point.append(icon);
  } else {
    const icon = document.createElementNS(SVG_NS, "text");
    icon.setAttribute("x", "50%");
    icon.setAttribute("y", "48%");
    icon.setAttribute("font-size", "22px");
    icon.setAttribute("text-anchor", "middle");
    icon.setAttribute("dominant-baseline", "middle");
    icon.setAttribute("fill", safeColor(entity.color, safeColor(layer.color, "#7c4d8b")));
    icon.textContent = iconValue;
    point.append(icon);
  }
  return point;
}

export function resizeCustomPoints(): void {
  const root = findEl<SVGGElement>("customPoints");
  if (!root) return;
  const points = new Map(
    Array.from(root.querySelectorAll<SVGSVGElement>("[data-custom-point-id]")).map(point => [
      point.dataset.customPointId,
      point
    ])
  );

  for (const layer of pack.customLayers ?? []) {
    const size = getPointSize(layer);
    for (const entity of layer.entities) {
      const point = points.get(entity.id);
      if (point) positionPoint(point, entity, size);
    }
  }
}

export function drawCustomPoints(): void {
  const root = ensureEl<SVGGElement>("customPoints");
  root.replaceChildren();

  for (const layer of pack.customLayers ?? []) {
    const group = document.createElementNS(SVG_NS, "g");
    group.dataset.customLayerId = layer.id;
    group.style.display = layer.visible ? "" : "none";
    group.append(...layer.entities.map(entity => drawPoint(layer, entity)));
    root.append(group);
  }
}
