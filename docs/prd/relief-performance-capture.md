# Relief baseline capture

This checkpoint instruments the existing 1.153.0 renderer before scheduling, DOM or spatial-index repairs.
The report identifies it as `baseline-instrumented`. It is not a performance-fix release.

## Install and record

1. Close the running fork, then install `release/relief-baseline/azgaar-archival-fork-1.153.0-relief-baseline.exe`.
   The previous `release/azgaar-archival-fork-1.153.0-win-x64.exe` remains available.
2. Open the same Jotun map with the usual working layer combination and window size.
3. Warm up with one pan and zoom, then return to a recognizable starting view.
4. Under Tools, click **Record performance (22s)**, enter a label, then click Start.
5. After the three-second countdown, pan and zoom for 22 seconds. Keep the application foreground and do not change
   maps, window size or layer settings during recording. The report downloads automatically when recording finishes.
6. Return to approximately the same starting view for each capture. Record these conditions in order:
   - `Jotun relief on, run 1`: normal working layers.
   - `Jotun relief off, run 1`: turn off only relief.
   - `Jotun relief on, run 2`: restore relief.
   - `Jotun relief off, run 2`: turn off only relief again.
   - `Jotun relief only`: hide other optional overlays and enable relief.
7. Share the downloaded JSON reports or their containing folder path, plus a short description of any lag you felt.

The report includes viewport/layer/style snapshots, timed movement samples, relief count, rendering phase timings,
DOM counters and frame-interval percentiles. Samples are bounded and collection is off outside the timed capture.

Frame intervals are a responsiveness proxy, not proof of displayed frame delivery. Reconcile durations include nested
relief scan/DOM phases: do not sum them. This capture cannot attribute time to GPU rasterization or compositing.
Do not select a raster fallback without a separate browser performance trace.

## Baseline verification

- Targeted diagnostics and existing emblem-renderer tests.
- Renderer and Electron TypeScript checks and desktop renderer build.
- Source lint and whitespace checks.
- Desktop installer packaging and archive-content inspection.

The first user capture is also the target-machine smoke check for the packaged capture UI and download.
