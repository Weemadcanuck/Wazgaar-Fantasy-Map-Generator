# Azgaar Obsidian Fork

An Obsidian-oriented fork of Azgaar’s Fantasy Map Generator. The app displays its version in the About tab and information popup. Desktop releases retain the earlier archival-fork installation and storage identifiers for compatibility.

## Maintainer overview

This fork adds Obsidian reference export, editable custom point layers, and relief rendering improvements. It is a fork for review, not an official upstream release. Upstream credits and licensing remain below.

| Area | Start here | Responsibility |
| --- | --- | --- |
| Obsidian export | `src/services/io/archive-export.ts` | Pure Markdown/manifest plan; profiles and download UI sit alongside it. |
| Desktop writes | `electron/archive-export-writer.ts` | Preview conflicts, preserve author edits, write the manifest last. IPC stays in `archive-export-ipc.ts`. |
| Custom layers | `src/generators/custom-layers.ts` | Serializable `pack.customLayers`; editor and renderer are `custom-layers-editor.ts` and `draw-custom-points.ts`. |
| Relief | `src/renderers/draw-relief-icons.ts` | SVG reconciliation, editor/export boundary, raster lifecycle. |
| Tile cache | `src/renderers/svg-raster.ts` | Shared bounded cache and SVG tile conversion; `relief/` owns relief planning and mixed coverage. |
| Coastal decoration | `src/renderers/coastal-raster.ts` | Distant-view bands and waves; restore original vectors for save/export. |
| PNG encoding | `src/renderers/png-encoder.ts` | Cancellable reusable worker, with canvas fallback. |
| Viewport | `src/renderers/viewport/viewport-renderer.ts` | Independent per-layer invalidation and viewport scheduling. |

### Upstream integration (1.154.0)

The supplied upstream snapshot identifies itself as 1.153.0 in source and package metadata, despite its folder name. The fork app is 1.154.0; `.map` headers use the upstream format version, 1.153.0. Keep these version numbers separate.

Journeys retain upstream slot 52. Slot 53 contains a labelled, versioned Obsidian extension for custom layers, the Archive world ID, and original legacy notes. `src/services/io/fork-data.ts` recognizes older fork saves and selects their real upstream migration baseline, 1.149.2. Original notes are retained because upstream cannot attach every old regiment note to an entity; Tools > Original notes backup downloads them.

Test with copies of existing maps. New saves are not compatible with the older Obsidian fork. The integration keeps upstream settings, notes, journeys and UI changes alongside the fork features.

### Relief rules worth preserving

- `pack.relief` remains editable source data. Runtime IDs, clip paths and tiles are transient. Missing relief and intentionally empty relief are distinct.
- Distant views (scale ≤ 2) use cached raster tiles; close views and editing use SVG. Exports rebuild full-detail vectors from source data.
- While a view warms, cached tiles stay visible and SVG covers missing regions. Publish the completed batch together: updating clipping after each tile was measured to slow loading.
- Unchanged tiles survive zoom and layer toggles. Edits, replacement maps/roots and display-density changes invalidate them. Sharper tiles can satisfy lower-resolution requests.
- The cache is capped at 512 MiB of estimated decoded pixels, not total process memory. Least-recently-used tiles outside the requested coverage can be evicted. The budget is allocated on demand. Cold views and very large icons still take time to load.
- The loading badge explains this wait. Tools → Record performance is opt-in and bounded. For diagnosis, set localStorage `reliefRasterPrototype` to `off` and reload for SVG only; the old key is retained for compatibility.

### Build and checks

Use Node.js 24 and run commands from the extracted source root:

```sh
npm ci
npm test -- --run
npm run test:electron -- --run
npx biome check src electron
node scripts/sync-version.js --check
node scripts/stamp-assets.js --check
npm run build
npm run electron -- build
```

`npm run dev` starts the browser version; `npm run electron` starts the desktop version. `npm run electron -- dist --win --publish never` builds a Windows installer. Playwright is a separate, explicitly run check (`npm run test:e2e`).

Version comes from `src/services/versioning.ts`; run `npm run sync-version` after changing it. Keep the legacy desktop app ID, origin and profile directory stable: they preserve installed settings and local maps despite the new display name.

### Rendering fixes (1.154.4)

PNG encoding runs in a reusable worker instead of waiting for main-thread idle canvas encoding. Each tile builder owns its encoder; cancellation discards obsolete work. GPU drawing and decoded pixels are preserved, with a canvas fallback if workers are unavailable.

