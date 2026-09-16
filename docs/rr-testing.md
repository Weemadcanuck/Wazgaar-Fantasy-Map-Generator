# R&R testing prerelease 1.153.0-rr.1

Windows x64 test build of the relief and coastal viewport performance changes. Performance source: `ed3a43c`; official upstream base: `bf32ac7`. This release does not include the Obsidian integration, custom layers, Tools redesign or experimental pre-rendered symbols.

## Install

Download and run `azgaar-rr-1.153.0-rr.1-win-x64.exe`. The application is named **Azgaar RR Testing**, has its own installation identity, and stores settings/local maps in `%APPDATA%/azgaar-rr-testing`. Keep the installer's separate default destination. Load a copy of your map file; existing apps' local maps are not imported automatically.

This test build updates manually from this repository's Releases page. It does not download or install upstream app updates. No trusted publisher certificate is included, so Windows may display its usual unknown-publisher warning.

## What to test

- Load a dense map and compare Pale, Ink, Cinderwood and Frostbite with the same layers, display and window size.
- Observe the initial tile-loading wait, then pan and zoom along the same route after tiles are ready.
- Turn relief off and back on; zoom close enough for SVG, then return to the distant view.
- Copy, move and resize relief, then save/reload a map copy and inspect SVG/PNG exports.
- Use **Tools > Record performance** (also searchable) for optional JSON captures. Label cold loading and warmed navigation separately; note other running map instances and your display scale.

Distant relief, coastal bands and waves use reusable raster tiles. Close views remain SVG. Loading previously unseen coastal areas can still stutter. Decoded-pixel budgets are 512 MiB for relief and 128 MiB for coastal decoration, allocated as needed; total process memory can be higher. The performance recorder is inactive until requested.

## Version and validation

`1.153.0-rr.1` is the first R&R prerelease in a separate testing line. The base follows the source's version metadata; the map format remains `1.153.0`. Later test builds increment the numeric prerelease identifier. Published installers are immutable; changes receive a new version. See [Semantic Versioning](https://semver.org/).

The performance extraction passed 1,251 application tests, lint and builds, with native four-style checks for cache reuse, editing, save/reload and exports. The packaging branch changes only desktop identity, update behaviour and visible test-build labelling. Build it with `npm ci` and `npm run electron -- dist --win --x64 --publish never`. Package metadata applies the prerelease version through `electron-builder.yml`; it deliberately leaves the renderer/map version unchanged.
