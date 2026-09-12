import { describe, expect, it } from "vitest";
import { loadArchiveExportDiagnostic, saveArchiveExportDiagnostic } from "./archive-export-diagnostics";

describe("Archive export diagnostics", () => {
  it("stores the latest export result separately for each map", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const record = {
      categories: ["economy"],
      completedAt: "2026-09-12T16:00:00.000Z",
      directory: "C:\\Archive\\Jotun",
      fileCount: 20,
      schemaVersion: 2,
      status: "written" as const,
      target: "directory" as const,
      worldId: "jotun"
    };

    saveArchiveExportDiagnostic(storage, 10, record);

    expect(loadArchiveExportDiagnostic(storage, 10)).toEqual(record);
    expect(loadArchiveExportDiagnostic(storage, 11)).toBeNull();
  });

  it("ignores malformed saved diagnostics", () => {
    expect(loadArchiveExportDiagnostic({ getItem: () => "not json" }, 10)).toBeNull();
  });
});
