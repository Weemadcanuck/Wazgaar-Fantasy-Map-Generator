import { tip } from "@/components/tooltips";
import { savedMessage } from "@/services/platform";
import { VERSION } from "@/services/versioning";
import { downloadFile, getFileName } from "@/utils/fileUtils";
import { type ArchiveWorldSnapshot, buildArchiveExportPlan, sanitizeArchiveFilename } from "./archive-export";

const JSZIP_SOURCE = "libs/jszip.min.js";
const WORLD_ID_PREFIX = "archive-export-world-id";

let jsZipLoading: Promise<void> | undefined;

const loadJsZip = (): Promise<void> => {
  if (window.JSZip) return Promise.resolve();
  if (jsZipLoading) return jsZipLoading;

  jsZipLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = JSZIP_SOURCE;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Cannot load script ${JSZIP_SOURCE}`));
    document.head.append(script);
  });
  const pending = jsZipLoading;
  void pending.catch(() => {
    if (jsZipLoading === pending) jsZipLoading = undefined;
  });
  return pending;
};

const getSuggestedWorldId = () => {
  const name = mapName.value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${name || "world"}-${mapId}`;
};

const getWorldId = (): string => {
  const storageKey = `${WORLD_ID_PREFIX}:${mapId}`;
  const worldId = localStorage.getItem(storageKey) || getSuggestedWorldId();
  localStorage.setItem(storageKey, worldId);
  return worldId;
};

export const getCurrentArchiveSnapshot = (): ArchiveWorldSnapshot => ({
  info: {
    version: VERSION,
    mapName: mapName.value,
    mapId
  },
  pack: {
    states: pack.states,
    provinces: pack.provinces,
    burgs: pack.burgs,
    cultures: pack.cultures,
    religions: pack.religions,
    cells: { province: pack.cells.province }
  }
});

async function downloadArchive(): Promise<void> {
  if (customization) {
    tip("Archive data cannot be exported when edit mode is active. Exit the mode and retry", false, "error");
    return;
  }

  const worldId = getWorldId();

  TIME && console.time("downloadArchive");
  try {
    const snapshot = getCurrentArchiveSnapshot();
    const plan = buildArchiveExportPlan(snapshot, { worldId });
    await loadJsZip();

    const zip = new window.JSZip();
    const archiveRoot = sanitizeArchiveFilename(`${snapshot.info.mapName || "World"} (Azgaar Archive)`);
    for (const file of plan.files) zip.file(`${archiveRoot}/${file.path}`, file.content);

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    const fileName = `${getFileName("Archive")}.zip`;
    downloadFile(blob, fileName, "application/zip");
    tip(savedMessage(fileName), true, "success", 7000);
  } catch (error) {
    ERROR && console.error(error);
    tip(`Archive export failed: ${(error as Error)?.message || "Unknown error"}`, true, "error", 7000);
  } finally {
    TIME && console.timeEnd("downloadArchive");
  }
}

async function exportToDirectory(): Promise<void> {
  if (customization) {
    tip("Archive data cannot be exported when edit mode is active. Exit the mode and retry", false, "error");
    return;
  }
  if (!window.electron?.archiveExport) {
    tip("Direct folder export is available in the desktop app", true, "error", 7000);
    return;
  }

  const worldId = getWorldId();

  TIME && console.time("exportArchiveToDirectory");
  try {
    const plan = buildArchiveExportPlan(getCurrentArchiveSnapshot(), { worldId });
    const result = await window.electron.archiveExport.writeDirectory({ files: plan.files, worldId });
    if (result.status === "written") {
      tip("Archive reference directory was updated", true, "success", 7000);
    } else if (result.status === "unchanged") {
      tip("Archive reference directory is already current", true, "success", 7000);
    } else if (result.status === "blocked") {
      tip("Archive export was blocked by conflicts; no files were written", true, "error", 7000);
    } else if (result.status === "failed") {
      tip(`Archive export failed: ${result.message || "Unknown error"}`, true, "error", 7000);
    }
  } catch (error) {
    ERROR && console.error(error);
    tip(`Archive export failed: ${(error as Error)?.message || "Unknown error"}`, true, "error", 7000);
  } finally {
    TIME && console.timeEnd("exportArchiveToDirectory");
  }
}

export const ArchiveExportDownload = { downloadArchive, exportToDirectory };
