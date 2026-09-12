import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ArchiveWorldSnapshot, buildArchiveExportPlan } from "../src/services/io/archive-export";
import type { ArchiveDirectoryRequest } from "../src/types/archive-export-ipc";
import { applyArchiveDirectoryWrite, previewArchiveDirectoryWrite } from "./archive-export-writer";

let outputRoot: string;

const makeRequest = (names = ["Old Name"], worldId = "writer-test"): ArchiveDirectoryRequest => {
  const snapshot: ArchiveWorldSnapshot = {
    info: { mapId: 10, mapName: "Writer Test", version: "test" },
    pack: {
      states: [{ i: 0, name: "Neutrals" }, ...names.map((name, index) => ({ i: index + 1, name }))],
      provinces: [],
      burgs: [],
      cultures: [{ i: 0, name: "Wildlands" }],
      religions: [{ i: 0, name: "No religion" }]
    }
  };
  const plan = buildArchiveExportPlan(snapshot, { worldId });
  return { files: plan.files, worldId };
};

beforeEach(async () => {
  outputRoot = await mkdtemp(path.join(tmpdir(), "azgaar-archive-writer-"));
});

afterEach(async () => {
  await rm(outputRoot, { recursive: true, force: true });
});

describe("Archive directory writer", () => {
  it("previews and applies a new managed directory", async () => {
    const request = makeRequest();
    const preview = await previewArchiveDirectoryWrite(outputRoot, request);

    expect(preview.canApply).toBe(true);
    expect(preview.counts.create).toBe(request.files.length);

    const result = await applyArchiveDirectoryWrite(outputRoot, request);
    expect(result.applied).toBe(true);
    expect(await readFile(path.join(outputRoot, "azgaar-archive-manifest.json"), "utf8")).toBe(
      request.files.find(file => file.path === "azgaar-archive-manifest.json")?.content
    );

    const repeated = await previewArchiveDirectoryWrite(outputRoot, request);
    expect(repeated.canApply).toBe(true);
    expect(repeated.counts.create + repeated.counts.update + repeated.counts.move).toBe(0);
  });

  it("blocks an edited generated file and preserves the edit", async () => {
    const request = makeRequest();
    await applyArchiveDirectoryWrite(outputRoot, request);
    const statePath = path.join(outputRoot, "States", "Old Name (Azgaar State).md");
    await writeFile(statePath, "author edit", "utf8");

    const preview = await previewArchiveDirectoryWrite(outputRoot, request);
    expect(preview.canApply).toBe(false);
    expect(preview.counts.conflict).toBe(1);

    const result = await applyArchiveDirectoryWrite(outputRoot, request);
    expect(result.applied).toBe(false);
    expect(await readFile(statePath, "utf8")).toBe("author edit");
  });

  it("accepts Obsidian removing quotes from managed YAML without ignoring prose edits", async () => {
    const request = makeRequest();
    await applyArchiveDirectoryWrite(outputRoot, request);
    const statePath = path.join(outputRoot, "States", "Old Name (Azgaar State).md");
    const generated = await readFile(statePath, "utf8");
    const normalizedByObsidian = generated.replace(/^([A-Za-z_]+): "([^"]+)"$/gm, "$1: $2");
    await writeFile(statePath, normalizedByObsidian, "utf8");

    const unchanged = await previewArchiveDirectoryWrite(outputRoot, request);
    expect(unchanged.canApply).toBe(true);
    expect(unchanged.counts.conflict).toBe(0);

    await writeFile(statePath, normalizedByObsidian.replace("# Old Name", "# Authored Change"), "utf8");
    const edited = await previewArchiveDirectoryWrite(outputRoot, request);
    expect(edited.canApply).toBe(false);
    expect(edited.counts.conflict).toBe(1);
  });

  it("moves an unchanged generated file when its entity is renamed", async () => {
    await applyArchiveDirectoryWrite(outputRoot, makeRequest());
    const renamed = makeRequest(["New Name"]);

    const preview = await previewArchiveDirectoryWrite(outputRoot, renamed);
    expect(preview.canApply).toBe(true);
    expect(preview.counts.move).toBe(1);

    const result = await applyArchiveDirectoryWrite(outputRoot, renamed);
    expect(result.applied).toBe(true);
    await expect(readFile(path.join(outputRoot, "States", "Old Name (Azgaar State).md"), "utf8")).rejects.toMatchObject(
      {
        code: "ENOENT"
      }
    );
    expect(await readFile(path.join(outputRoot, "States", "New Name (Azgaar State).md"), "utf8")).toMatch(/# New Name/);
  });

  it("refuses a non-empty directory without a manifest", async () => {
    await writeFile(path.join(outputRoot, "existing-note.md"), "Do not touch", "utf8");

    const preview = await previewArchiveDirectoryWrite(outputRoot, makeRequest());
    expect(preview.canApply).toBe(false);
    expect(preview.counts.conflict).toBe(1);

    const result = await applyArchiveDirectoryWrite(outputRoot, makeRequest());
    expect(result.applied).toBe(false);
    expect(await readFile(path.join(outputRoot, "existing-note.md"), "utf8")).toBe("Do not touch");
  });

  it("reports the existing identity when the same folder is opened with a new world ID", async () => {
    await applyArchiveDirectoryWrite(outputRoot, makeRequest());

    const preview = await previewArchiveDirectoryWrite(outputRoot, makeRequest(["Old Name"], "replacement-id"));

    expect(preview.canApply).toBe(false);
    expect(preview.existingWorld).toMatchObject({
      mapId: 10,
      worldId: "writer-test",
      worldName: "Writer Test"
    });
  });

  it("retains entities removed from FMG for manual review", async () => {
    await applyArchiveDirectoryWrite(outputRoot, makeRequest(["Keep", "Retain Me"]));
    const reduced = makeRequest(["Keep"]);

    const preview = await previewArchiveDirectoryWrite(outputRoot, reduced);
    expect(preview.canApply).toBe(true);
    expect(preview.counts.removed).toBe(1);

    await applyArchiveDirectoryWrite(outputRoot, reduced);
    expect(await readFile(path.join(outputRoot, "States", "Retain Me (Azgaar State).md"), "utf8")).toMatch(
      /# Retain Me/
    );
  });

  it("backs up the previous manifest before applying a schema migration", async () => {
    const request = makeRequest();
    await applyArchiveDirectoryWrite(outputRoot, request);
    const manifestPath = path.join(outputRoot, "azgaar-archive-manifest.json");
    const previousManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    previousManifest.schemaVersion = 1;
    const previousContent = `${JSON.stringify(previousManifest, null, 2)}\n`;
    await writeFile(manifestPath, previousContent, "utf8");

    const preview = await previewArchiveDirectoryWrite(outputRoot, request);

    expect(preview.canApply).toBe(true);
    expect(preview.manifestBackup).toMatchObject({ fromSchema: 1, toSchema: 3 });
    const result = await applyArchiveDirectoryWrite(outputRoot, request);
    expect(result.applied).toBe(true);
    const backupPath = preview.manifestBackup?.path;
    if (!backupPath) throw new Error("Schema migration did not plan a manifest backup");
    expect(await readFile(path.join(outputRoot, ...backupPath.split("/")), "utf8")).toBe(previousContent);
  });

  it("rejects an export path that escapes the selected directory", async () => {
    const request = makeRequest();
    const entityFile = request.files.find(file => file.entityKey);
    if (!entityFile?.entityKey) throw new Error("Test request has no entity file");
    entityFile.path = "../escape.md";
    const manifestFile = request.files.find(file => file.path === "azgaar-archive-manifest.json");
    if (!manifestFile) throw new Error("Test request has no manifest");
    const manifest = JSON.parse(manifestFile.content);
    manifest.entities[entityFile.entityKey].path = entityFile.path;
    manifestFile.content = `${JSON.stringify(manifest, null, 2)}\n`;

    await expect(previewArchiveDirectoryWrite(outputRoot, request)).rejects.toThrow(/Unsafe Archive export path/);
  });
});
