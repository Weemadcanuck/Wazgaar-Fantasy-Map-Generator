// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/components/layers", () => ({ Layers: { state: { active: ["relief"], order: ["relief"] } } }));
vi.mock("@/components/tooltips", () => ({ tip: vi.fn() }));
vi.mock("@/services/versioning", () => ({ VERSION: "test" }));

import { PerformanceMetrics } from "@/renderers/viewport/performance-metrics";
import { capturePerformance } from "./performance-diagnostics";

let dialogOptions: { buttons: { Start: () => void }; close: () => void };

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="dialogs"></div>';
  for (const [name, value] of Object.entries({
    mapId: 123,
    pack: { relief: [{ icon: "relief-test", x: 0, y: 0, s: 1 }] },
    style: { relief: { size: 1 } },
    scale: 1,
    viewX: 0,
    viewY: 0,
    svgWidth: 800,
    svgHeight: 600,
    graphWidth: 1000,
    graphHeight: 1000
  }))
    vi.stubGlobal(name, value);
  vi.stubGlobal("$", () => ({
    dialog: (options: typeof dialogOptions | string) => {
      if (typeof options !== "string") dialogOptions = options;
      else if (options === "close") dialogOptions.close();
    }
  }));
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1)
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  if (PerformanceMetrics.active) PerformanceMetrics.stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("starts after the countdown, downloads after 22 seconds and permits another capture", () => {
  capturePerformance();
  expect(document.querySelector("#performanceCaptureLabel")).not.toBeNull();
  dialogOptions.buttons.Start();
  expect(document.querySelector("#performanceCapture")).toBeNull();
  capturePerformance(); // pending captures cannot create a second dialog
  expect(document.querySelector("#performanceCapture")).toBeNull();
  vi.advanceTimersByTime(2999);
  expect(PerformanceMetrics.active).toBe(false);
  vi.advanceTimersByTime(1);
  expect(PerformanceMetrics.active).toBe(true);
  capturePerformance();
  expect(document.querySelector("#performanceCapture")).toBeNull();
  vi.advanceTimersByTime(22000);
  expect(PerformanceMetrics.active).toBe(false);
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  const downloadLink = vi.mocked(HTMLAnchorElement.prototype.click).mock.contexts[0];
  if (!(downloadLink instanceof HTMLAnchorElement)) throw new Error("Expected a download link");
  expect(downloadLink.download).toMatch(/^relief-performance-Relief-on-run-1-\d+\.json$/);
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(1000);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  capturePerformance();
  expect(document.querySelector("#performanceCapture")).not.toBeNull();
  dialogOptions.close();
});