Distant coastal bands and waves share a separate 128 MiB decoded-pixel cache. Their nested vector masks were a large cost even with relief hidden. Original vectors remain available for close zoom and are restored in save/export clones. Ocean redraws, coastline edits, replacement roots and display-density changes invalidate the cache. This budget is allocated on demand, in addition to the existing 512 MiB relief budget; neither is a total process-memory limit.

New coastal areas initially use vectors until all visible tiles are ready, so cold navigation can still stutter. Warm navigation reuses tiles. Close zoom remains SVG. No map-format change is introduced.

Validation: 1,290 application tests, 17 desktop tests and 52 script tests pass, with lint, version/assets checks and web/desktop builds. Native Jotun checks cover Pale, Ink, Cinderwood and Frostbite; off/on and close-zoom tile reuse; copy, resize and drag; exact relief/custom-layer/world-ID/legacy-note save/reload; and full-detail SVG/PNG export. Twenty-four native comparisons found identical decoded worker/canvas PNG pixels, including enlarged icons.

On the tested laptop at display density 2.6, a same-session warm pan measured median frame intervals of 24/30/36 ms for cached Ink/Cinderwood/Frostbite versus 139/412/333 ms for their original coastal vectors. Pale stayed around 30 ms. These are requestAnimationFrame intervals, not presented FPS or clean single-app benchmarks: another app version was running during part of the investigation. Initial coverage and newly exposed tiles remain slower.

### Relief styles (1.154.3)

Older maps can embed relief definitions that predate newer built-in symbol sets. Tile serialization resolves missing symbols from the live document, matching SVG use lookup, without changing the saved map definitions. A Cinderwood/Jotun Electron check confirms visible raster output; 1,282 application tests pass. The later 1.154.4 changes also address ocean embellishments and coastal bands.

### Tools panel (1.154.2)

Tools uses native collapsible categories with Expand all / Collapse all controls. Edit and Add start open. Content controls the panel height; the Tools area scrolls when necessary to keep the footer on screen. Height limits are recalculated on section toggles, panel opening/tab changes, drag completion and window resizing, with no polling or map-frame work.

### Performance retest (1.154.1)

Use the same screen, window size and application zoom for each capture. Record a loading view, then a fully warmed pan/zoom route, relief off, and the same route after relief is re-enabled. Diagnostics include pan/zoom history, per-frame zoom-handler time, tile resolution and SVG preparation/load, canvas drawing and PNG encoding times. Cache counters are cumulative since the last invalidation; hits and misses count tiles per view request, not unique tiles. Compare initial and final counters within each capture.

The larger cache reduces eviction pressure; it does not claim to speed up first-time decoding. Keep native display density and full-detail export. The 1.154.1 changes pass 1,281 application tests and a real Electron diagnostic capture plus Jotun save/reload checks. Asynchronous tile timings include scheduling waits and should not be read as CPU time.

### Validation and limits

Integration verification: 1,279 application tests, 17 desktop tests and 52 script tests passed, along with lint, version/asset checks and web/desktop builds. An isolated Electron session loaded and resaved the supplied Jotun map, then reloaded it: all 12,032 relief icons, the custom layer, world ID and 226 original notes matched the source exactly. Installed performance and visual export checks remain for user validation.

Relief was manually checked for warm navigation, mixed coverage, editing, save/reload, SVG/PNG exports, and off/on reuse. Large-map cold loading remains a known cost. The completely empty save/reload case is unit-tested; the supplied sparse manual fixture still had 50 icons. Those manual checks apply to the previous stable fork. The integration candidate requires a fresh installed-app check. Automated migration checks cover legacy fork data and coexistence of journeys and custom layers. Playwright and other operating systems were not exercised in this review.

Obsidian export is one-way generated reference output, not bidirectional vault synchronization. Removed notes remain on disk for review. Writes are atomic per file, not a transaction across the folder; a disk failure can leave partial output before the manifest is committed. See `docs/architecture/archive-integration.md` for ownership and identity rules.

For upstream review, split relief/scheduling, Obsidian export, custom layers, and branding into focused proposals as required by `CONTRIBUTING.md`. This checkout began as a source snapshot with an exporter already present; it has no configured upstream remote or verified pristine upstream base. Establish that base before preparing mergeable PRs.

A sharing folder should contain the Windows installer, this README, and a source ZIP. The ZIP includes source, tests, build configuration and licenses; it excludes dependencies, old builds, private recordings, local work, and internal performance planning notes. Extract it before following source links or running commands.

## Upstream project

