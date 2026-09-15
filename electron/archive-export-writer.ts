import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashArchiveContent, matchesArchiveContentHash } from "../src/services/io/archive-export";
import type {
  ArchiveDirectoryChange,
  ArchiveDirectoryChangeKind,
  ArchiveDirectoryFile,
  ArchiveDirectoryReport,
  ArchiveDirectoryRequest
} from "../src/types/archive-export-ipc";

const MANIFEST_PATH = "azgaar-archive-manifest.json";

type ManifestEntity = {
  contentHash: string;
  path: string;
};

type Manifest = {
  entities: Record<string, ManifestEntity>;
  schemaVersion?: number;
  source?: { mapId?: number | null };
  worldId: string;
  worldName?: string;
};

type WriteOperation = {
  file: ArchiveDirectoryFile;
  fromPath?: string;
  kind: "create" | "move" | "update";
};

type InternalPlan = {
  manifestBackup?: {
    content: string;
    fromSchema: number | null;
    path: string;
    toSchema: number;
  };
  manifestFile: ArchiveDirectoryFile;
  operations: WriteOperation[];
  report: ArchiveDirectoryReport;
};

const emptyCounts = (): Record<ArchiveDirectoryChangeKind, number> => ({
  create: 0,
  update: 0,
  move: 0,
  unchanged: 0,
  removed: 0,
  conflict: 0
});

const addChange = (
  changes: ArchiveDirectoryChange[],
  counts: Record<ArchiveDirectoryChangeKind, number>,
  change: ArchiveDirectoryChange
) => {
  changes.push(change);
  counts[change.kind]++;
};

const readText = async (filePath: string): Promise<string | null> => {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const parseManifest = (content: string, label: string): Manifest => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== "object") throw new Error(`${label} is not an object`);

  const manifest = parsed as Partial<Manifest>;
  if (typeof manifest.worldId !== "string" || !manifest.entities || typeof manifest.entities !== "object") {
    throw new Error(`${label} is missing worldId or entities`);
  }
  return manifest as Manifest;
};

const normalizeRelativePath = (relativePath: string) => relativePath.replaceAll("\\", "/");

const resolveInsideRoot = (root: string, relativePath: string) => {
  const normalized = normalizeRelativePath(relativePath);
  // Reject aliases and Windows streams as well as traversal, before comparing or writing paths.
  if (
    !normalized ||
    path.isAbsolute(normalized) ||
    normalized.includes(":") ||
    normalized.split("/").some(part => part === "." || part === ".." || !part)
  ) {
    throw new Error(`Unsafe Archive export path: ${relativePath}`);
  }

  const target = path.resolve(root, ...normalized.split("/"));
  const fromRoot = path.relative(root, target);
  if (!fromRoot || fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
    throw new Error(`Archive export path escapes the selected directory: ${relativePath}`);
  }
  return target;
};

