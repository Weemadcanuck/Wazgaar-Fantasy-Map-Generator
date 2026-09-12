import { describe, expect, it } from "vitest";
import type { ArchiveDirectoryReport } from "../src/types/archive-export-ipc";
import { summarizeArchiveReport } from "./archive-export-report";

const report: ArchiveDirectoryReport = {
  canApply: true,
  counts: { create: 1, update: 1, move: 1, unchanged: 4, removed: 1, conflict: 0 },
  changes: [
    { kind: "create", path: "Burgs/New (Azgaar Burg).md" },
    { kind: "update", path: "Burgs/Changed (Azgaar Burg).md" },
    {
      kind: "move",
      fromPath: "Burgs/Old (Azgaar Burg).md",
      path: "Burgs/Renamed (Azgaar Burg).md"
    },
    { kind: "removed", path: "Burgs/Retained (Azgaar Burg).md" }
  ]
};

describe("Archive export report", () => {
  it("lists affected files and move destinations below the counts", () => {
    const summary = summarizeArchiveReport(report);

    expect(summary).toContain("Create: 1");
    expect(summary).toContain("- Update: Burgs/Changed (Azgaar Burg).md");
    expect(summary).toContain("- Move: Burgs/Old (Azgaar Burg).md -> Burgs/Renamed (Azgaar Burg).md");
    expect(summary).toContain("- Retained: Burgs/Retained (Azgaar Burg).md");
  });

  it("caps long reports while preserving the total omitted count", () => {
    expect(summarizeArchiveReport(report, 2)).toContain("- ...and 2 more");
  });
});
