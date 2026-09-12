# Relief baseline capture

## Current comparison: keyed DOM checkpoint

The scheduler comparison passed the user functional check with a reported improvement. Install 1.153.2 from
`release/relief-keyed-dom/azgaar-archival-fork-1.153.2-win-x64.exe` next. Its report stage is `keyed-relief-dom`.

Record `keyed relief on`, `keyed relief off`, and `keyed relief only` using the workflow below and save them alongside
the previous reports. Keep viewport size, starting zoom and movement as consistent as practical.

On a disposable copy of the map, select/move/resize/copy an icon, move it front/back, and bulk add/remove relief. Toggle
the layer and check that selection still resolves correctly. Save/reload the copy, and export a full-map SVG plus a
viewport PNG/JPEG to check appearance. Deleting all relief should remain empty after redraw and reload. The normal
Regenerate Relief action can create it again. These checks are pending on the target app; automated coverage has passed.

## Previous comparison: scheduler checkpoint

The baseline has been received and analyzed. Install the 1.153.1 candidate from
`release/relief-scheduler/azgaar-archival-fork-1.153.1-win-x64.exe` for the next comparison. Its reports identify
`independent-viewport-layers`, and downloaded filenames include the label.

Use the same recording workflow below for three initial captures: `scheduler relief on`, `scheduler relief off`,
and `scheduler relief only`. Keep the same starting view/window size and similar gestures. Save the reports alongside
the baseline files. Repeat paired runs if this comparison is ambiguous. Also check that toggling dependent layers
still updates labels and that zooming out/in shows labels and emblems at their expected scales.

This checkpoint removes redundant scheduling. Keyed DOM reconciliation has not yet been applied; severe relief
rendering cost may remain. The measured results determine this phase's effect before the next implementation stage.

## Original baseline

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