const assertNoSymlink = async (root: string, relativePath: string) => {
  const segments = normalizeRelativePath(relativePath).split("/");
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`Archive export path contains a symbolic link: ${relativePath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
};

const validateRequest = (request: ArchiveDirectoryRequest) => {
  if (!request.worldId) throw new Error("Archive directory export requires a world ID");
  const manifestFiles = request.files.filter(file => normalizeRelativePath(file.path) === MANIFEST_PATH);
  if (manifestFiles.length !== 1) throw new Error("Archive export must contain exactly one root manifest");

  const seenPaths = new Set<string>();
  const seenKeys = new Set<string>();
  for (const file of request.files) {
    const normalized = normalizeRelativePath(file.path);
    const comparable = process.platform === "win32" ? normalized.toLowerCase() : normalized;
    if (seenPaths.has(comparable)) throw new Error(`Archive export contains a duplicate path: ${file.path}`);
    seenPaths.add(comparable);
    if (file.entityKey) {
      if (seenKeys.has(file.entityKey))
        throw new Error(`Archive export contains a duplicate entity key: ${file.entityKey}`);
      seenKeys.add(file.entityKey);
    }
  }

  const manifest = parseManifest(manifestFiles[0].content, "New Archive manifest");
  if (!Number.isInteger(manifest.schemaVersion) || (manifest.schemaVersion ?? 0) < 1) {
    throw new Error("New Archive manifest is missing a valid schemaVersion");
  }
  if (manifest.worldId !== request.worldId) throw new Error("Archive export world ID does not match its manifest");
  for (const [entityKey, entity] of Object.entries(manifest.entities)) {
    if (!entity || typeof entity.path !== "string" || typeof entity.contentHash !== "string") {
      throw new Error(`Archive manifest entry is invalid: ${entityKey}`);
    }
    const file = request.files.find(candidate => candidate.entityKey === entityKey);
    if (!file || normalizeRelativePath(file.path) !== normalizeRelativePath(entity.path)) {
      throw new Error(`Archive manifest entry does not match an exported file: ${entityKey}`);
    }
    if (hashArchiveContent(file.content) !== entity.contentHash) {
      throw new Error(`Archive manifest hash does not match exported content: ${entityKey}`);
    }
  }
  for (const file of request.files) {
    if (file.entityKey && !manifest.entities[file.entityKey]) {
      throw new Error(`Exported entity file is missing from the Archive manifest: ${file.entityKey}`);
    }
  }
  return { manifest, manifestFile: manifestFiles[0] };
};

const buildInternalPlan = async (root: string, request: ArchiveDirectoryRequest): Promise<InternalPlan> => {
  const outputRoot = path.resolve(root);
  const { manifest: nextManifest, manifestFile } = validateRequest(request);
  for (const file of request.files) {
    resolveInsideRoot(outputRoot, file.path);
    await assertNoSymlink(outputRoot, file.path);
  }

  const counts = emptyCounts();
  const changes: ArchiveDirectoryChange[] = [];
  const operations: WriteOperation[] = [];
  const entries = await readdir(outputRoot);
  const currentManifestContent = await readText(path.join(outputRoot, MANIFEST_PATH));
  if (entries.length && currentManifestContent === null) {
    addChange(changes, counts, {
      kind: "conflict",
      path: MANIFEST_PATH,
      reason: "The selected directory is non-empty and is not managed by an Azgaar Archive manifest"
    });
    return { manifestFile, operations, report: { canApply: false, changes, counts } };
  }

  let previousManifest: Manifest | null = null;
  let manifestBackup: InternalPlan["manifestBackup"];
  const nextSchema = nextManifest.schemaVersion!;
  if (currentManifestContent !== null) {
    try {
      previousManifest = parseManifest(currentManifestContent, "Existing Archive manifest");
      if (previousManifest.worldId !== request.worldId) {
        addChange(changes, counts, {
          kind: "conflict",
          path: MANIFEST_PATH,
          reason: `The selected directory belongs to world ID ${JSON.stringify(previousManifest.worldId)}`
        });
        return {
          manifestFile,
          operations,
          report: {
            canApply: false,
            changes,
            counts,
            existingWorld: {
              mapId: previousManifest.source?.mapId,
              worldId: previousManifest.worldId,
              worldName: previousManifest.worldName
            }
          }
        };
      }
      if (previousManifest.schemaVersion !== nextSchema) {
        const contentHash = hashArchiveContent(currentManifestContent).replace(":", "-");
        const fromSchema = previousManifest.schemaVersion ?? null;
        const fromLabel = fromSchema ?? "unknown";
        const backupPath = `.azgaar-manifest-backups/schema-${fromLabel}-before-${nextSchema}-${contentHash}.json`;
        await assertNoSymlink(outputRoot, backupPath);
        const existingBackup = await readText(resolveInsideRoot(outputRoot, backupPath));
        if (existingBackup !== null && existingBackup !== currentManifestContent) {
          addChange(changes, counts, {
            kind: "conflict",
            path: backupPath,
            reason: "The required manifest backup path already contains different content"
          });
          return { manifestFile, operations, report: { canApply: false, changes, counts } };
        }
        manifestBackup = {
          content: currentManifestContent,
          fromSchema,
          path: backupPath,
          toSchema: nextSchema
        };
      }
    } catch (error) {
      addChange(changes, counts, {
        kind: "conflict",
        path: MANIFEST_PATH,
        reason: (error as Error).message
      });
      return { manifestFile, operations, report: { canApply: false, changes, counts } };
    }
  }

  const entityFiles = request.files.filter(file => file.entityKey);
  for (const file of entityFiles) {
    const entityKey = file.entityKey!;
    const targetPath = resolveInsideRoot(outputRoot, file.path);
    const currentContent = await readText(targetPath);
    const previous = previousManifest?.entities[entityKey];

    if (previous && normalizeRelativePath(previous.path) !== normalizeRelativePath(file.path)) {
      const oldPath = resolveInsideRoot(outputRoot, previous.path);
      await assertNoSymlink(outputRoot, previous.path);
      const oldContent = await readText(oldPath);
      if (currentContent !== null) {
        addChange(changes, counts, {
          entityKey,
          fromPath: previous.path,
          kind: "conflict",
          path: file.path,
          reason: "The renamed target path already exists"
        });
      } else if (oldContent === null) {
        addChange(changes, counts, { entityKey, kind: "create", path: file.path });
        operations.push({ file, kind: "create" });
      } else if (!matchesArchiveContentHash(oldContent, previous.contentHash)) {
        addChange(changes, counts, {
          entityKey,
          fromPath: previous.path,
          kind: "conflict",
          path: file.path,
          reason: "The previously generated file was edited after its last export"
        });
      } else {
        addChange(changes, counts, { entityKey, fromPath: previous.path, kind: "move", path: file.path });
        operations.push({ file, fromPath: previous.path, kind: "move" });
      }
      continue;
    }

    if (currentContent === null) {
      addChange(changes, counts, { entityKey, kind: "create", path: file.path });
      operations.push({ file, kind: "create" });
    } else if (matchesArchiveContentHash(currentContent, hashArchiveContent(file.content))) {
      addChange(changes, counts, { entityKey, kind: "unchanged", path: file.path });
    } else if (previous && matchesArchiveContentHash(currentContent, previous.contentHash)) {
      addChange(changes, counts, { entityKey, kind: "update", path: file.path });
      operations.push({ file, kind: "update" });
    } else {
      addChange(changes, counts, {
        entityKey,
        kind: "conflict",
        path: file.path,
        reason: previous ? "The generated file was edited after its last export" : "The target file is not managed"
      });
    }
  }

  if (previousManifest) {
    for (const [entityKey, entity] of Object.entries(previousManifest.entities)) {
      if (nextManifest.entities[entityKey]) continue;
      addChange(changes, counts, {
        entityKey,
        kind: "removed",
        path: entity.path,
        reason: "Retained on disk for manual review"
      });
    }
  }

  if (currentManifestContent === null) {
    addChange(changes, counts, { kind: "create", path: MANIFEST_PATH });
  } else if (currentManifestContent === manifestFile.content) {
    addChange(changes, counts, { kind: "unchanged", path: MANIFEST_PATH });
  } else {
    addChange(changes, counts, { kind: "update", path: MANIFEST_PATH });
  }

  const report: ArchiveDirectoryReport = {
    canApply: counts.conflict === 0,
    changes,
    counts,
    ...(manifestBackup
      ? {
          manifestBackup: {
            fromSchema: manifestBackup.fromSchema,
            path: manifestBackup.path,
            toSchema: manifestBackup.toSchema
          }
        }
      : {})
  };
  return {
    manifestBackup,
    manifestFile,
    operations,
    report
  };
};

const writeAtomically = async (target: string, content: string) => {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.azgaar-tmp-${randomUUID()}`;
  const backup = `${target}.azgaar-backup-${randomUUID()}`;
  await writeFile(temporary, content, "utf8");

  const existing = await readText(target);
  if (existing === null) {
    await rename(temporary, target);
    return;
  }

  await rename(target, backup);
  try {
    await rename(temporary, target);
    await unlink(backup);
  } catch (error) {
    await rename(backup, target).catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
};

export const previewArchiveDirectoryWrite = async (root: string, request: ArchiveDirectoryRequest) =>
  (await buildInternalPlan(root, request)).report;

export const applyArchiveDirectoryWrite = async (root: string, request: ArchiveDirectoryRequest) => {
  const outputRoot = path.resolve(root);
  const plan = await buildInternalPlan(outputRoot, request);
  if (!plan.report.canApply) return { applied: false, report: plan.report };

  if (plan.manifestBackup) {
    const backupTarget = resolveInsideRoot(outputRoot, plan.manifestBackup.path);
    if ((await readText(backupTarget)) === null) await writeAtomically(backupTarget, plan.manifestBackup.content);
  }

  for (const operation of plan.operations) {
    const target = resolveInsideRoot(outputRoot, operation.file.path);
    if (operation.kind === "move" && operation.fromPath) {
      await mkdir(path.dirname(target), { recursive: true });
      await rename(resolveInsideRoot(outputRoot, operation.fromPath), target);
    }
    await writeAtomically(target, operation.file.content);
  }

  const manifestChange = plan.report.changes.find(change => change.path === MANIFEST_PATH);
  if (manifestChange?.kind !== "unchanged") {
    await writeAtomically(resolveInsideRoot(outputRoot, MANIFEST_PATH), plan.manifestFile.content);
  }
  return { applied: true, report: plan.report };
};
