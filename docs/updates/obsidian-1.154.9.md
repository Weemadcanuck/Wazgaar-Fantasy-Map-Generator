# Obsidian Fork 1.154.9 testing candidate

Maintenance update based on upstream `b944003c` (October 3, 2026). The app remains on the upstream 1.153 map format; the forthcoming upstream 1.154.0 rework is still unmerged.

- Repair ocean-pattern references in old and previously resaved maps, and make assignment brushes follow short movements and turns.
- Fix clipped filtered PNG/JPEG exports when zoomed out. This fix was already on `obsidian/main` but absent from the 1.154.8 installer.
- Preserve multiline curved labels, text case, blur filters and embedded image references in SVG exports for external editors.
- Restore citadel controls and settlement group filters. Turning off a market center's Market feature now offers to remove the market; market names are escaped in confirmation dialogs.
- Add the option to keep each merged polity as a province, replacing its former provinces.
- Update Electron to 43.5.0 and the upstream dependency lockfile. Nix dependencies now come directly from the lockfile.

The existing Obsidian export, custom layers, relief/coastal caches, desktop profile, fullscreen workaround and Polities/Settlements terminology are retained. Map headers remain `1.153.0`; the fork extension schema is unchanged.

Download `azgaar-obsidian-fork-1.154.9-win-x64.exe` from the testing prerelease. Close the app before installing. Updates are manual; the installer is unsigned and `SHA256SUMS.txt` provides its checksum. Keep copies of your maps for testing.

## Validation

1,308 application tests, 17 desktop tests and 52 script tests passed, with lint, version/asset checks and web/desktop compilation. Export tests now use a committed map fixture instead of an external Jotun JSON file; migration tests preserve section boundaries in Git-normalized fixtures. A fork-specific workflow verifies and packages Windows testing prereleases.

Approved by the user on October 4, 2026 after testing both updated forks and reporting faster performance than the previous builds.

Regression checklist:

- Old-map loading and save/reload, including journeys, custom layers, world IDs and original notes.
- Obsidian export into a test folder, with edited notes preserved on repeat export.
- Dense relief in Pale, Ink, Cinderwood and Frostbite: cold loading, warm pan/zoom, layer toggles, editing and full-detail exports.
- Focused/unfocused fullscreen and windowed pan/zoom after the Electron update.
- Zoomed-out filtered PNG/JPEG exports and multiline curved SVG labels in your external editor.
- Citadel toggles/group filters, market removal and polity merging with the new province option.

Illustrator import remains unverified. SVG compatibility fixes do not correct labels that already exceed their paths in the app.