# Fantasy Map Generator

Azgaar's _Fantasy Map Generator_ is a free web application that helps fantasy writers, game masters, and cartographers create and edit fantasy maps.

Link: [azgaar.github.io/Fantasy-Map-Generator](https://azgaar.github.io/Fantasy-Map-Generator).

Refer to the [project wiki](https://github.com/Azgaar/Fantasy-Map-Generator/wiki) for guidance. Development is tracked on the [FMG dev board](https://github.com/users/Azgaar/projects/3). Some details are covered in my old blog [_Fantasy Maps for fun and glory_](https://azgaar.wordpress.com).

[![preview](https://github.com/Azgaar/Fantasy-Map-Generator/assets/26469650/9502eae9-92e0-4d0d-9f17-a2ba4a565c01)](https://github.com/Azgaar/Fantasy-Map-Generator/assets/26469650/11a42446-4bd5-4526-9cb1-3ef97c868992)

[![preview](https://github.com/Azgaar/Fantasy-Map-Generator/assets/26469650/e751a9e5-7986-4638-b8a9-362395ef7583)](https://github.com/Azgaar/Fantasy-Map-Generator/assets/26469650/e751a9e5-7986-4638-b8a9-362395ef7583)

[![preview](https://github.com/Azgaar/Fantasy-Map-Generator/assets/26469650/b0d0efde-a0d1-4e80-8818-ea3dd83c2323)](https://github.com/Azgaar/Fantasy-Map-Generator/assets/26469650/b0d0efde-a0d1-4e80-8818-ea3dd83c2323)

Join our [Discord server](https://discordapp.com/invite/X7E84HU) and [Reddit community](https://www.reddit.com/r/FantasyMapGenerator) to share your creations, discuss the Generator, suggest ideas and get the most recent updates.

Report bugs with the [bug report form](https://github.com/Azgaar/Fantasy-Map-Generator/issues/new?template=bug_report.yml), suggest features in [Ideas discussions](https://github.com/Azgaar/Fantasy-Map-Generator/discussions/categories/ideas), and ask usage questions in [Q&A](https://github.com/Azgaar/Fantasy-Map-Generator/discussions/categories/q-a). Search existing reports first. For bugs, include your FMG version, browser/OS, reproduction steps and an affected `.map` file in a ZIP archive when relevant. For ideas, explain the problem and your use case.

In Discord, use `#fmg-bugs` or `#fmg-suggestions`; the assistant's `/bug` and `/idea` commands, when available, open forms for moderator review before GitHub submission. Asking the assistant a question does not file a report. See [reporting instructions and examples](https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Reporting-bugs-and-ideas).

Contact me via [email](mailto:azgaar.fmg@yandex.com) for non-public suggestions. For performance problems, first check the [performance tips](https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Q&A#the-map-performance-is-poor-how-can-i-improve-it).

You can support the project on [Patreon](https://www.patreon.com/azgaar).

_Inspiration:_

- Martin O'Leary's [_Generating fantasy maps_](https://mewo2.com/notes/terrain)

- Amit Patel's [_Polygonal Map Generation for Games_](http://www-cs-students.stanford.edu/~amitp/game-programming/polygon-map-generation)

- Scott Turner's [_Here Dragons Abound_](https://heredragonsabound.blogspot.com)

## Desktop app

Installers for Linux, Windows and macOS are attached to each
[release](https://github.com/Azgaar/Fantasy-Map-Generator/releases). Nix users can build
the same app from the flake instead — see [Install with Nix](https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Install-with-Nix):

```sh
nix run github:Azgaar/Fantasy-Map-Generator
```

## Contribution

Pull requests are highly welcomed. The codebase is messy and I will appreciate if you start with minor changes. Check out the [data model](https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Data-model) before contributing.

The codebase is gradually transitioning from **vanilla JavaScript to TypeScript** while maintaining compatibility with the existing generation pipeline and old `.map` user files.

The expected **future** architecture is based on a separation between **world data**, **procedural generation**, **interactive editing**, and **rendering**. The application is conceptually divided into four main layers: world data and styles (state), generators (model), editors (controllers), renderers (view).

Flow:
settings → generators → world data → renderer
UI → editors → world data → renderer.

The data layer must contain no logic and no rendering code. Generators implement the procedural world simulation. Editors implement interactive editing tools used by the user. They perform controlled mutations of the world state. Editors can be viewed as interactive generators. The renderer converts the world state into SVG or WebGl graphics. Renderer must be pure visualization step and not modify world data.
