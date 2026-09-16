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
    expect(result[0].pixels).toBe(416);
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
    expect(dispose).not.toHaveBeenCalled();
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

it("fits the observed distant high-DPR viewport without undersampling", () => {
  const view = { scale: 1, x0: 398, y0: 176, x1: 1629, y1: 946 };
  const source = [{ icon: "x", x: 0, y: 0, s: 2048 }];
  const tiles = planReliefTiles(view, source, 2.6)!;
  expect(tiles).toHaveLength(24);
  expect(tiles[0].pixels).toBe(666);
  expect(tiles.length * 666 ** 2 * 4).toBe(42581376);
  for (const zoom of [0.8, 1, 1.01, 1.5, 1.51, 2]) {
    const result = planReliefTiles({ ...bounds, scale: zoom }, icons, 2.6)!;
    expect(result[0].pixels / 256).toBeGreaterThanOrEqual(zoom * 2.6);
  }
});

it("evicts least-recently-used unrequested tiles only when allocation requires it", async () => {
  const freed: string[] = [];
  const build = vi.fn(async (tile: ReliefTile) => ({ url: tile.key, dispose: () => freed.push(tile.key) }));
  const cache = new ReliefRasterCache(build, vi.fn());
  const count = CACHE_BYTES / (2048 ** 2 * 4);
  const tiles = Array.from({ length: count }, (_, i) => ({ ...tile, key: String(i), pixels: 2048 }));
  cache.request(tiles);
  for (let i = 0; i < count + 2; i++) await flush();
  expect(cache.bytes).toBe(CACHE_BYTES);
  cache.pause();
  expect(cache.request([tiles[0]])).toHaveLength(1);
  expect(build).toHaveBeenCalledTimes(count);
  cache.request([tiles[0], { ...tiles[0], key: "new" }]);
  await flush();
  expect(freed).toEqual(["1"]);
  expect(cache.bytes).toBe(CACHE_BYTES);
  cache.clear();
});

it("omits unused self-contained symbols but retains dependencies for referenced artwork", () => {
  document.body.innerHTML =
    '<svg><g id="defs-relief"><symbol id="mount"><path /></symbol><symbol id="unused"><path /></symbol></g></svg>';
  const defs = document.querySelector("#defs-relief")!;
  const source = [{ icon: "mount", x: 0, y: 0, s: 20 }];
  expect(reliefTileSvg(tile, source, defs)).not.toContain('id="unused"');
  defs.querySelector("#mount")!.innerHTML = '<use href="#unused" />';
  expect(reliefTileSvg(tile, source, defs)).toContain('id="unused"');
});

it("reuses the smallest adequate sharper tile immediately without decoding a lower-resolution replacement", async () => {
  const build = vi.fn(async (tile: ReliefTile) => ({ url: tile.key, dispose: vi.fn() }));
  const cache = new ReliefRasterCache(build, vi.fn());
  const high = { ...tile, key: "high", pixels: 1024 };
  const medium = { ...tile, key: "medium", pixels: 768 };
  cache.request([high]);
  await flush();
  // A smaller request reuses the high tile without allocating or waiting.
  const beforeBytes = cache.bytes;
  expect(cache.request([medium])?.[0]).toMatchObject({ url: "high", sourcePixels: 1024 });
  expect(cache.request([tile])?.[0].url).toBe("high");
  expect(cache.bytes).toBe(beforeBytes);
  expect(cache.progress.reusedHigherResolution).toBe(1);
  expect(build).toHaveBeenCalledTimes(1);
  cache.request([{ ...tile, key: "larger", pixels: 1280 }]);
  await flush();
  expect(build).toHaveBeenCalledTimes(2);
  cache.clear();
});

it("does not pin sharper tiles that would prevent completing the visible request within budget", async () => {
  const build = vi.fn(async (tile: ReliefTile) => ({ url: tile.key, dispose: vi.fn() }));
  const cache = new ReliefRasterCache(build, vi.fn(), 128 * 1024 * 1024);
  const high = Array.from({ length: 8 }, (_, i) => ({ ...tile, key: `high-${i}`, x: i * 256, pixels: 2048 }));
  cache.request(high);
  for (let i = 0; i < 10; i++) await flush();
  const low = Array.from({ length: 9 }, (_, i) => ({ ...tile, key: `low-${i}`, x: i * 256, pixels: 1024 }));
  expect(cache.request(low)).toBeNull();
  for (let i = 0; i < 10; i++) await flush();
  expect(cache.failed).toBe(false);
  expect(cache.request(low)).toHaveLength(9);
  expect(cache.bytes).toBeLessThanOrEqual(128 * 1024 * 1024);
  expect(build.mock.calls.length).toBeLessThan(17); // reuse still avoids most of the original nine new decodes
  cache.clear();
});

it("keeps a recently revisited tile after leaving its view and reports eviction", async () => {
  const disposed: string[] = [];
  const build = vi.fn(async (tile: ReliefTile) => ({ url: tile.key, dispose: () => disposed.push(tile.key) }));
  const cache = new ReliefRasterCache(build, vi.fn(), 2 * 512 ** 2 * 4);
  const a = { ...tile, key: "a", x: 0 };
  const b = { ...tile, key: "b", x: 256 };
  const c = { ...tile, key: "c", x: 512 };
  cache.request([a, b]);
  await flush();
  cache.request([a]);
  cache.pause();
  cache.request([c]);
  await flush();
  expect(disposed).toEqual(["b"]);
  expect(cache.request([a])).toHaveLength(1);
  expect(build).toHaveBeenCalledTimes(3);
  expect(cache.diagnostics).toMatchObject({ tilesBuilt: 3, tilesEvicted: 1, cacheHits: 2, cacheMisses: 3 });
  cache.clear();
  expect(cache.diagnostics).toMatchObject({ tilesBuilt: 0, tilesEvicted: 0, cacheHits: 0, cacheMisses: 0 });
});
