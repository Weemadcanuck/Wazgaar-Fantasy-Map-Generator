// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coastalTileSvg,
  getCoastalRenderStatus,
  invalidateCoastalRaster,
  restoreCoastalVectors
} from "./coastal-raster";
import { rasterizeSvgTile } from "./svg-raster";
import { ViewportLayers } from "./viewport/viewport-renderer";

vi.mock("./viewport/viewport-renderer", () => ({
  ViewportLayers: {
    register: vi.fn(),
    invalidate: vi.fn(),
    getVisibleBounds: () => ({ scale: 1, x0: 0, y0: 0, x1: 250, y1: 250 })
  }
}));
vi.mock("./svg-raster", async importOriginal => ({
  ...(await importOriginal<typeof import("./svg-raster")>()),
  rasterizeSvgTile: vi.fn(async () => ({ url: "blob:coast", dispose: vi.fn() }))
}));

const bounds = { scale: 1, x0: 0, y0: 0, x1: 250, y1: 250 };
const render = () => vi.mocked(ViewportLayers.register).mock.calls[0][0].render({ root: document, bounds });
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

beforeEach(() => {
  invalidateCoastalRaster();
  vi.mocked(rasterizeSvgTile).mockClear();
  vi.stubGlobal("customization", 0);
  vi.stubGlobal("options", { map: { graph: { width: 512, height: 512 } } });
  bounds.scale = 1;
  document.body.innerHTML = `<svg><defs><g id="featurePaths"><path id="feature_1" d="M0 0L20 0L20 20Z" /></g>
    <mask id="coastal-bands-mask"><use href="#feature_1" /></mask><mask id="coastal-bands-lines" />
    <mask id="coastal-bands-shade" /></defs><g id="oceanBands" mask="url(#coastal-bands-mask)" opacity="0.7">
    <rect data-band="shade" width="512" height="512" mask="url(#coastal-bands-shade)" />
    <rect width="512" height="512" mask="url(#coastal-bands-lines)" /></g></svg>`;
});

describe("coastal raster cache", () => {
  it("waits for complete coverage, retains vectors and restores export clones without changing the live cache", async () => {
    const original = document.getElementById("oceanBands")!.cloneNode(true);
    render();
    expect(document.querySelector("[data-coastal-tile]")).toBeNull();
    await flush();
    render();
    const group = document.getElementById("oceanBands")!;
    expect(group.querySelector("image")?.getAttribute("href")).toBe("blob:coast");
    expect(group.getAttribute("opacity")).toBe("0.7");
    expect(group.hasAttribute("mask")).toBe(false);
    const source = vi.mocked(rasterizeSvgTile).mock.calls[0][0];
    expect(source).toContain('id="feature_1"');
    expect(source).not.toContain('opacity="0.7"');
    const clone = document.querySelector("svg")!.cloneNode(true) as Element;
    restoreCoastalVectors(clone);
    expect(clone.querySelector("#oceanBands")!.isEqualNode(original)).toBe(true);
    expect(group.querySelector("image")).not.toBeNull();
    expect(getCoastalRenderStatus().mode).toBe("raster");
  });

  it("reuses coverage after close zoom and disposes it when coastline geometry changes", async () => {
    render();
    await flush();
    render();
    const result = await vi.mocked(rasterizeSvgTile).mock.results[0].value;
    bounds.scale = 3;
    render();
    expect(document.querySelector("[data-coastal-tile]")).toBeNull();
    bounds.scale = 1;
    render();
    expect(rasterizeSvgTile).toHaveBeenCalledOnce();
    document.getElementById("feature_1")!.setAttribute("d", "M0 0L50 0L50 50Z");
    invalidateCoastalRaster();
    render();
    await flush();
    render();
    expect(result.dispose).toHaveBeenCalledOnce();
    expect(vi.mocked(rasterizeSvgTile).mock.calls[1][0]).toContain("M0 0L50 0L50 50Z");
  });

  it("includes a sampling gutter and restores vectors immediately when invalidated", async () => {
    const svg = coastalTileSvg({ key: "tile", x: 256, y: 512, pixels: 512 }, "<defs />");
    expect(svg).toContain('width="516"');
    expect(svg).toContain('viewBox="255 511 258 258"');
    render();
    await flush();
    render();
    invalidateCoastalRaster();
    expect(document.querySelectorAll("#oceanBands > rect")).toHaveLength(2);
    expect(document.querySelector("[data-coastal-tile]")).toBeNull();
    expect(getCoastalRenderStatus().cacheBytes).toBe(0);
  });
});
