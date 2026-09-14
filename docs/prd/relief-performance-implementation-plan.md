# Relief Performance Implementation Plan

Status: 1.153.4 cache-reuse candidate implemented; target-PC cold/warm comparison pending; manual edit/save/export checks deferred by user

Parent: [Archive Fork 2.0 Worklist](./archive-fork-2.0-worklist.md)
Updated: 2026-09-13

## Objective

Make the relief layer responsive on the supplied Jotun map without disabling GPU acceleration, changing serialized
`pack.relief` data, reducing SVG export detail, or breaking individual relief editing.

The initial repair must remain SVG-based. A rasterized runtime representation is a conditional fallback only if the
measured SVG repairs do not meet the acceptance gate.

## Approved review amendments (2026-09-12)

These amendments govern the implementation where the original phases below differ.

1. Implement diagnostics, independent scheduling, stable identity plus keyed DOM, then the spatial index. Keep the
   original phase numbers as reference labels. Reverse the last two only if capture evidence shows scanning dominates.
2. Mutation handling is mandatory. Audit editor geometry, appearance, order and bulk operations; generator replacement,
   global style resize/set changes, loading/migration and heightmap customization. Measure scene preparation/index
   rebuilding separately. Single-icon drag/resize must not rebuild the full scene/index on every frame.
3. Scheduler bounds describe completed rendering, not queued work. Flush against the latest viewport; a direct render
   consumes only its own pending work. Account explicitly for scale-dependent labels/emblems and viewport resize.
   Test interleaved direct/queued work, multiple viewport changes, zoom thresholds in both directions, resize, hide,
   replacement and unregister while pending.
4. Distinguish intentionally empty relief from data awaiting initial generation, including old-map compatibility.
   Cancel relief-specific pending redraws on hide/reset. Test delete-all/redraw/save/reload, hide/show within one frame,
   and map replacement with a pending redraw.
5. Capture initial/final viewport, viewport size, display scale, app/build identity, layer settings, relief count and
   timed movement samples. Compare several runs with alternating on/off conditions after warm-up. Keep diagnostics
   opt-in and bounded. Treat rAF intervals as a responsiveness proxy; nested timing phases must not be summed.
6. CPU ratios and private-memory deltas below are investigation triggers rather than standalone failure gates. Prioritize
   frame-time percentiles/long frames, reconciliation costs, DOM churn and repeated-cycle growth. Stable process memory
   is not proof of Chromium residency. Require a browser trace separating scripting from paint/raster/compositor work
   before selecting Phase 5; application timers alone cannot establish that attribution.
7. Exports that include relief must use all relevant source icons independently of the live viewport while preserving
   existing layer visibility. Test export immediately after an edit before its queued redraw, full-map and viewport
   raster outputs, and export-clone isolation. Do not silently enable hidden relief.
8. Any raster fallback must cancel obsolete tile work, dispose resources, cap cache memory and define entry into the
   individual SVG editor from a rasterized distant view. It remains conditional.

The target deployment is the installed Azgaar Archival Fork 1.153.0. Keep a separately identified instrumented baseline
package before changing rendering behavior; record the actual tested stage in each capture.

### Current checkpoint

- Instrumented desktop baseline: `release/relief-baseline/azgaar-archival-fork-1.153.0-relief-baseline.exe`.
- Capture instructions: [Relief baseline capture](./relief-performance-capture.md).
- Local validation: 25 targeted tests passed (capture metrics, capture dialog lifecycle, existing emblem renderer),
  renderer and Electron type checks, desktop build, source lint, whitespace check and packaged archive inspection.
- Electron 43.4.1 runtime verified from the existing release and reused for the baseline package. The installer was
  built without publishing. The original 1.153.0 installer remains available.
- Target-PC baseline captures and packaged UI/download smoke checks are complete. See the
  [baseline analysis](./relief-performance-baseline-analysis.md). The first on/off filenames are reversed; classification
  uses the JSON's recorded layer state.
- Phase 1 implements independent coverage, explicit invalidation, targeted label dependencies, hidden-layer skipping,
  latest-viewport flushing and scale-sensitive label/emblem updates. Twelve scheduler tests cover these contracts.
- The scheduler is version 1.153.1, capture stage `independent-viewport-layers`. Capture filenames now include the user
  label. Its target-PC captures and user functional check support retaining this phase; see baseline analysis.
