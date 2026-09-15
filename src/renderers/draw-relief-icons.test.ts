// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReliefIcon } from "@/generators/relief-generator";

const state = vi.hoisted(() => ({ active: true }));
vi.mock("@/components/layers", () => ({ Layers: { isOn: () => state.active } }));

import { restoreReliefData, serializeReliefData } from "@/services/io/relief-data";
import {
  drawRelief,
  getReliefRenderStatus,
  getSceneReliefIcon,
  redrawRelief,
  removeRelief,
  renderReliefForExport,
  setReliefEditing
} from "./draw-relief-icons";
import * as rasterTools from "./relief/relief-raster";
import { PerformanceMetrics } from "./viewport/performance-metrics";
import { ViewportLayers } from "./viewport/viewport-renderer";

let queued: Map<number, FrameRequestCallback>;
const icon = (x: number): ReliefIcon => ({ icon: "relief-mount-1", x, y: 10, s: 10 });
const terrain = () => document.querySelector("#terrain")!;
const elements = () => [...terrain().querySelectorAll("use")];
const full = { scale: 1, x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };

function tick(): void {
  const pending = [...queued.values()];
  queued.clear();
  for (const callback of pending) callback(performance.now());
}

beforeEach(() => {
  queued = new Map();
  let frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queued.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queued.delete(id));
  document.body.innerHTML = '<svg id="map"><g id="terrain"></g></svg>';
  for (const [name, value] of Object.entries({
    pack: { relief: [icon(5), icon(45), icon(95), icon(250)] },
    scale: 1,
    viewX: 0,
    viewY: 0,
    svgWidth: 100,
    svgHeight: 100,
    Relief: {
      generate: vi.fn(() => {
        pack.relief = [icon(10)];
      })
    }
  }))
    vi.stubGlobal(name, value);
  state.active = false;
  removeRelief();
  ViewportLayers.flush();
  state.active = true;
});

