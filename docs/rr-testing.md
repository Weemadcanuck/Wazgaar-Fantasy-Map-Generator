# R&R testing prerelease 1.153.1-rr.3

Windows x64 test build of the relief and coastal viewport performance changes. Performance source: `ed3a43c`; official upstream base: `b944003c`. This testing candidate does not include the Obsidian integration, custom layers, Tools redesign or experimental pre-rendered symbols.

## Maintenance changes

- Repair broken ocean-pattern references in older and previously resaved maps (upstream #1879).
- Make assignment paint brushes follow short pointer movements and turns (upstream #1881).
- Fix zoomed-out filtered image exports (#1886) and SVG compatibility with external editors (#1929).
- Restore citadel controls and filters, escape market names, and offer market removal when a center loses its Market feature.
- Allow merged states to become provinces (#1888).
- Update Electron to 43.5.0 and upstream dependency/Nix maintenance.
- Retain the existing R&R rendering implementation and testing scope.

## Install

Download and run `azgaar-rr-1.153.1-rr.3-win-x64.exe`. The application is named **Azgaar RR Testing**, has its own installation identity, and stores settings/local maps in `%APPDATA%/azgaar-rr-testing`. Keep the installer's separate default destination. Load a copy of your map file; existing apps' local maps are not imported automatically.

This test build updates manually from this repository's Releases page. It does not download or install upstream app updates. No trusted publisher certificate is included, so Windows may display its usual unknown-publisher warning.

## What to test

- Load a dense map and compare Pale, Ink, Cinderwood and Frostbite with the same layers, display and window size.
- Observe the initial tile-loading wait, then pan and zoom along the same route after tiles are ready.
- Turn relief off and back on; zoom close enough for SVG, then return to the distant view.
- Copy, move and resize relief, then save/reload a map copy and inspect SVG/PNG exports.
- Use **Tools > Record performance** (also searchable) for optional JSON captures. Label cold loading and warmed navigation separately; note other running map instances and your display scale.

Distant relief, coastal bands and waves use reusable raster tiles. Close views remain SVG. Loading previously unseen coastal areas can still stutter. Decoded-pixel budgets are 512 MiB for relief and 128 MiB for coastal decoration, allocated as needed; total process memory can be higher. The performance recorder is inactive until requested.

## Version and validation

`1.153.1-rr.3` is the third R&R prerelease. It integrates upstream maintenance through `b944003c` (October 3, 2026); upstream 1.154.0 remains unmerged. The base and renderer/map version follow upstream `1.153.1`. Later test builds increment the numeric prerelease identifier. Published installers are immutable; changes receive a new version. See [Semantic Versioning](https://semver.org/).

The original performance extraction passed 1,251 application tests, lint and builds, with native four-style checks for cache reuse, editing, save/reload and exports. The packaging branch changes only desktop identity, update behaviour and visible test-build labelling. Build it with `npm ci` and `npm run electron -- dist --win --x64 --publish never`. Package metadata applies the prerelease version through `electron-builder.yml`; it deliberately leaves the renderer/map version unchanged.

Candidate checks passed: 1,269 application tests, 52 script tests, lint, version synchronization, asset stamps and web/desktop compilation. The fork release workflow verifies and packages the Windows x64 prerelease. The packaged application reports `1.153.1-rr.3`. Native Windows checks are pending; recheck fullscreen after the Electron update, filtered PNG/JPEG exports, curved SVG labels in external editors, citadel controls, market removal and state merging as provinces. Illustrator import remains unverified.