- Phase 1 local validation: 76 targeted tests across seven files passed, including scheduler, layer registry, zoom,
  label data, emblems and diagnostics. Desktop TypeScript checks/build and source lint passed.
- The keyed DOM candidate is 1.153.2, capture stage `keyed-relief-dom`. Runtime identities use a WeakMap; visible-node
  caches preserve SVG order and attribute snapshots. The renderer reads current source objects and uses the shared
  scheduler for edits, eliminating the separate queued scene rebuild. Hide and root/map replacement clear caches.
- Local keyed-DOM checks: 108 tests across 11 files, including node retention, ordering, mutation handling, twenty
  toggles, old/missing versus intentionally empty relief, pending-edit exports and existing IO/rendering regressions.
- Initial keyed-DOM captures showed worse zoomed-out frame intervals despite lower reconciliation costs. Later
  cross-build Chromium traces show severe Layerize stalls in both builds, so a keyed-specific cause is unproven.
  This candidate has not passed the responsiveness gate. User editing and export checks found no visible faults.
- Paired Chromium traces attribute about 95% of the relief-on recording to main-thread Layerize (median 497.5 ms
  per call versus 0.636 ms with relief off). Isolated SVG probes do not reproduce this severity.
- Scheduler comparison received: Layerize occupies 89.4% of its trace, with 43 calls over 100 ms and a 619.6 ms
  maximum. Both SVG builds share the bottleneck; do not infer a PC fault or roll back keyed DOM as a proven cure.
- Next: a reversible distant-view raster prototype in the full application, preserving all Phase 5 editing/export
  and resource-lifecycle requirements. Phase 2 spatial indexing and Phase 4 cadence tuning remain deferred because
  neither targets the measured dominant cost. This evidence-based ordering overrides the original Phase 5 sequence;
  it authorizes testing the fallback, not accepting it without visual, functional and target-PC performance checks.
  See the updated baseline analysis for attribution and limits.

### Relief mutation and persistence audit

| Source | Handling in keyed DOM checkpoint |
| --- | --- |
| Individual drag/resize | Explicit geometry invalidation; current objects read at flush; no parallel scene rebuild |
| Individual icon change | Explicit appearance invalidation; only changed SVG attributes written |
| Front/back | Explicit order invalidation; array order preserved and existing nodes reordered |
| Copy, bulk add/remove, delete | Structural invalidation; source array read directly; surviving objects retain identity |
| Generator and global style set/size | Existing direct draw path reads current objects; new generated objects replace old nodes |
| Load/legacy migration | Existing data objects or migrated SVG icons remain authoritative; new pack/root clears live caches |
| Heightmap erase/regraph | Relief marked absent for lazy generation, rather than deliberately empty |
| Save/reload empty relief | Existing optional relief line stores `[]` for intentional emptiness and blank for uninitialized data |
| Full-map SVG/tiles | Stateless clone path reads every source icon when relief is enabled |
| Viewport PNG/JPEG | Stateless clone path reads source icons intersecting the viewport, including pending edits |

No ReliefIcon fields or file sections are added. Populated relief JSON and intentional empty arrays keep their existing
encoding. Missing legacy relief sections still request generation. Older files containing an explicit empty array are
treated as intentionally empty; the Regenerate Relief tool remains available when generation is wanted.

## Evidence and working diagnosis

The A/B traces are stored at the workspace root under `work/performance/`.

| Trace | Relief | Active-process mean CPU | Large-process private-memory change | Peak working sets |
| --- | --- | ---: | ---: | ---: |
| `interaction-sample-20260912.csv` | On | 5.07% of one core | +42.14 MB and about +42 MB | 664 MB and 1.11 GB |
| `interaction-relief-off-20260912.csv` | Off | 0.94% of one core | -0.05 MB and -2.80 MB | 252 MB and 555 MB |

The user also reported an immediate qualitative improvement when relief was disabled. Relief is therefore a
confirmed dominant contributor in the tested layer combination.

Current code has four likely costs:

1. `reconcileRelief` scans every scene item for each relief reconciliation.
2. It replaces all visible terrain markup through `terrain.innerHTML`, recreating unchanged `<use>` elements.
3. `ViewportRenderer` has one materialized-bounds value and reconciles every registered viewport layer together.
4. Layer activation can draw its own viewport layer and then trigger a second all-layer reconciliation through the
   layer subscription.

