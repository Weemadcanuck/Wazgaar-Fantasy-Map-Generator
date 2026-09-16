import type { ArchiveDirectoryReport, ArchiveDirectoryResult } from "@/types/archive-export-ipc";

const STORAGE_PREFIX = "archive-export-diagnostics";

export type ArchiveExportDiagnosticRecord = {
  categories: string[];
  completedAt: string;
  directory?: string;
  fileCount: number;
  fileName?: string;
  report?: ArchiveDirectoryReport;
  schemaVersion: number;
  status: ArchiveDirectoryResult["status"] | "downloaded";
  target: "directory" | "download";
  worldId: string;
};

const storageKey = (mapId: number | string) => `${STORAGE_PREFIX}:${mapId}`;

const isRecord = (value: unknown): value is ArchiveExportDiagnosticRecord => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ArchiveExportDiagnosticRecord>;
  return (
    Array.isArray(record.categories) &&
    typeof record.completedAt === "string" &&
    typeof record.fileCount === "number" &&
    typeof record.schemaVersion === "number" &&
    typeof record.status === "string" &&
    (record.target === "directory" || record.target === "download") &&
    typeof record.worldId === "string"
  );
};

export const loadArchiveExportDiagnostic = (
  storage: Pick<Storage, "getItem">,
  mapId: number | string
): ArchiveExportDiagnosticRecord | null => {
  const saved = storage.getItem(storageKey(mapId));
  if (!saved) return null;
  try {
    const parsed: unknown = JSON.parse(saved);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const saveArchiveExportDiagnostic = (
  storage: Pick<Storage, "setItem">,
  mapId: number | string,
  record: ArchiveExportDiagnosticRecord
) => storage.setItem(storageKey(mapId), JSON.stringify(record));
