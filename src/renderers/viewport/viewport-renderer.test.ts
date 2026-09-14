// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewportRenderer } from "./viewport-renderer";

let viewport: { scale: number; x: number; y: number; width: number; height: number };
let renderer: ViewportRenderer;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

function tick(): void {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(0);
}

beforeEach(() => {
  viewport = { scale: 1, x: 0, y: 0, width: 100, height: 100 };
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  renderer = new ViewportRenderer({ getViewport: () => viewport, overscanPixels: 80, guardPixels: 40 });
});

afterEach(() => vi.unstubAllGlobals());

describe("independent viewport scheduling", () => {
  it("crosses guards independently and coalesces requests using the latest viewport", () => {
    const relief = vi.fn();
    const labels = vi.fn();
    renderer.register({ id: "relief", render: relief });
    renderer.register({ id: "labels", render: labels, overscanPixels: 200 });
    renderer.flush();
    relief.mockClear();
    labels.mockClear();
    viewport.x = -50;
    renderer.schedule();
    viewport.x = -100;
    renderer.schedule();
    expect(frames.size).toBe(1);
    tick();
    expect(relief).toHaveBeenCalledOnce();
    expect(relief.mock.calls[0][0].bounds.x0).toBe(20);
    expect(labels).not.toHaveBeenCalled();
    renderer.flush();
    expect(relief).toHaveBeenCalledOnce();
  });

  it("does not scan or render layers for a pan inside coverage, including gesture end", () => {
    const render = vi.fn();
    renderer.register({ id: "relief", render });
    renderer.flush();
    viewport.x = -10;
    renderer.schedule();
    renderer.flush();
    expect(frames.size).toBe(0);
    expect(render).toHaveBeenCalledOnce();
  });

  it("consumes only a directly rendered layer's queued work", () => {
    const relief = vi.fn();
    const labels = vi.fn();
    const handle = renderer.register({ id: "relief", render: relief });
    renderer.register({ id: "labels", render: labels });
    renderer.schedule();
    handle.render();
    renderer.visibilityChanged(["relief"]);
    tick();
    expect(relief).toHaveBeenCalledOnce();
    expect(labels).toHaveBeenCalledOnce();
  });

  it("invalidates only the dependent label layer on visibility changes", () => {
    const relief = vi.fn();
    const labels = vi.fn();
    renderer.register({ id: "relief", render: relief });
    renderer.register({ id: "labels", render: labels, dependencies: () => ["rivers"] });
    renderer.flush();
    renderer.visibilityChanged(["rivers"]);
    renderer.visibilityChanged(["rivers"]);
    tick();
    expect(relief).toHaveBeenCalledOnce();
    expect(labels).toHaveBeenCalledTimes(2);
    expect(labels.mock.calls[1][0].reason).toBe("layer dependency");
  });

  it("honors dirty invalidation at unchanged bounds", () => {
    const render = vi.fn();
    renderer.register({ id: "relief", render });
    renderer.flush();
    renderer.invalidate("relief");
    renderer.invalidate("relief");
    tick();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("does not lose an invalidation made during rendering", () => {
    const render = vi.fn().mockImplementationOnce(() => renderer.invalidate("relief"));
    renderer.register({ id: "relief", render });
    renderer.flush();
    tick();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("refreshes scale-sensitive layers in either zoom direction without forcing relief", () => {
    const relief = vi.fn();
    const scales: number[] = [];
    renderer.register({ id: "relief", render: relief });
    renderer.register({ id: "labels", render: context => scales.push(context.bounds.scale), scaleSensitive: true });
    renderer.flush();
    viewport.scale = 1.1;
    renderer.schedule();
    tick();
    viewport.scale = 1;
    renderer.schedule();
    tick();
    expect(scales).toEqual([1, 1.1, 1]);
    expect(relief).toHaveBeenCalledOnce();
  });

  it("extends coverage on viewport resize", () => {
    const render = vi.fn();
    renderer.register({ id: "relief", render });
    renderer.flush();
    viewport.width = 500;
    renderer.schedule();
    tick();
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[1][0].bounds.x1).toBe(580);
  });

  it("drops pending hidden work and restores coverage when shown", () => {
    let active = true;
    const render = vi.fn();
    const handle = renderer.register({ id: "relief", render, isActive: () => active });
    renderer.schedule();
    active = false;
    tick();
    expect(render).not.toHaveBeenCalled();
    active = true;
    handle.render();
    renderer.visibilityChanged(["relief"]);
    tick();
    expect(render).toHaveBeenCalledOnce();
  });

  it("renders export roots unconditionally without consuming live work", () => {
    const render = vi.fn();
    renderer.register({ id: "relief", render });
    renderer.schedule();
    const root = document.createElement("div");
    renderer.renderTo(root);
    expect(render.mock.calls[0][0]).toEqual({
      root,
      reason: "export",
      bounds: {
        scale: 1,
        x0: -Infinity,
        y0: -Infinity,
        x1: Infinity,
        y1: Infinity
      }
    });
    tick();
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[1][0].root).toBe(document);
  });

  it("unregisters and replaces layers without running stale callbacks", () => {
    const old = vi.fn();
    const current = vi.fn();
    const oldHandle = renderer.register({ id: "relief", render: old });
    renderer.schedule();
    const handle = renderer.register({ id: "relief", render: current });
    oldHandle.unregister();
    oldHandle.render();
    tick();
    expect(old).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledOnce();
    renderer.invalidateAll();
    handle.unregister();
    expect(frames.size).toBe(0);
    tick();
    expect(current).toHaveBeenCalledOnce();
  });

  it("does not claim coverage after a failed render", () => {
    const render = vi.fn().mockImplementationOnce(() => {
      throw new Error("render failed");
    });
    renderer.register({ id: "relief", render });
    expect(() => renderer.flush()).toThrow("render failed");
    renderer.schedule();
    tick();
    expect(render).toHaveBeenCalledTimes(2);
  });
});

it("updates opted-in viewport coverage on a small pan inside the normal guard", () => {
  const render = vi.fn();
  let sensitive = true;
  renderer.register({ id: "raster", render, viewportSensitive: () => sensitive });
  renderer.renderNow();
  render.mockClear();
  viewport.x += 1;
  renderer.flush();
  expect(render).toHaveBeenCalledTimes(1);
  sensitive = false;
  viewport.x += 1;
  renderer.flush();
  expect(render).toHaveBeenCalledTimes(1);
});
