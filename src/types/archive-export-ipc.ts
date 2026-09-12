export const ARCHIVE_EXPORT_DIRECTORY_CHANNEL = "archive-export:directory";

export type ArchiveDirectoryFile = {
  content: string;
  entityKey?: string;
  path: string;
};

export type ArchiveDirectoryRequest = {
  files: ArchiveDirectoryFile[];
  worldId: string;
};

export type ArchiveDirectoryChangeKind = "create" | "update" | "move" | "unchanged" | "removed" | "conflict";

export type ArchiveDirectoryChange = {
  entityKey?: string;
  fromPath?: string;
  kind: ArchiveDirectoryChangeKind;
  path: string;
  reason?: string;
};

export type ArchiveDirectoryReport = {
  canApply: boolean;
  changes: ArchiveDirectoryChange[];
  counts: Record<ArchiveDirectoryChangeKind, number>;
  manifestBackup?: {
    fromSchema: number | null;
    path: string;
    toSchema: number;
  };
};

export type ArchiveDirectoryResult = {
  directory?: string;
  message?: string;
  report?: ArchiveDirectoryReport;
  status: "blocked" | "cancelled" | "failed" | "unchanged" | "written";
};
