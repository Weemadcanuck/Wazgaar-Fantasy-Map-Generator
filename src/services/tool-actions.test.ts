import { describe, expect, it, vi } from "vitest";
import { ToolActions } from "./tool-actions";

describe("tool action registry", () => {
  it("lists the Archive action in the export and sync category", () => {
    expect(ToolActions.list("export-sync")).toContainEqual({
      category: "export-sync",
      id: "archive-export",
      label: "Archive Export Profile"
    });
  });

  it("runs registered actions by stable id", async () => {
    const run = vi.fn();
    ToolActions.register({ category: "inspect", id: "test-inspect-action", label: "Test", run });
    await ToolActions.run("test-inspect-action");
    expect(run).toHaveBeenCalledOnce();
  });
});
