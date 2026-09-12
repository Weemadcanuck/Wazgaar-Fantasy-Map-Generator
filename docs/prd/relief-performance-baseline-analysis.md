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
