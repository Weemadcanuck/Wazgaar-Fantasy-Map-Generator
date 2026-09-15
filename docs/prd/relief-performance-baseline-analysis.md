# Jotun relief baseline analysis

Date: 2026-09-12. Source: five user captures in the repository's `performance optimisation` folder.
Build: 1.153.0, stage `baseline-instrumented`. All captures report 11,991 source relief icons, no dropped samples and
no background-tab interval. The user reports obvious lag whenever relief is enabled, including relief alone, and
improvement when zooming in.

## Classification

Use `initial.layers.active` and the internal label to classify captures. The first ON/OFF filenames are swapped:

- `relief-performance Relief OFF run 1-1789248869828.json` contains **relief on**, internal label `Jotun relief on, run 1`.
- `relief-performance Relief ON run 1-1789248869828.json` contains **relief off**, internal label `Jotun relief off, run 1`.

The remaining names agree with the recorded state. Preserve the supplied files without renaming or editing them.

## Results

| Recorded condition | Duration (s) | Frame intervals | Median interval (ms) | p95 (ms) | Relief reconciles | SVG nodes created |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Relief on, run 1 | 23.062 | 21 | 1000.8 | 1234.5 | 9 | 107,916 |
| Relief off, run 1 | 22.010 | 604 | 33.4 | 66.8 | 234 | 0 |
| Relief on, run 2 | 22.093 | 52 | 216.8 | 950.8 | 27 | 235,160 |
| Relief off, run 2 | 22.012 | 595 | 33.4 | 66.8 | 218 | 0 |
| Relief only | 23.534 | 177 | 50.0 | 884.0 | 64 | 318,917 |

These are rAF callback intervals across the recording, not presented-frame counts or a controlled identical-gesture
benchmark. Starting zoom and movement vary; do not interpret the ratios as a precise speedup target. Both relief-off
controls still show substantial frame delays. The larger recording durations are consistent with delayed timer
delivery during stalls, not extra intentional recording time.

| Relief-enabled condition | Total relief reconcile (ms) | Scan + markup (ms) | DOM replacement (ms) | Max live icons |
| --- | ---: | ---: | ---: | ---: |
| Run 1 | 642.0 | 31.8 | 609.1 | 11,991 |
| Run 2 | 992.6 | 46.1 | 944.3 | 11,380 |
| Relief only | 1329.9 | 71.5 | 1256.3 | 11,553 |

DOM replacement accounts for roughly 95% of measured relief reconciliation time. Each reconciliation retained zero
existing nodes. The total synchronous relief timings do not explain the second-long frame stalls: additional work
outside these boundaries remains unattributed. SVG processing, paint, compositing or other application work are
possibilities; the captures do not prove which dominates.

## Implementation decision

Keep the approved SVG sequence: independent scheduling, keyed DOM with stable identity, then spatial indexing. The
measurements support keyed DOM ahead of the index. Removing all-scene scans alone is unlikely to resolve the observed
severity. A spatial index also cannot reduce the number of visible icons when viewing nearly the entire map.

Phase 1 removes forced all-layer gesture-end redraws, ignores hidden layers, tracks coverage per layer and refreshes
only explicit dependencies on visibility changes. Capture this stage independently before judging its benefit.
The expensive `innerHTML` replacement remains until the keyed DOM stage; do not claim the lag is fixed at Phase 1.

A raster fallback remains gated on measurements after the SVG stages and a browser performance trace establishing
the remaining rendering cost. No density reduction, GPU-acceleration change or save-format change is justified here.

## Scheduler checkpoint received

The three hyphenated `relief-performance-Jotun-...` files are version 1.153.1, stage `independent-viewport-layers`.
Their internal labels and layer state agree. All have 11,991 source icons, no dropped samples, no background interval,
and unchanged layer state during the recording. The user reports remarkable improvement and no failed behavior.

| Condition | Median interval (ms) | p95 (ms) | Longest (ms) | Relief reconciles | SVG nodes created |
| --- | ---: | ---: | ---: | ---: | ---: |
| Relief on | 78.7 | 212.2 | 345.5 | 43 | 468,925 |
| Relief off | 6.2 | 109.0 | 206.0 | 0 | 0 |
| Relief only | 30.3 | 163.7 | 224.3 | 67 | 606,851 |

