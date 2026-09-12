import { getPin } from "@/renderers/draw-markers";
import type { CustomPointEntity, CustomPointLayer } from "@/types/custom-layers";
import { ensureEl, rn } from "@/utils";

const SVG_NS = "http://www.w3.org/2000/svg";
const safeColor = (value: string | undefined, fallback: string) =>
  value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;

function drawPoint(layer: CustomPointLayer, entity: CustomPointEntity): SVGSVGElement {
  const size = Math.max(rn(6 + 24 / scale, 2), 1);
  const point = document.createElementNS(SVG_NS, "svg");
  point.dataset.customLayerId = layer.id;
  point.dataset.customPointId = entity.id;
  point.setAttribute("viewBox", "0 0 30 30");
  point.setAttribute("width", String(size));
  point.setAttribute("height", String(size));
  point.setAttribute("x", String(rn(entity.x - size / 2, 1)));
  point.setAttribute("y", String(rn(entity.y - size, 1)));
  point.setAttribute("aria-label", entity.name);

  const pin = document.createElementNS(SVG_NS, "g");
  pin.innerHTML = getPin("diamond", "#ffffff", safeColor(entity.color, safeColor(layer.color, "#7c4d8b")));
  point.append(pin);

  const icon = document.createElementNS(SVG_NS, "text");
  icon.setAttribute("x", "50%");
  icon.setAttribute("y", "52%");
  icon.setAttribute("font-size", "12px");
  icon.setAttribute("text-anchor", "middle");
  icon.setAttribute("dominant-baseline", "middle");
  icon.textContent = entity.icon || layer.icon;
  point.append(icon);
  return point;
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