The OS traces cannot distinguish JavaScript, DOM mutation, SVG symbol rasterization and Chromium compositor/GPU
caching. Instrument those boundaries before selecting the final repair.

## Invariants

- `pack.relief` remains the serialized source of truth and keeps its current schema.
- Runtime indexes, keys, node caches and metrics are transient and never enter the `.map` file.
- Relief order remains the `pack.relief` array order; front/back editing must behave identically.
- Clicking a visible icon must still resolve to the correct `ReliefIcon` object.
- Full-map SVG and tiled/raster exports must materialize every relief icon, not the viewport subset or a reduced LOD.
- Hiding relief releases its live nodes and runtime scene/index state.
- No new production dependency is required.
- Existing map files load without a migration.

## Phase 0: reproducible instrumentation

### Files

- Modify `src/renderers/viewport/viewport-renderer.ts`.
- Modify `src/renderers/draw-relief-icons.ts`.
- Add `src/controllers/performance-diagnostics.ts` only if the packaged app needs a user-visible capture surface.
- Add the smallest required Tools action/UI hook; avoid restructuring `src/index.html`.

### Metrics

For each viewport reconciliation, record:

- layer id;
- reason: direct draw, pan guard crossed, zoom end, layer change, export, or explicit invalidation;
- start time and duration;
- total items scanned;
- candidate items returned by an index;
- visible items emitted;
- nodes created, updated, moved, removed and retained;
- live child count after reconciliation.

Record gesture-level frame count, frames over 16.7 ms, frames over 33.3 ms, longest frame and total reconciliations.
When Chromium exposes `performance.memory`, report it as optional supporting evidence, never as the sole memory test.

### Capture workflow

1. Load the supplied Jotun map and use the user's normal working layer combination.
2. Warm up with one pan and zoom before recording.
3. Record the same 22-second movement with relief on and off.
4. Record relief alone.
5. Copy or save one compact JSON/CSV report that includes the app version and relief count.

### Gate

Do not start Phase 5 from OS telemetry alone. Phases 1-3 are justified by known redundant work; runtime
rasterization requires evidence that SVG raster/compositing remains dominant afterward.

## Phase 1: independent viewport-layer scheduling

### Files

- Modify `src/renderers/viewport/viewport-renderer.ts`.
- Modify `src/components/layers-tab.ts` only where its broad `ViewportLayers.renderNow()` subscription is involved.
- Modify `src/components/zoom.ts` only if the scheduler needs an explicit gesture/end reason.
- Add `src/renderers/viewport/viewport-renderer.test.ts`.

### Design

Replace the renderer-wide `materializedBounds` with runtime state per registered layer:

```ts
interface ViewportLayerState {
  layer: ViewportLayer;
  materializedBounds: ViewportBounds | null;
  dirty: boolean;
}
```

The scheduler should:

- determine reconciliation independently for each layer;
- coalesce repeated requests into one animation frame;
- reconcile only dirty layers or layers whose own guard has been crossed;
- mark a direct layer render as materialized so the following global notification cannot repeat it;
- preserve `renderTo(root)` as an unconditional all-layer render for export clones;
- provide explicit `invalidate(id)` and `invalidateAll()` operations rather than using bounds as hidden invalidation.

Do not remove the layer-registry subscription blindly. Labels can depend on another layer's visibility. Either pass
the changed layer ids through the registry notification or explicitly invalidate the small dependency set. Avoid
reconciling unrelated viewport layers merely to update a dependent label group.

### Tests

- Crossing one layer's guard reconciles that layer without reconciling another whose bounds remain valid.
- Multiple schedule calls in one frame reconcile each selected layer once.
- A direct draw followed by a layer notification does not redraw the same layer.
- Dirty invalidation redraws within unchanged bounds.
- `renderTo` renders every registered layer with infinite full-map bounds.
- Unregistering a layer drops its scheduler state and pending work.

### Gate

Repeat the instrumented Jotun trace. Retain this phase even if relief is still expensive, provided it reduces
unrelated reconciliations and passes all visual behavior checks.

## Phase 2: relief spatial index and stable runtime identity

### Files

