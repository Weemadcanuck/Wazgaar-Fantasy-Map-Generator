# Relief baseline capture

## Current request: cache-reuse candidate 1.153.4

Install `release/relief-raster-cache-reuse/azgaar-archival-fork-1.153.4-win-x64.exe` with the app closed.
The bottom-left badge shows `Relief: loading tiles N/M`, `Relief: raster`, or `Relief: SVG (reason)`.
The cache cap is unchanged. Manual editing/save/reload/export checks are deferred until the end at the user's request.

1. Open the same map and mostly zoomed-out starting view. Record how long the initial badge takes to reach raster,
   approximately; if it stays in SVG, report the displayed reason. Do not change window size or application zoom.
2. Once the badge says raster, use Tools -> Record performance (22s), label `cache warm relief on`, and pan/zoom.
   Visit a nearby area, return, zoom closer and back out. This tests reuse as well as transitions.
3. Record `cache relief off` with the same view and similar movement for the control.
4. If warm-up remains long, toggle relief off before starting a 22s recording labelled `cache cold load`, then turn
   relief on during that recording and hold the view steady. That intentional layer change is specific to this
   cold-load diagnostic. If it takes longer than 22 seconds, also report the approximate total wait.
5. Save reports to `performance optimisation`. A new DevTools trace is optional unless responsiveness remains poor;
   application mode records now show when raster is actually active. Avoid editing during performance recordings.

The new stage is `relief-raster-cache-reuse`. The previous flag still disables raster for a same-build SVG comparison.


## Previous request: distant raster prototype 1.153.3

1. Close the fork and install `release/relief-raster-prototype/azgaar-archival-fork-1.153.3-win-x64.exe`.
2. Open the same Jotun map and usual layers. At the mostly zoomed-out view, pause for a few seconds to build tiles,
   then pan once and return to the starting view. Leave the relief editor closed for performance captures.
3. Use Tools -> Record performance (22s) for `raster relief on`, `raster relief off`, and `raster relief only`.
   Keep similar starting views/window sizes and gestures; avoid editing during those recordings.
4. Save a DevTools Performance trace as `raster-zoomed-out-relief-on.json.gz` using the same procedure below.
   Store all recordings in `performance optimisation`. These determine whether the Layerize stalls improve.
5. Separately inspect sharpness and tile seams while panning; cross the 2x zoom boundary both ways. Click distant
   relief to open its editor (SVG returns), then select an icon and check move/resize/copy/add/delete. Close the editor
   and confirm the distant raster reflects the edits. Toggle relief, save/reload a copy, and export SVG and PNG.

Reports identify `distant-relief-raster` and include `reliefRendering` in the initial/final snapshots. The renderer
may use SVG while tiles build or when a viewport exceeds the cache budget; these periods should be reported, not
mistaken for a warmed raster measurement. Ordinary 22s captures and DevTools traces should run separately.

For a same-build SVG comparison, use the DevTools Console:

```js
localStorage.setItem("reliefRasterPrototype", "off");
location.reload();
```

To restore the prototype, remove that key and reload:

```js
localStorage.removeItem("reliefRasterPrototype");
location.reload();
```

Save any edits before reloading. The flag affects runtime display only and is not stored in the map.


## Current status: requested Chromium comparisons received

Both 1.153.2 on/off traces and the 1.153.1 relief-on trace have been received and analyzed. Both SVG builds show severe
main-thread Layerize stalls. No additional recording is requested for the same implementation at this checkpoint.
See the baseline analysis and implementation plan for the next reversible distant-view raster experiment.

## Received: scheduler-build Chromium comparison

The paired 1.153.2 traces have been analyzed: main-thread Layerize dominates the relief-on capture. For the next
comparison, close the app and install `release/relief-scheduler/azgaar-archival-fork-1.153.1-win-x64.exe`.
Open the same current saved Jotun map, with the same usual layers, mostly zoomed-out view and window size.
Use the DevTools procedure below for one relief-on recording with similar pan/zoom and no editing. Save it as
`scheduler-zoomed-out-relief-on.json.gz` (or `.json`) in `performance optimisation`.
The 1.153.2 installer remains in `release/relief-keyed-dom` if needed. No new candidate has been built.

## Received: Chromium trace of zoomed-out regression

The 1.153.2 application reports have been received. Keep this installed build for the following diagnostic; no new
installer is needed. Spatial indexing is paused while the unmeasured frame stalls are investigated.

1. Open the same Jotun map and usual layers at the mostly zoomed-out view where the slowdown is obvious.
2. Press F12 (or Ctrl+Shift+I) and select the DevTools Performance tab. Undock DevTools into a separate window if
   possible so the map viewport remains the same size. Leave CPU throttling disabled.
3. Start a Performance recording, return focus to the map, and pan/zoom slowly for about 10 seconds. Do not edit
   icons, change layers, or run the application's 22-second recorder during this trace. Stop the DevTools recording.
4. Use Download / Save trace to save `keyed-zoomed-out-relief-on.json` (or `.json.gz`) in `performance optimisation`.
5. Turn off only relief, return to the same starting view, and repeat similar movement with the same window size.
   Save `keyed-zoomed-out-relief-off.json` (or `.json.gz`) in the same folder.

Both JSON and gzip-compressed traces are usable. See the official
[DevTools trace saving instructions](https://developer.chrome.com/docs/devtools/performance/save-trace).
The earlier application reports below remain useful for stage history; they cannot identify Chromium paint costs.


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
