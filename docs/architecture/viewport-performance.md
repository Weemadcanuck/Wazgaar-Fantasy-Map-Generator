# R&R: viewport rendering performance

Scope: relief icons and coastal bands/waves during pan and zoom. This contribution excludes Obsidian export, custom layers, desktop identity changes, font changes and the Tools panel redesign.

- `draw-relief-icons.ts` owns live SVG reconciliation and the editing/export boundary.
- `relief/` plans distant tiles and preserves mixed SVG/raster coverage.
- `coastal-raster.ts` caches distant bands and waves, retaining original vectors for close zoom and save/export.
- `svg-raster.ts` provides sequential, cancellable, bounded tile generation and reuse.
- `png-encoder.ts` moves PNG encoding to a reusable worker with a canvas fallback.
- `viewport/` invalidates layers independently; metrics are inactive unless explicitly enabled.

Relief data remains editable and serialized. Cached images are transient. Exports use full-detail vectors. Tiles survive relief toggles and close-zoom return; edits, style/root replacement and display-density changes invalidate affected caches.

The decoded-pixel budgets are 512 MiB for relief and 128 MiB for coastal decoration, allocated on demand. These are not total process-memory limits. New coastal coverage uses SVG until complete, so uncached navigation can still stutter. Close views use SVG.

Validate dense relief in Pale, Ink, Cinderwood and Frostbite: cold loading, warm pan/zoom, relief off/on, editor copy/move/resize, empty relief, save/reload and SVG/PNG export. Test on a consistent display and record background application load. Run application tests, lint and builds. Native test automation supplements the contributor's manual browser checks.

The initial local extraction passes 1,250 application tests and the desktop build. It is based on official upstream commit bf32ac7230654361eedfc25985b4ecc3473889b1. No map-format or application-version changes are required.
