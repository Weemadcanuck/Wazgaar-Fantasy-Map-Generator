# Archive and Obsidian integration

## Status

This document defines the compatibility boundary for an Archive-oriented FMG fork. It is a design contract, not a claim that two-way synchronization is already implemented.

The first implementation must be an additive export service. It must not change the `.map` format, regeneration behavior, or the meaning of existing FMG fields.

The current fork implements the pure export plan, a full-JSON command-line writer, and an in-application `Archive package (.zip)` download. The application prompts for a stable world ID, stores it locally by map ID, and packages the manifest and generated Markdown beneath one world directory. Direct vault writes, managed-block updates, and reverse synchronization remain unimplemented.

## Goals

- Export one FMG world as deterministic Markdown and machine-readable metadata.
- Make every generated entity addressable without treating its current name or file path as identity.
- Preserve the Archive's distinction between generated reference data and hand-written canon.
- Allow repeated exports without duplicating notes or silently overwriting author-owned prose.
- Establish a safe basis for later, explicitly controlled Obsidian-to-FMG updates.
- Keep the integration useful to ordinary Obsidian vaults through configurable profiles rather than hard-coding one vault layout into the domain model.

## Non-goals for the first implementation

- Watching a vault for changes.
- Writing directly into hand-written lore folders.
- Importing arbitrary Markdown or YAML into FMG.
- Treating generated population, military, diplomacy, expansionism, or alert values as canon.
- Replacing FMG's state, province, or burg data structures.
- Changing the existing full JSON or `.map` save formats.

## Architecture

The integration has four boundaries:

1. **World snapshot** - a plain serializable projection of current FMG data.
2. **Archive profile** - paths, entity selection, field policy, naming policy, and templates.
3. **Export plan** - an in-memory list of files and a manifest. This layer is pure and testable.
4. **Writer** - browser download or desktop filesystem output. Filesystem access stays outside the exporter.

The pure exporter belongs in `src/services/io/`. Desktop writes require a narrow Electron IPC facade; render code must never receive unrestricted filesystem access.

The initial executable path should also support full JSON as input. This makes the exporter testable against saved fixtures and lets it reproduce the existing Jotun import without requiring the desktop app.

## Identity

Names and paths are presentation data. They can change and can collide across entity types. For example, Jotun currently contains both a state and a culture named `Azar`.

Every entity key has this form:

```text
<worldId>:<entityType>:<nativeId>
```

- `worldId` is created once when an export profile is initialized. It is not derived from a filename or map name.
- `entityType` is a controlled value such as `state`, `province`, `burg`, `culture`, `religion`, `river`, or `marker`.
- `nativeId` is FMG's array index or entity ID.

Native IDs are stable during ordinary editing because removed FMG records retain their array positions. Regeneration, transform, submap, or replacement can invalidate that relationship. Those operations must trigger an identity review, not an automatic remap by name.

An entity may additionally carry an Archive note target, but that target is a relationship in the manifest and never replaces the FMG key.

## Manifest

Each export root contains `azgaar-archive-manifest.json` with at least:

```json
{
  "schemaVersion": 1,
  "worldId": "user-created-stable-id",
  "worldName": "Jotun",
  "source": {
    "fmGeneratorVersion": "1.149.2",
    "mapId": 123456789
  },
  "profile": "archive-reference-v1",
  "entities": {
    "user-created-stable-id:state:8": {
      "name": "Azar",
      "path": "States/Azar (Azgaar State).md",
      "contentHash": "...",
      "archiveTarget": null
    }
  }
}
```

The manifest records only integration metadata. It must not become a parallel store for world lore.

`contentHash` covers the generated projection, not author-owned text. A later importer can use it to distinguish a new FMG export from an author edit.

## Filename and link policy

Default filenames are globally unique within an Obsidian vault:

```text
<display name> (Azgaar <entity type>).md
```

Links emitted by the exporter use these qualified names. Sanitization must handle Windows-reserved characters and names, case-insensitive collisions, and duplicate display names within the same entity type. When qualification is still insufficient, append the native ID.

Renaming an entity produces a planned move only when the previous path is known from the manifest. A first export never guesses that two similarly named files are the same entity.

## Authority and field ownership

The default Archive profile exports generated data into a reference-data root such as `30_Assets/Azgaar Sync/<world>`. It does not write into `10_Lore`.