- Add `src/renderers/relief/relief-spatial-index.ts`.
- Add `src/renderers/relief/relief-spatial-index.test.ts`.
- Modify `src/renderers/draw-relief-icons.ts`.
- Modify `src/controllers/relief-editor.ts` for explicit mutation invalidation, and audit every mutation source listed above.

### Runtime identity

Array positions currently become `data-id` values. Deleting or reordering an entry can therefore change many ids.
Introduce session-stable runtime ids without changing `ReliefIcon`:

- keep a `WeakMap<ReliefIcon, string>` plus a monotonic id counter;
- preserve the same id while an object remains in the session;
- rebuild ids naturally after map load;
- continue resolving a clicked id to the exact object used by the editor.

### Spatial index

Use a small relief-specific uniform bucket index; do not add a general framework or dependency.

- Build it when relief is generated, loaded, replaced or bulk-mutated.
- Index each icon by its bounding box, accounting for `x`, `y` and `s`.
- Query only buckets intersecting the overscanned viewport.
- Deduplicate icons spanning multiple buckets.
- Return candidates in `pack.relief` order, preserving visual depth.
- Treat infinite export bounds as a direct all-items path.

Choose bucket dimensions from the map size and measured density, then lock the choice behind tests. Avoid a bucket
size so fine that index overhead exceeds a linear scan on small maps.

### Mutation handling

Start with correctness-first invalidation:

- generation, load, set change and bulk operations may rebuild the index;
- moving or resizing one icon should update only that icon if the API remains simple;
- front/back order changes update order metadata without changing runtime identity;
- style-only changes must not rebuild spatial membership.

### Tests

- Bounds queries include icons intersecting an edge even when their origin lies outside it.
- Multi-bucket icons are returned once.
- Results preserve source order.
- Moving and resizing updates membership correctly.
- Removing and adding icons updates both lookup and identity.
- Infinite bounds return every icon.
- Empty and very small scenes avoid errors and unnecessary indexing.

### Gate

For zoomed-in Jotun views, `itemsScanned` should approach the candidate count rather than total relief count. Query
and ordering time should remain below the DOM reconciliation time.

## Phase 3: keyed live-DOM reconciliation

### Files

- Modify `src/renderers/draw-relief-icons.ts`.
- Add `src/renderers/draw-relief-icons.test.ts`.

### Design

For the live document, reconcile `<use>` nodes by stable runtime id:

- remove nodes no longer in the overscanned set;
- create only newly visible nodes;
- update `href`, `x`, `y`, `width` and `height` only when values changed;
- retain unchanged nodes;
- insert entering nodes at the correct source-order position;
- perform a deliberate reorder only after a front/back edit changes source order.

Do not cache DOM nodes across map replacement. Clear the node cache from `removeRelief` and every scene reset.

Export roots require a separate stateless path. When `context.root` is an export clone, create complete ordered
markup in that clone and do not read or move cached nodes from the live document.

### Tests

- A small pan retains overlapping nodes by object identity.
- Entering and leaving icons produce only the expected creates/removes.
- A moved or resized icon updates attributes without recreating unrelated nodes.
- Front/back operations preserve exact source order.
- Hiding relief clears live nodes and caches.
- Re-enabling relief restores correct icons and editor lookup.
- Export-clone rendering includes every icon and leaves the live layer untouched.

### Gate

Repeat all three traces. The relief-on interaction should no longer show wholesale child replacement or allocation
growth proportional to every viewport update.

## Phase 4: interaction cadence, only if needed

### Changes

- Give relief its own measured overscan and guard values.
- During an active gesture, allow the existing relief group to move with the parent transform.
- Reconcile at most at the chosen cadence when the larger relief guard is crossed.
- Always perform one exact reconciliation when the gesture ends.

Do not permanently lower relief density. A briefly unpopulated edge during an unusually fast drag is preferable to
blocking input, but first choose overscan large enough that it is rare on the target PC.

### Gate

Keep this phase only if it improves long frames without visibly distracting edge pop-in.

## Phase 5: conditional runtime raster cache

Implement this only if Phases 1-4 show that SVG symbol rasterization/compositing remains the dominant cost.

### Required behavior

- Use raster relief only for ordinary distant map viewing.
- Switch to individual SVG nodes for close views and whenever the relief editor is open.
- Invalidate cached tiles after any relief data or relief style change.
- Generate tiles sequentially and cap cache memory.
- Keep vector `pack.relief` as source data.
- Force complete vector materialization for SVG export.
- Make the fallback reversible behind one internal feature flag during testing.

