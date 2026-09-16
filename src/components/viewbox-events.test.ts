// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

const open = vi.hoisted(() => vi.fn());
vi.mock("@/controllers", () => ({ Controllers: { ReliefEditor: { open } } }));
vi.mock("./map-tooltip", () => ({ handleMouseMove: vi.fn() }));
vi.mock("./zoom", () => ({ applyZoomBehavior: vi.fn() }));
vi.mock("@/renderers/draw-legend", () => ({ dragLegendBox: vi.fn() }));

import { applyDefaultViewboxEvents } from "./viewbox-events";

afterEach(() => {
  open.mockClear();
  document.body.innerHTML = "";
});
it("opens the relief editor from a vector nested inside mixed-coverage clipping", () => {
  document.body.innerHTML =
    '<svg id="map"><g id="viewbox"><g id="terrain"><g clip-path="url(#missing)"><use data-id="relief-1" /></g></g></g></svg>';
  applyDefaultViewboxEvents();
  const icon = document.querySelector("use")!;
  icon.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(open).toHaveBeenCalledWith(icon);
});
it("still opens the editor from a cached image tile", () => {
  document.body.innerHTML = '<svg id="map"><g id="viewbox"><g id="terrain"><image /></g></g></svg>';
  applyDefaultViewboxEvents();
  const image = document.querySelector("image")!;
  image.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(open).toHaveBeenCalledWith(image);
});
