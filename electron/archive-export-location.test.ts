import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLastArchiveDirectory, writeLastArchiveDirectory } from "./archive-export-location";

let outputRoot: string;
let locationFile: string;

beforeEach(async () => {
  outputRoot = await fs.mkdtemp(path.join(tmpdir(), "azgaar-archive-location-"));
  locationFile = path.join(outputRoot, "settings", "archive-export-location.json");
});

afterEach(async () => {
  await fs.rm(outputRoot, { recursive: true, force: true });
});

describe("Archive export location", () => {
  it("persists an absolute directory for the next folder picker", () => {
    const directory = path.join(outputRoot, "managed-export");
    writeLastArchiveDirectory(locationFile, directory);
    expect(readLastArchiveDirectory(locationFile)).toBe(directory);
  });

  it("ignores missing, malformed, and relative locations", async () => {
    expect(readLastArchiveDirectory(locationFile)).toBeUndefined();
    await fs.mkdir(path.dirname(locationFile), { recursive: true });
    await fs.writeFile(locationFile, "not json", "utf8");
    expect(readLastArchiveDirectory(locationFile)).toBeUndefined();
    await fs.writeFile(locationFile, JSON.stringify({ lastDirectory: "relative/path" }), "utf8");
    expect(readLastArchiveDirectory(locationFile)).toBeUndefined();
  });
});