### Rejection conditions

Reject this approach if it introduces persistent blur at normal scale, visible seams, stale edits, excessive cache
warm-up, or another GPU rendering artifact.

## Validation matrix

### Automated

Run targeted tests after each phase, then the standard checks:

```powershell
npm test -- --run renderers/viewport/performance-metrics.test.ts renderers/viewport/viewport-renderer.test.ts --maxWorkers=1
npm test -- --run renderers/relief/relief-spatial-index.test.ts renderers/draw-relief-icons.test.ts --maxWorkers=1
npm run build
npm run lint
```

Do not automatically run Playwright. Run the relevant E2E set only as an explicit release-gate action.

### Manual Jotun checks

- Pan and zoom with the normal working layer combination.
- Toggle relief repeatedly and confirm no stale or duplicated icons.
- Open the relief editor; select, move, resize, add, bulk-remove and reorder icons.
- Save, reload and compare relief order and appearance.
- Export SVG and verify the full map contains relief outside the current viewport.
- Export PNG/JPEG and confirm no viewport-culling omissions.
- Repeat the relief-on/off telemetry after a warm-up gesture.

## Acceptance targets

All functional invariants must pass. Performance targets on the target PC and Jotun map are:

- relief-on movement is subjectively as responsive as the relief-off control;
- active-process mean CPU is no more than twice the relief-off trace under the same gesture;
- no repeated full-scene scan occurs for an ordinary pan inside materialized bounds;
- a small pan retains the majority of already-visible relief nodes;
- after warm-up, a 22-second interaction does not add more than 10 MB retained private memory per large process;
- any transient allocation substantially returns within 30 seconds idle;
- no continuing handle, thread, listener or DOM-node growth across twenty toggle/zoom cycles;
- full-map exports remain complete and visually equivalent.

If OS process memory remains high but stable while frame time, DOM churn and repeat-cycle growth pass, record its
cause as unconfirmed unless a profiler establishes attribution. Do not block 2.0 solely on an absolute memory number.

## Suggested commit boundaries

1. `Add relief performance diagnostics`
2. `Schedule viewport layers independently`
3. `Reconcile relief icons by stable key`
4. `Index relief icons by viewport`
5. `Tune relief interaction cadence` if Phase 4 is needed
6. `Cache distant relief rendering` only if Phase 5 passes its decision gate

Each commit must build and pass its targeted tests. Do not combine the scheduler, spatial index and DOM reconciliation
into one commit; the measured effect and rollback point of each repair should remain visible.


## Distant-view raster prototype checkpoint (1.153.3)

Approved by the user after the scheduler Chromium comparison. Build stage: `distant-relief-raster`.
Installer: `release/relief-raster-prototype/azgaar-archival-fork-1.153.3-win-x64.exe`.

- Enabled by default in this candidate only through the internal `reliefRasterPrototype` localStorage flag. Set its
  value to `off` and reload to compare the same build using SVG; remove the key and reload to restore the prototype.
- Uses tiles at scale <= 2; closer views and the open relief editor use individual SVG icons. Clicking a distant tile
  opens the relief editor and restores SVG; select the desired individual icon after entering the editor.
- Tiles are 256 map units wide, rasterized at twice device pixel density to support the distant zoom range. Source
  icons are retained in order. A two-pixel gutter is rendered and cropped for boundary sampling.
- Generates one tile at a time and limits estimated decoded cache storage to 128 MiB. This is a tile-cache estimate,
  not a cap on whole-process/GPU memory: one in-flight SVG/PNG/canvas decode and browser overhead are additional.
  Requests exceeding that limit or a 2048-pixel tile edge fall back to SVG. Old unrequested cache entries are disposed.
- Keeps SVG visible until the requested tiles are ready. Entering uncached areas can temporarily return to SVG while
  new tiles build. This deliberately conservative first prototype may still show warm-up or boundary stalls.
- Edits, direct relief draws (including size/set/generation), hide, map/root replacement, and display-density changes
  invalidate tiles. Close zoom/editor entry cancels work. Generation tokens reject obsolete completions.
- The relief group's opacity/filter/mask remain on the live parent. No raster data is serialized. Full-map and viewport
  export clones continue to materialize ordered vector relief from source data independently of the live mode.
