// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  CACHE_BYTES,
  planReliefTiles,
  type RasterImage,
  ReliefRasterCache,
  type ReliefTile,
  reliefTileSvg
} from "./relief-raster";

const bounds = { scale: 1, x0: 0, y0: 0, x1: 500, y1: 500 };
const icons = [
  { icon: "mount", x: 250, y: 10, s: 20 },
  { icon: "tree", x: 1, y: 1, s: 5 }
];
const tile: ReliefTile = { key: "a", x: 0, y: 0, pixels: 512 };
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("relief raster lifecycle", () => {
  it("bounds tile requests and rejects oversized or invalid requests before allocation", () => {
    const result = planReliefTiles(bounds, icons, 1.625)!;
    expect(result).toHaveLength(2);
    expect(result[0].pixels).toBe(832);
    expect(result.length * result[0].pixels ** 2 * 4).toBeLessThanOrEqual(CACHE_BYTES);
    expect(planReliefTiles(bounds, icons, 10)).toBeNull();
    expect(planReliefTiles({ ...bounds, x1: 1e8, y1: 1e8 }, [{ icon: "x", x: 0, y: 0, s: 1e8 }], 2)).toBeNull();
    expect(planReliefTiles(bounds, [], 1)).toEqual([]);
  });

  it("builds sequentially, reuses ready tiles and disposes evicted tiles", async () => {
    const dispose = vi.fn();
    const build = vi.fn(async () => ({ url: "blob:tile", dispose }));
    const ready = vi.fn();
    const cache = new ReliefRasterCache(build, ready);
    const other = { ...tile, key: "b", x: 256 };
    expect(cache.request([tile, other])).toBeNull();
    expect(build).toHaveBeenCalledTimes(1);
    await flush();
    expect(build).toHaveBeenCalledTimes(2);
    expect(cache.request([tile, other])).toHaveLength(2);
    expect(build).toHaveBeenCalledTimes(2);
    cache.request([tile]);
    expect(dispose).toHaveBeenCalledTimes(1);
    cache.clear();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(cache.bytes).toBe(0);
  });

  it("discards obsolete completions after reset and services the new request", async () => {
    const pending: Array<(image: RasterImage) => void> = [];
    const signals: AbortSignal[] = [];
    const ready = vi.fn();
    const cache = new ReliefRasterCache((_tile, signal) => {
      signals.push(signal);
      return new Promise(resolve => pending.push(resolve));
    }, ready);
    cache.request([tile]);
    cache.clear();
    expect(signals[0].aborted).toBe(true);
    cache.request([{ ...tile, key: "new" }]);
    const dispose = vi.fn();
    pending.shift()!({ url: "blob:old", dispose });
    await flush();
    expect(dispose).toHaveBeenCalledOnce();
    expect(ready).not.toHaveBeenCalled();
    pending.shift()!({ url: "blob:new", dispose: vi.fn() });
    await flush();
    expect(cache.request([{ ...tile, key: "new" }])?.[0].url).toBe("blob:new");
    cache.clear();
  });

  it("falls back on decode failure without retrying every frame", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const build = vi.fn(async () => {
      throw new Error("decode failed");
    });
    const cache = new ReliefRasterCache(build, vi.fn());
    cache.request([tile]);
    await flush();
    expect(cache.failed).toBe(true);
    cache.request([tile]);
    expect(build).toHaveBeenCalledOnce();
    cache.clear();
    expect(cache.failed).toBe(false);
    vi.restoreAllMocks();
  });

  it("includes crossing icons in both tiles in source order and keeps a sampling gutter", () => {
    document.body.innerHTML =
      '<svg><g id="defs-relief"><symbol id="mount" viewBox="0 0 10 10"><path d="M0 0L10 10" /></symbol></g></svg>';
    const definitions = document.querySelector("#defs-relief")!;
    const svg = new DOMParser().parseFromString(reliefTileSvg(tile, icons, definitions), "image/svg+xml");
    expect([...svg.querySelectorAll("use")].map(node => node.getAttribute("href"))).toEqual(["#mount", "#tree"]);
    expect(svg.documentElement.getAttribute("width")).toBe("516");
    const next = new DOMParser().parseFromString(
      reliefTileSvg({ ...tile, x: 256 }, icons, definitions),
      "image/svg+xml"
    );
    expect(next.querySelectorAll("use")).toHaveLength(1);
    expect(definitions.querySelector("symbol")).not.toBeNull();
  });
});