The usual layer mix differs from the baseline (for example borders are now enabled), and starting viewport/gestures
also differ. The results support retaining Phase 1 together with the user's functional check, but do not establish an
exact speedup. Relief-off p95 is worse than the earlier control despite a lower median, so do not claim every metric
improved. The hidden relief callback now runs zero times, as intended.

DOM replacement remains roughly 96% of measured relief reconciliation time: 1,527.0 of 1,597.5 ms in the relief-on
capture and 2,004.1 of 2,089.4 ms with relief alone. More work can execute in a more responsive recording; the higher
node creation count does not contradict the perceived improvement. It establishes substantial remaining churn.

Proceed with keyed DOM before indexing. The next build identifies `keyed-relief-dom`; compare its created/removed,
retained/updated/moved counters as well as frame intervals. Retained means an existing node object was reused, even
if one of its attributes was updated. Spatial indexing and raster caching remain separate, unimplemented stages.


## Keyed DOM checkpoint: performance regression (2026-09-13)

The three `relief-performance-Keyed-...` reports identify version 1.153.2, stage `keyed-relief-dom`, with no dropped
samples or background interval. The user reports the regression primarily when zoomed mostly out.

| Condition | Median interval (ms) | p95 (ms) | Longest (ms) | Relief reconciles | SVG nodes created |
| --- | ---: | ---: | ---: | ---: | ---: |
| Relief on | 600.5 | 650.6 | 667.2 | 19 | 8,809 |
| Relief off | 33.5 | 50.1 | 66.7 | 0 | 0 |
| Relief only, including editing | 417.1 | 450.6 | 483.6 | 18 | 9,139 |

Relief-on reconciliation totals only 89.4 ms (maximum 6.3 ms per call); its nested DOM phase totals 76.9 ms and
scan phase 8.4 ms (maximum scan 0.9 ms). It records 204,264 retained-node occurrences, zero existing-node moves and
up to 11,775 live icons. Reduced measured JavaScript work and node creation have not translated into responsiveness.
The relief-on median was 78.7 ms in the scheduler capture; this candidate does not pass the performance gate.

These remain uncontrolled gestures, with a different viewport size (1182 x 739 versus 1231 x 770 for the scheduler).
They support investigating the reported regression, not a precise causal speed ratio. The relief-only capture includes
copy/move/resize and partial addition testing: its source count changes from 12,257 to 12,265. Treat it as functional
and diagnostic evidence, not an equivalent movement benchmark. The user saw no visual faults in those operations or
exports. The supplied SVG has 12,265 relief use elements, all symbol references resolve, and no runtime data-id
attributes are exported. The earlier saved map contains 12,257 icons with only icon/s/x/y fields; its lower count is
consistent with the subsequent additions, not a demonstrated export mismatch. The PNG looks normal on inspection.

Pause spatial indexing until the remaining cost is attributed. At this zoom most icons remain visible, and removing
sub-millisecond scans cannot explain or resolve approximately 600 ms frame intervals. Chromium SVG processing,
style/layout, paint/raster/compositing, or other application work remain hypotheses, not established causes.
Collect paired DevTools Performance recordings on the current installed build with relief on/off, a consistent
mostly zoomed-out view, and no editing. Use the trace to select a repair or evaluate reverting the keyed live renderer.
No raster fallback or further implementation stage is approved by these measurements alone.


## Chromium trace attribution (2026-09-13)

Source files: `keyed-zoomed-out-relief-on.json.gz` and `keyed-zoomed-out-relief-off.json.gz` in
`performance optimisation`. Both identify the same renderer main thread (PID 4972, TID 30364), with host DPR 1.625.
The saved trace windows span 30.389 seconds on and 29.699 seconds off.

| Main-thread Layerize measurement | Relief on | Relief off |
| --- | ---: | ---: |
| Completed calls | 57 | 1,329 |
| Total wall duration | 28,858.704 ms | 875.781 ms |
| Median call | 497.492 ms | 0.636 ms |
| Maximum call | 616.792 ms | 1.365 ms |
| Total thread CPU duration | 27,866.913 ms | 857.210 ms |

Layerize accounts for approximately 95% of the relief-on trace window; the matching thread CPU durations show
substantial CPU work in that stage, rather than merely elapsed waiting. This is specific evidence of main-thread
layer-building cost. It does not identify the exact Chromium algorithm, prove a GPU bottleneck, or establish that
keyed node retention itself caused the regression. Paint totals 561.2 ms on versus 209.1 ms off; these timings and
nested RunTask durations must not be added into a purported total CPU figure.