| Data | Default owner | Export behavior |
| --- | --- | --- |
| Entity ID and FMG relationships | FMG | Machine-readable and visible as useful |
| Coordinates, cell, elevation, biome | FMG | Visible reference data |
| Geometry, area calculations, adjacency | FMG | Machine-readable; concise visible summary |
| Port, capital, settlement features | FMG | Visible reference data |
| Heraldry | FMG | Export or link as generated asset |
| Generated population and demographics | Neither | Suppressed by default or explicitly labelled unapproved |
| Military, alert, expansionism | Neither | Suppressed by the Archive profile |
| Generated diplomacy | Neither | Suppressed by default; never overrides lore |
| Canon prose, aliases, motives, disputes | Archive | Never overwritten by reference export |
| Author-only truth and open development | Archive | Never exported to FMG by default |

The Markdown header must mark provenance explicitly. It must not use `Canon_status: canon`, and it must not imply that `draft` generated content is awaiting automatic promotion. The initial profile should use an integration-specific field such as:

```yaml
Source_type: Azgaar-generated-reference
Azgaar_key: <worldId>:<entityType>:<nativeId>
Azgaar_schema: 1
```

Archive core properties may be added only where their meaning is exact. All property names must follow the Archive's capitalized-key convention.

## Safe repeated export

The writer operates on an export plan and the previous manifest:

- Create or replace generated files whose keys are known.
- Move a generated file when the same key has a new planned path.
- Report files removed from FMG; do not immediately delete them from the vault.
- Refuse to overwrite a file whose generated hash no longer matches unless the profile uses managed blocks or the user explicitly accepts the conflict.
- Write the new manifest last, after all entity files succeed.
- Produce a dry-run report with creates, updates, moves, removals, and conflicts.

The first implementation can safely regenerate a dedicated staging directory. Direct vault output should be added only after conflict detection and atomic writes exist.

## Markdown ownership model

Whole-file ownership is appropriate for `30_Assets` reference notes. Two-way synchronization requires a stricter model:

```markdown
<!-- azgaar:begin generated <entity-key> -->
Generated projection owned by FMG.
<!-- azgaar:end generated <entity-key> -->

Author-owned prose outside the block is preserved.
```

An Obsidian importer may read only explicitly allowed properties or managed blocks. It must ignore ordinary prose by default. Every proposed change is presented as a preview and must identify its target FMG key.

## Import phases

1. **Reference export** - full JSON or live map to deterministic Markdown and manifest.
2. **Desktop export** - user-selected directory through narrow IPC, with dry-run and conflict reporting.
3. **Linking** - optional manifest relationships from generated entities to hand-written Archive notes.
4. **Controlled import** - allow-listed fields such as display name or note text, with a preview and explicit confirmation.
5. **Optional managed blocks** - bidirectional fields with per-field ownership and three-way conflict detection.
6. **Optional watcher** - only after the manual pipeline is trustworthy; never enabled by default.

## Archive-oriented domain evolution

The fork may later expose a more story-useful political hierarchy, but this must be an adapter over the current model before it becomes a save-format change:

- **Polity** projects a state or another sovereign political unit.
- **Territory** projects a province, dependency, colony, march, protectorate, or other governed division.
- **Settlement** projects a burg without assuming every important place is an incorporated city.

Useful future fields include relationship type, administrative role, sovereignty claimant, de facto controller, parent territory, settlement role, and Archive note target. They should first live in an extension namespace keyed by stable entity identity. Generator changes can then consume an Archive generation profile without breaking ordinary FMG maps.

The first Archive generation profile should affect labels, hierarchy rules, and requested counts only after reference export is proven. It must not use generated economic or military values as a substitute for authored worldbuilding.

## Initial implementation slices

### Slice 1: deterministic exporter

- Define snapshot, profile, manifest, and export-plan types.
- Build Markdown for active states, provinces, burgs, cultures, and religions.
- Reproduce Jotun counts and relationships from `Jotun Full.json`.
- Add fixtures for name collisions, removed records, missing parents, and unsafe filenames.
- Generate a dry-run report and manifest.

### Slice 2: command-line writer

- Read a full JSON export.
- Write to an explicit output directory.
- Never infer or scan for a vault.
- Validate all planned paths remain inside that output directory.
- Write UTF-8 Markdown deterministically.

### Slice 3: FMG integration

- Register the export service through the service registry.
- Add an Obsidian/Archive export control next to JSON export.
- Browser builds download an export artifact.
- Desktop builds may write to a selected folder through restricted IPC.

## Acceptance criteria for the first milestone

- The same input and profile produce byte-identical Markdown and manifest output.
- Jotun exports 16 active states, 31 active provinces, 131 active burgs, 18 active cultures, and 15 named religions.
- The two `Azar` entities have different filenames and correct links.
- Removed FMG array records are not exported as active notes.
- No field disallowed by the Archive standing ruling appears as unqualified canon.
- No command writes to the Archive vault unless the output path is explicitly supplied.
- Existing `.map` and JSON exports remain byte-compatible and unaffected.
