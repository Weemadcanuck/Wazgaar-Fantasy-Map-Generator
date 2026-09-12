import type { ArchiveDirectoryChange, ArchiveDirectoryReport } from "../src/types/archive-export-ipc";

const CHANGE_LABELS: Record<ArchiveDirectoryChange["kind"], string> = {
  create: "Create",
  update: "Update",
  move: "Move",
  unchanged: "Unchanged",
  removed: "Retained",
  conflict: "Conflict"
};

const describeChange = (change: ArchiveDirectoryChange) => {
  const label = CHANGE_LABELS[change.kind];
  const path = change.kind === "move" && change.fromPath ? `${change.fromPath} -> ${change.path}` : change.path;
  return `- ${label}: ${path}${change.reason ? ` - ${change.reason}` : ""}`;
};

export const summarizeArchiveReport = (report: ArchiveDirectoryReport, detailLimit = 12) => {
  const { create, update, move, unchanged, removed, conflict } = report.counts;
  const counts = [
    `Create: ${create}`,
    `Update: ${update}`,
    `Move: ${move}`,
    `Unchanged: ${unchanged}`,
    `Removed from FMG, retained for review: ${removed}`,
    `Conflicts: ${conflict}`
  ];
  const affected = report.changes.filter(change => change.kind !== "unchanged");
  if (!affected.length) return counts.join("\n");

  const visible = affected.slice(0, detailLimit).map(describeChange);
  const remaining = affected.length - visible.length;
  return [...counts, "", "Affected files:", ...visible, ...(remaining ? [`- ...and ${remaining} more`] : [])].join(
    "\n"
  );
};
