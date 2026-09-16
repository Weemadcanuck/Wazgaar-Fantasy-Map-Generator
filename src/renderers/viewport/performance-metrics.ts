/** Opt-in, bounded diagnostics. No timers or retained samples outside a capture. */
export interface RenderMetric {
  layer: string;
  reason: string;
  phase: string;
  start: number;
  duration: number;
  scanned?: number;
  candidates?: number;
  emitted?: number;
  created?: number;
  removed?: number;
  retained?: number;
  updated?: number;
  moved?: number;
  live?: number;
  mode?: "raster" | "mixed" | "SVG";
  cacheBytes?: number;
  readyTiles?: number;
  requestedTiles?: number;
  reusedHigherResolution?: number;
  displayedRasterTiles?: number;
}

const LIMIT = 4096;
let recording = false;
let started = 0;
let records: RenderMetric[] = [];
let frames: number[] = [];
let views: Array<{ time: number; scale: number; x: number; y: number }> = [];
let dropped = 0;
let frameId: number | null = null;
let previousFrame: number | null = null;

function frame(time: number): void {
  if (!recording) return;
  if (previousFrame !== null) {
    if (frames.length < LIMIT) frames.push(time - previousFrame);
    else dropped++;
  }
  previousFrame = time;
  frameId = requestAnimationFrame(frame);
}

export const PerformanceMetrics = {
  get active(): boolean {
    return recording;
  },
  start(): void {
    if (recording) throw new Error("A performance capture is already running");
    records = [];
    frames = [];
    views = [];
    dropped = 0;
    previousFrame = null;
    started = performance.now();
    recording = true;
    frameId = requestAnimationFrame(frame);
  },
  record(metric: RenderMetric): void {
    if (!recording) return;
    if (records.length < LIMIT) records.push({ ...metric, start: metric.start - started });
    else dropped++;
  },
  view(scale: number, x: number, y: number): void {
    if (!recording) return;
    if (views.length < LIMIT) views.push({ time: performance.now() - started, scale, x, y });
    else dropped++;
  },
  stop() {
    if (!recording) throw new Error("No performance capture is running");
    recording = false;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    const sorted = [...frames].sort((a, b) => a - b);
    const percentile = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
    const result = {
      durationMs: performance.now() - started,
      droppedSamples: dropped,
      frameIntervals: {
        count: frames.length,
        over16_7Ms: frames.filter(value => value > 16.7).length,
        over33_3Ms: frames.filter(value => value > 33.3).length,
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        p99Ms: percentile(0.99),
        longestMs: sorted.at(-1) ?? null
      },
      records,
      views
    };
    records = [];
    frames = [];
    views = [];
    return result;
  }
};