afterEach(() => {
  if (PerformanceMetrics.active) PerformanceMetrics.stop();
  state.active = false;
  removeRelief();
  ViewportLayers.flush();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("keyed relief rendering", () => {
  it("retains overlapping nodes on a guard-crossing pan, creating and removing only boundary icons", () => {
    drawRelief();
    const [a, b, c] = elements();
    PerformanceMetrics.start();
    viewX = -100;
    ViewportLayers.schedule();
    tick();
    const result = PerformanceMetrics.stop();
    expect(elements()[0]).toBe(b);
    expect(elements()[1]).toBe(c);
    expect(a.isConnected).toBe(false);
    expect(result.records.find(record => record.phase === "DOM")).toMatchObject({
      created: 1,
      removed: 1,
      retained: 2,
      updated: 0,
      moved: 0,
      live: 3
    });
  });

  it("retains every node without attribute writes when a full-map view is redrawn", () => {
    pack.relief = Array.from({ length: 2000 }, (_, i) => icon(i / 20));
    drawRelief();
    const initial = elements();
    const observer = new MutationObserver(() => {});
    observer.observe(terrain(), { attributes: true, childList: true, subtree: true });
    redrawRelief();
    tick();
    expect(elements()).toEqual(initial);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it("updates geometry and appearance without rebuilding unrelated nodes", () => {
    drawRelief();
    const [a, b, c] = elements();
    pack.relief[1].x = 55;
    pack.relief[1].s = 20;
    pack.relief[1].icon = "relief-hill-2";
    redrawRelief({ type: "geometry", icon: pack.relief[1] });
    redrawRelief({ type: "appearance", icon: pack.relief[1] });
    tick();
    expect(elements()).toEqual([a, b, c]);
    expect(b.getAttribute("href")).toBe("#relief-hill-2");
    expect(b.getAttribute("x")).toBe("55");
    expect(b.getAttribute("width")).toBe("20");
    expect(b.getAttribute("height")).toBe("20");
    expect(getSceneReliefIcon(b.dataset.id!)).toBe(pack.relief[1]);
  });

  it("preserves identity through leaving and re-entering the viewport", () => {
    drawRelief();
    const first = pack.relief[0];
    const id = elements()[0].dataset.id!;
    first.x = 500;
    redrawRelief({ type: "geometry", icon: first });
    tick();
    expect(getSceneReliefIcon(id)).toBeUndefined();
    first.x = 10;
    redrawRelief({ type: "geometry", icon: first });
    tick();
    expect(elements()[0].dataset.id).toBe(id);
    expect(getSceneReliefIcon(id)).toBe(first);
  });

  it("preserves exact source order and object lookup for front/back edits", () => {
    pack.relief = pack.relief.slice(0, 3);
    drawRelief();
    const [a, b, c] = elements();
    pack.relief.push(pack.relief.shift()!);
    redrawRelief({ type: "order" });
    tick();
    expect(elements()).toEqual([b, c, a]);
    pack.relief.unshift(pack.relief.pop()!);
    redrawRelief({ type: "order" });
    tick();
    expect(elements()).toEqual([a, b, c]);
    expect(getSceneReliefIcon(a.dataset.id!)).toBe(pack.relief[0]);
  });

  it("inserts a new icon between existing nodes without moving those nodes", () => {
    drawRelief();
    const before = elements();
    PerformanceMetrics.start();
    pack.relief.splice(1, 0, icon(20));
    redrawRelief();
    tick();
    const result = PerformanceMetrics.stop();
    expect(elements().filter(node => before.includes(node))).toEqual(before);
    expect(result.records.find(record => record.phase === "DOM")).toMatchObject({ created: 1, moved: 0, retained: 3 });
  });

  it("rejects a deleted icon before its queued redraw and keeps repeated toggles bounded", () => {
    drawRelief();
    const removedId = elements()[0].dataset.id!;
    pack.relief.shift();
    redrawRelief();
    expect(getSceneReliefIcon(removedId)).toBeUndefined();
    tick();
    for (let i = 0; i < 20; i++) {
      const id = elements()[0].dataset.id!;
      state.active = false;
      removeRelief();
      expect(getSceneReliefIcon(id)).toBeUndefined();
      expect(elements()).toHaveLength(0);
      state.active = true;
      drawRelief();
      expect(elements()).toHaveLength(2);
      expect(elements()[0].dataset.id).toBe(id);
    }
  });

  it("preserves intentional deletion of all icons through redraw, save and reload", () => {
    drawRelief();
    pack.relief = [];
    redrawRelief();
    tick();
    const saved = serializeReliefData(pack.relief);
    removeRelief();
    restoreReliefData(pack, saved);
    drawRelief();
    expect(elements()).toHaveLength(0);
    expect(Relief.generate).not.toHaveBeenCalled();
    expect(saved).toBe("[]");
  });

  it("generates missing legacy/new-map relief once, including after saving uninitialized data", () => {
    restoreReliefData(pack, undefined);
    const saved = serializeReliefData(pack.relief);
    restoreReliefData(pack, saved);
    drawRelief();
    drawRelief();
    expect(Relief.generate).toHaveBeenCalledOnce();
    expect(elements()).toHaveLength(1);
  });

  it("releases hidden nodes/lookup and consumes pending work on rapid hide/show", () => {
    drawRelief();
    const first = elements()[0];
    const id = first.dataset.id!;
    redrawRelief();
    state.active = false;
    removeRelief();
    expect(elements()).toHaveLength(0);
    expect(getSceneReliefIcon(id)).toBeUndefined();
    state.active = true;
    drawRelief();
    const restored = elements()[0];
    expect(restored).not.toBe(first);
    expect(restored.dataset.id).toBe(id);
    const observer = new MutationObserver(() => {});
    observer.observe(terrain(), { childList: true });
    tick();
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it("drops old-map identities when an edit is pending at map replacement", () => {
    drawRelief();
    const old = elements()[0];
    const oldId = old.dataset.id!;
    redrawRelief();
    vi.stubGlobal("pack", { relief: [icon(5)] });
    expect(getSceneReliefIcon(oldId)).toBeUndefined();
    drawRelief();
    tick();
    expect(elements()).toHaveLength(1);
    expect(elements()[0]).not.toBe(old);
    expect(elements()[0].dataset.id).not.toBe(oldId);
    expect(getSceneReliefIcon(oldId)).toBeUndefined();
  });

  it("rebuilds the cache when the live SVG root is replaced", () => {
    drawRelief();
    const old = elements()[0];
    document.body.innerHTML = '<svg><g id="terrain"></g></svg>';
    drawRelief();
    expect(elements()).toHaveLength(3);
    expect(elements()[0]).not.toBe(old);
  });

  it("exports all source icons and pending edits without touching live nodes", () => {
    drawRelief();
    const before = elements();
    const clone = document.querySelector("svg")!.cloneNode(true) as SVGSVGElement;
    pack.relief[0].x = 15;
    pack.relief.push(icon(600));
    redrawRelief();
    ViewportLayers.renderTo(clone);
    expect(clone.querySelectorAll("use")).toHaveLength(5);
    expect(clone.querySelector("use")!.getAttribute("x")).toBe("15");
    expect(clone.querySelector("[data-id]")).toBeNull();
    expect(elements()).toEqual(before);
    expect(before[0].getAttribute("x")).toBe("5");
    tick();
    expect(elements()[0]).toBe(before[0]);
    expect(before[0].getAttribute("x")).toBe("15");
  });

  it("exports viewport relief intersecting an edge and respects hidden-layer state", () => {
    pack.relief = [icon(-5), icon(95), icon(250)];
    drawRelief();
    const clone = document.querySelector("svg")!.cloneNode(true) as SVGSVGElement;
    renderReliefForExport(clone);
    expect(clone.querySelectorAll("use")).toHaveLength(2);
    state.active = false;
    renderReliefForExport(clone, full);
    expect(clone.querySelectorAll("use")).toHaveLength(0);
  });
});

describe("distant raster integration", () => {
  it.each([
    "unchanged",
    "geometry",
    "symbols",
    "map",
    "root"
  ])("retains hidden tiles only when valid: %s", async change => {
    document.querySelector("svg")!.insertAdjacentHTML("afterbegin", '<defs><g id="defs-relief" /></defs>');
    const dispose = vi.fn();
    const build = vi.spyOn(rasterTools, "rasterizeReliefTile").mockResolvedValue({ url: "blob:tile", dispose });
    drawRelief();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    tick();
    expect(getReliefRenderStatus().mode).toBe("raster");
    const count = build.mock.calls.length;
    const bytes = getReliefRenderStatus().cacheBytes;
    state.active = false;
    removeRelief();
    expect(terrain().childElementCount).toBe(0);
    expect(getReliefRenderStatus().cacheBytes).toBe(bytes);
    expect(dispose).not.toHaveBeenCalled();
    if (change === "geometry") pack.relief[0].s += 5;
    if (change === "symbols") document.querySelector("#defs-relief")!.setAttribute("fill", "red");
    if (change === "map") vi.stubGlobal("pack", { relief: [...pack.relief] });
    if (change === "root") terrain().replaceWith(terrain().cloneNode());
    state.active = true;
    drawRelief();
    if (change === "unchanged") {
      expect(getReliefRenderStatus().mode).toBe("raster");
      expect(build).toHaveBeenCalledTimes(count);
      expect(dispose).not.toHaveBeenCalled();
    } else {
      expect(dispose).toHaveBeenCalled();
      expect(build.mock.calls.length).toBeGreaterThan(count);
    }
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

  it("switches atomically to raster, exports vectors, and restores individual editing", async () => {
    document
      .querySelector("svg")!
      .insertAdjacentHTML(
        "afterbegin",
        '<defs><g id="defs-relief"><symbol id="relief-mount-1" viewBox="0 0 10 10"><path d="M0 0L10 10" /></symbol></g></defs>'
      );
    const dispose = vi.fn();
    vi.spyOn(rasterTools, "rasterizeReliefTile").mockResolvedValue({ url: "blob:tile", dispose });
    drawRelief();
    expect(elements().length).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    tick();
    expect(getReliefRenderStatus().mode).toBe("raster");
    expect(terrain().querySelectorAll("image").length).toBeGreaterThan(0);
    expect(elements()).toHaveLength(0);
    const clone = document.querySelector("svg")!.cloneNode(true) as SVGSVGElement;
    renderReliefForExport(clone, full);
    expect(clone.querySelectorAll("#terrain use")).toHaveLength(pack.relief.length);
    expect(clone.querySelectorAll("#terrain image")).toHaveLength(0);
    expect(terrain().querySelectorAll("image").length).toBeGreaterThan(0);
    setReliefEditing(true);
    expect(getReliefRenderStatus().mode).toBe("SVG");
    expect(elements().length).toBeGreaterThan(0);
    expect(dispose).not.toHaveBeenCalled();
    expect(getSceneReliefIcon((elements()[0] as SVGUseElement).dataset.id!)).toBe(pack.relief[0]);
    pack.relief[0].x += 2;
    redrawRelief({ type: "geometry", icon: pack.relief[0] });
    expect(dispose).toHaveBeenCalled();
    state.active = false;
    setReliefEditing(false);
  });

  it("returns to SVG on close zoom even while inside existing viewport coverage", async () => {
    document.querySelector("svg")!.insertAdjacentHTML("afterbegin", '<defs><g id="defs-relief" /></defs>');
    vi.spyOn(rasterTools, "rasterizeReliefTile").mockResolvedValue({ url: "blob:tile", dispose: vi.fn() });
    drawRelief();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    tick();
    expect(getReliefRenderStatus().mode).toBe("raster");
    scale = 3;
    ViewportLayers.schedule();
    tick();
    expect(getReliefRenderStatus().mode).toBe("SVG");
    expect(getReliefRenderStatus().cacheBytes).toBeGreaterThan(0);
    expect(elements().length).toBeGreaterThan(0);
    const builds = vi.mocked(rasterTools.rasterizeReliefTile).mock.calls.length;
    PerformanceMetrics.start();
    scale = 1;
    ViewportLayers.schedule();
    tick();
    expect(getReliefRenderStatus().mode).toBe("raster");
    expect(vi.mocked(rasterTools.rasterizeReliefTile).mock.calls).toHaveLength(builds);
    const report = PerformanceMetrics.stop();
    expect(report.records.find(record => record.phase === "display")).toMatchObject({
      mode: "raster",
      reason: "ready"
    });
    expect(document.getElementById("reliefRenderStatus")?.textContent).toBe("Relief: raster");
  });
});

it("retains cached tiles while the missing-region batch builds, without per-tile handoffs", async () => {
  document.querySelector("svg")!.insertAdjacentHTML("afterbegin", '<defs><g id="defs-relief" /></defs>');
  svgWidth = 200;
  svgHeight = 100;
  pack.relief = [icon(5), icon(250), icon(300)];
  const pending: Array<(image: rasterTools.RasterImage) => void> = [];
  vi.spyOn(rasterTools, "rasterizeReliefTile").mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  drawRelief();
  expect(getReliefRenderStatus().mode).toBe("SVG");
  expect(pending).toHaveLength(1);
  pending.shift()!({ url: "blob:first", dispose: vi.fn() });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  tick();
  expect(getReliefRenderStatus().mode).toBe("raster");
  const cachedImage = terrain().querySelector("image");
  svgWidth = 512;
  ViewportLayers.schedule();
  tick();
  expect(getReliefRenderStatus().mode).toBe("mixed");
  expect(terrain().querySelector("image")).toBe(cachedImage);
  const image = terrain().querySelector("image")!;
  expect(image.getAttribute("href")).toBe("blob:first");
  expect(terrain().querySelectorAll("defs rect")).toHaveLength(1);
  const clipX = Number(terrain().querySelector("defs rect")!.getAttribute("x"));
  expect(elements().map(node => Number(node.getAttribute("x")))).toEqual(clipX === 0 ? [5, 250] : [250, 300]);
  const clone = document.querySelector("svg")!.cloneNode(true) as SVGSVGElement;
  renderReliefForExport(clone, full);
  expect(clone.querySelectorAll("#terrain use")).toHaveLength(3);
  expect(clone.querySelectorAll("#terrain defs, #terrain image")).toHaveLength(0);
  const selected = elements()[0] as SVGUseElement;
  expect(getSceneReliefIcon(selected.dataset.id!)).toBeDefined();
  expect(pending).toHaveLength(1); // no third tile or prefetch was introduced
  pending.shift()!({ url: "blob:second", dispose: vi.fn() });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  tick();
  expect(getReliefRenderStatus().mode).toBe("raster");
  expect(terrain().querySelector('image[href="blob:first"]')).toBe(image);
  expect(terrain().querySelectorAll("defs rect, use")).toHaveLength(0);
  expect(vi.mocked(rasterTools.rasterizeReliefTile)).toHaveBeenCalledTimes(2);
});

it("does not update clipping for intermediate completions while a mixed batch is loading", async () => {
  document.querySelector("svg")!.insertAdjacentHTML("afterbegin", '<defs><g id="defs-relief" /></defs>');
  svgWidth = 200;
  svgHeight = 100;
  pack.relief = [icon(5), icon(300), icon(550)];
  const pending: Array<(image: rasterTools.RasterImage) => void> = [];
  vi.spyOn(rasterTools, "rasterizeReliefTile").mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  drawRelief();
  pending.shift()!({ url: "blob:cached", dispose: vi.fn() });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  tick();
  svgWidth = 700;
  ViewportLayers.schedule();
  tick();
  expect(getReliefRenderStatus()).toMatchObject({ mode: "mixed", displayedRasterTiles: 1, requested: 3 });
  const before = terrain().innerHTML;
  pending.shift()!({ url: "blob:new-one", dispose: vi.fn() });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  tick();
  expect(terrain().innerHTML).toBe(before);
  expect(getReliefRenderStatus()).toMatchObject({ mode: "mixed", displayedRasterTiles: 1, ready: 2 });
  pending.shift()!({ url: "blob:new-two", dispose: vi.fn() });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  tick();
  expect(getReliefRenderStatus()).toMatchObject({ mode: "raster", displayedRasterTiles: 3, ready: 3 });
});