An isolated Electron 43.4.1 offscreen probe panned the supplied exported SVG, then a version reconstructed with
original relief symbols and the saved map's 12,257 source icons. Neither reproduced the installed app's approximately
500 ms Layerize calls: median calls were around 5-12 ms. Opaque terrain, isolation, and will-change experiments did
not establish a reliable repair. This harness omits the full application and real interactive onscreen rendering;
its results cannot establish production performance. Probe sources and traces are under `work/relief-layerize`.
No production CSS or renderer changes were made on the strength of this probe.

Next gate: obtain a relief-on DevTools trace from the existing 1.153.1 scheduler installer using the same current
saved map, mostly zoomed-out starting view, normal layers, window size, and similar gestures. Avoid editing. This
compares Layerize attribution across builds before deciding on a targeted keyed-renderer rollback versus a broader
SVG representation change. The earlier application timer captures do not provide this Chromium-stage comparison.
Spatial indexing stays deferred because scan costs do not explain the measured bottleneck.


## Scheduler Chromium comparison: shared bottleneck (2026-09-13)

The user supplied `scheduler-zoomed-out-relief-on.json.gz` after testing the 1.153.1 scheduler installer and reported
that it did not feel substantially faster this time. The trace's saved window spans 29.480 seconds and records the
same host DPR, 1.625. Build identity here comes from the user's test workflow; the generic DevTools trace metadata
does not independently certify the application version.

| Layerize measurement | Scheduler 1.153.1 | Keyed 1.153.2 |
| --- | ---: | ---: |
| Trace window | 29.480 s | 30.389 s |
| Total completed Layerize duration | 26.360 s | 28.859 s |
| Share of trace window | 89.4% | 95.0% |
| Completed calls | 110 | 57 |
| Calls exceeding 100 ms | 43 | 57 |
| Total duration of calls exceeding 100 ms | 25.036 s | 28.859 s |
| Median of calls exceeding 100 ms | 579.787 ms | 497.492 ms |
| Maximum call | 619.555 ms | 616.792 ms |
| Total thread CPU duration | 25.519 s | 27.867 s |

The scheduler's all-call median is 20.211 ms, but that masks a bimodal distribution: 43 long calls consume 25 seconds.
It must not be presented as an approximately 25-fold responsiveness advantage over the keyed median. Both traces
show severe main-thread layer-building costs. The earlier application captures remain valid observations, but they
do not prove that keyed retention introduced the underlying problem. The candidate still fails the responsiveness
target; describing its causal performance regression as established would be too strong.

PC load or session conditions may contribute to differences between runs, but these renderer traces do not measure
system-wide load or establish a hardware fault. The earlier relief-off trace reduces Layerize to 0.876 seconds, so
relief remains the demonstrated application-side trigger under the tested conditions.

Decision: do not roll back keyed DOM solely on the previous subjective/build comparison. Preserve the measured
reduction in DOM work while continuing to treat overall responsiveness as unresolved. Spatial indexing remains a
later improvement for small viewports; interaction cadence cannot be assumed to remove the demonstrated cost of
transforming the dense visible SVG layer.

The next justified investigation is a reversible distant-view raster prototype, testing whether replacing the dense
live SVG display with a bounded number of image tiles removes Layerize stalls in the full application. This is an
experimental change, not a proven solution or permission to reduce source/export detail. Keep original vectors for
editing and exports; switch to SVG for close views and editing, bound sequential tile generation and cache memory,
cancel stale work on changes, and compare actual app traces before retaining the implementation. The SVG-only probe
above does not validate this approach because it never reproduced the full application bottleneck.


## Raster candidate target-PC feedback and captures (2026-09-14)

The user reports massively improved navigation once loaded, including zooming in and out, but longer loading than
the isolated probe suggested. Three `relief-performance-raster-...` reports identify 1.153.3 / distant-relief-raster,
11,991 source icons, DPR 2.5999999046, no dropped samples and no background interval.

| Condition | Median rAF interval | p95 | Longest | Completed raster tile timings |
| --- | ---: | ---: | ---: | --- |
| Relief on | 18.0 ms | 175.9 ms | 266.8 ms | 9, totaling 10,407.9 ms; max 1,389.7 ms |
| Relief off | 6.1 ms | 103.0 ms | 206.1 ms | 0 |
| Relief only | 18.2 ms | 109.2 ms | 139.4 ms | 1, taking 1,068.9 ms |

