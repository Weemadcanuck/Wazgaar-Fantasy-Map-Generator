import { tip } from "@/components/tooltips";
import { savedMessage } from "@/services/platform";
import { VERSION } from "@/services/versioning";
import { downloadFile, getFileName } from "@/utils/fileUtils";
import { type ArchiveWorldSnapshot, buildArchiveExportPlan, sanitizeArchiveFilename } from "./archive-export";

const JSZIP_SOURCE = "libs/jszip.min.js";
const WORLD_ID_PREFIX = "archive-export-world-id";
const WORLD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

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

const requestWorldId = (): string | null => {
  const storageKey = `${WORLD_ID_PREFIX}:${mapId}`;
  const previous = localStorage.getItem(storageKey) || getSuggestedWorldId();
  const entered = window.prompt(
    "Stable Archive world ID. Keep this unchanged across exports so Obsidian can match renamed entities.",
    previous
  );
  if (entered === null) return null;

  const worldId = entered.trim();
  if (!WORLD_ID_PATTERN.test(worldId)) {
    tip("World ID must use 1-128 letters, numbers, dots, underscores, or hyphens", true, "error", 7000);
    return null;
  }

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

  const worldId = requestWorldId();
  if (!worldId) return;

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

export const ArchiveExportDownload = { downloadArchive };