- Diagnostics include initial/final `reliefRendering` (mode, enabled flag, editing, estimated cache bytes, failure) and
  opt-in raster tile timings. Tile timings include asynchronous decode/encode wall time, not just JavaScript CPU.

Local verification includes lifecycle and integration tests for sequential generation, eviction, cancellation,
failure fallback, limits, crossing tiles, atomic mode replacement, vector export isolation, editor entry and close
zoom. The existing renderer/IO tests remain applicable. Desktop TypeScript/build and source lint passed.

An isolated Electron 43.4.1 visual probe used original Jotun symbols and 12,257 saved source icons at DPR 1.625.
For a sampled 1182 x 739 view it built 24 tiles in 864 ms with 66,453,504 estimated decoded bytes (~63.4 MiB).
Completed vector/raster screenshots had a mean absolute BGRA-channel difference of 0.672 on a 0-255 scale;
visual inspection showed preserved shape/placement and no obvious seams in that sample. This is not a full-app
speedup result or proof for every zoom/style. Target-PC navigation, editor/save/export and boundary checks remain pending.


### Target-PC update (2026-09-14)

The user reports much better navigation once loaded, including zooming, with a longer initial wait. New captures
confirm improved responsiveness and no half-second Layerize calls in the supplied DevTools trace. However, the
application captures report SVG at both endpoints and show vector phases for every recorded relief reconciliation.
DPR 2.6 also pushes wide-view requests beyond the 128 MiB cache budget; some fitting requests take seconds to build.
See baseline analysis for exact measurements. Keep warmed responsiveness, cold-start cost and verified raster
activity distinct. Next refinement: mode/fallback visibility and transition metrics, then budget-aware tile planning
and reuse. Editing/save/export confirmation remains pending; do not mark the full acceptance gate passed.


## Cache and request refinement checkpoint (1.153.4)

The user approved optimization before any memory increase and deferred manual editing/save/reload/export checks
until the end. The decoded tile-cache cap remains exactly 128 MiB. Capture stage: `relief-raster-cache-reuse`.
Installer: `release/relief-raster-cache-reuse/azgaar-archival-fork-1.153.4-win-x64.exe`.

- Tile density follows 1x, 1.5x and 2x zoom bands, rounding upward to meet the current device pixel density. The
  previous prototype paid for 2x in every distant view. This removes unnecessary supersampling at lower zoom;
  it does not undersample the current display or change source/export detail. Zoom-band transitions may warm again.
- Raster requests cover the actual visible viewport, with centre tiles built first. SVG retains its existing overscan.
  An opt-in viewport-sensitive scheduler hook updates relief on small distant pans so coverage remains correct when
  raster requests do not include the SVG overscan. Other layers retain their normal guard behavior.
- Recently used tiles survive nearby pans and close-zoom/editor entry. Sequential allocation evicts only unrequested
  least-recently-used entries when needed. Real edits, direct relief draws, hide, map/root and DPR changes still clear
  the cache. Pause cancels obsolete in-flight work without discarding valid completed tiles.
- Standalone tile SVGs include only used self-contained relief symbols. Referenced or unfamiliar definitions retain
  the full definition set so dependencies are not silently lost.
- A prototype-only bottom-left badge shows raster, tile build progress, or the reason SVG is active. It sits outside
  the map/export SVG. Capture `display` records include mode, reason, estimated cache bytes and tile progress on
  reconciliation and tile completion, supplementing initial/final snapshots. Existing bounded collection still applies.
- Tested reproduction of the supplied 1231 x 770 viewport at scale 1 / DPR 2.6 requests 24 tiles of 666 pixels each,
  totaling 42,581,376 decoded bytes (~40.6 MiB), without raising the cap. This is allocation evidence, not a timing claim.

Validation: 119 targeted tests across 12 files; source lint; renderer/Electron TypeScript and build. Tests cover the
observed high-DPR request, native-resolution bands, LRU eviction at the limit, reuse after close zoom, real-edit
invalidation, visible status/recording, small-pan coverage, symbol dependency preservation and existing IO regressions.
An isolated Electron vector/raster visual comparison passed inspection for sampled shape/placement and obvious
seams. Its runtime reported DPR 1; it is not a target-PC DPR 2.6 timing benchmark. Full-app cold/warm recordings remain
necessary. Functional manual checks remain deferred as requested, not marked passed.