Crucial attribution limit: all three application reports start and end in SVG mode. Relief-on ends with 28,387,584
estimated cached bytes, still in SVG mode; relief-only ends with zero cache bytes. Every recorded relief reconcile
also contains a vector scan/DOM phase (19 on, 62 only), so these reports do not demonstrate a completed raster-mode
reconciliation. They show improved responsiveness in the candidate and some tile generation, not a clean warmed
raster benchmark. The user's separate experience after loading remains meaningful subjective evidence.

The new `raster-zoomed-out-relief-on.json.gz` DevTools trace spans 22.178 seconds. Layerize totals 8,270.006 ms across
432 completed calls (37.3% of the window), with median 18.728 ms and maximum 36.755 ms; no Layerize call exceeds
100 ms. The keyed trace had median 497.492 ms and maximum 616.792 ms. The severe Layerize stalls are absent from
this new trace, but it does not include our runtime mode snapshots and cannot independently certify raster activity.
Different gestures, display density and session conditions prohibit assigning the whole change to the raster path.

The current DPR is 2.6 versus 1.625 in the probe: tiles now have 1332-pixel edges rather than 832 (approximately
2.56 times the area). At 7,096,896 estimated decoded bytes per tile, the 128 MiB cache admits at most 18 tiles.
The mostly zoomed-out viewport plus overscan can require more, so the current all-or-nothing budget check returns to
SVG without building that request. Requests at closer zoom can fit but still require several seconds to warm.
Recorded tile durations include asynchronous decode/encode and scheduling delays; do not treat them as pure CPU time
or extrapolate an exact full-view loading time. The earlier 864 ms probe was never a target-PC loading estimate.

Retain the candidate for continued validation; do not call the raster performance gate conclusively passed yet.
Next refinement should expose runtime mode and fallback reason, capture mode transitions throughout a run, and
improve budget/resolution planning and cache reuse at the observed DPR without silently blurring distant relief or
raising the memory cap. Measure cold-start and warm navigation separately. No further identical captures are needed
before those diagnostic improvements. User confirmation of editing/save/export checks remains outstanding.


## Cache-reuse target-PC checkpoint (2026-09-15)

The user reports loading 24 tiles in less than a minute, very fast navigation afterwards, and acceptable jank when
entering partly uncached views. Editing/save/reload/export checks remain deferred. New 1.153.4 application captures
identify `relief-raster-cache-reuse` and now establish actual raster-mode use and return to ready cached views.

| Condition | Median rAF interval | p95 | p99 | Longest |
| --- | ---: | ---: | ---: | ---: |
| cache warm relief on | 16.7 ms | 50.0 ms | 50.1 ms | 750.6 ms |
| cache relief on part 2 | 16.7 ms | 99.9 ms | 533.7 ms | 684.0 ms |
| cache relief off | 16.8 ms | 50.1 ms | 66.8 ms | 100.0 ms |

The first on capture starts raster-ready with 24 tiles and ends warming in SVG (10/12 tiles ready). Display records
include 114 raster-ready and 12 SVG-warming observations. The second starts and ends raster-ready, with 75 ready
and 21 warming observations. These are event counts, not time shares. Ten tile completions are recorded in each on
capture; their asynchronous wall durations total 13.0 and 12.5 seconds, with maxima 5.915 and 3.569 seconds. Do not
interpret these as pure CPU times or as the cold loading duration of all 24 tiles.

The first on capture's typical intervals closely match the off control, but isolated long stalls remain and the
second capture's tail is worse. Different gestures and mixed ready/warming periods prevent an exact matched-mode
speedup claim. End cache sizes are 32,188,416 and 52,435,968 bytes (~30.7 and 50.0 MiB), below the unchanged 128 MiB
cap. There is no evidence from these endpoints that increasing the cap would address these stalls.

Recommendation, not an additional implemented stage: the most directly relevant optional refinement is retaining
cached raster coverage while drawing vector relief only in missing regions, rather than temporarily restoring SVG
for the entire visible layer. This needs correct region clipping, source order and opacity to avoid duplicated or
missing relief. A narrower improvement is reusing suitable higher-resolution cached tiles for lower-resolution
requests. Idle-only neighbour prefetch could help predictable pans later, but adds scheduling complexity. The original
spatial-index/cadence work remains optional; existing evidence does not make it a priority over these transition
costs. Given the user's acceptable experience, completing the deferred functional checks before further rendering
complexity is also a reasonable stopping point.
