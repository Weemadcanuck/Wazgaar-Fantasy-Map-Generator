import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerformanceMetrics } from "./performance-metrics";

let queued: FrameRequestCallback | undefined;

beforeEach(() => {
  queued = undefined;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      queued = callback;
      return 1;
    })
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  if (PerformanceMetrics.active) PerformanceMetrics.stop();
  vi.unstubAllGlobals();
});

describe("bounded performance capture", () => {
  it("does no recording or frame scheduling until explicitly started", () => {
    PerformanceMetrics.view(1, 0, 0);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    PerformanceMetrics.start();
    expect(PerformanceMetrics.stop().views).toEqual([]);
  });

  it("records frame intervals, movement and phase counters, then cancels scheduling", () => {
    PerformanceMetrics.start();
    queued?.(100);
    queued?.(110);
    queued?.(150);
    PerformanceMetrics.view(2, 3, 4);
    PerformanceMetrics.record({
      layer: "relief",
      reason: "export",
      phase: "DOM",
      start: performance.now(),
      duration: 5,
      created: 10
    });
    const result = PerformanceMetrics.stop();
    expect(result.frameIntervals).toMatchObject({ count: 2, over33_3Ms: 1, p50Ms: 10, p95Ms: 40, longestMs: 40 });
    expect(result.records[0]).toMatchObject({ layer: "relief", created: 10 });
    expect(result.views[0]).toMatchObject({ scale: 2, x: 3, y: 4 });
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(PerformanceMetrics.active).toBe(false);
  });

  it("caps each sample stream and discards prior capture state", () => {
    PerformanceMetrics.start();
    for (let i = 0; i < 4200; i++) {
      PerformanceMetrics.view(1, i, 0);
      PerformanceMetrics.record({
        layer: "relief",
        reason: "test",
        phase: "DOM",
        start: performance.now(),
        duration: 1
      });
    }
    const result = PerformanceMetrics.stop();
    expect(result.views).toHaveLength(4096);
    expect(result.records).toHaveLength(4096);
    expect(result.droppedSamples).toBe(208);
    PerformanceMetrics.start();
    expect(PerformanceMetrics.stop().records).toEqual([]);
    expect(result.records).toHaveLength(4096);
  });

  it("rejects overlapping captures", () => {
    PerformanceMetrics.start();
    expect(() => PerformanceMetrics.start()).toThrow("already running");
    PerformanceMetrics.stop();
    expect(() => PerformanceMetrics.stop()).toThrow("No performance capture");
  });
});
