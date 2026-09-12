import { closeDialogs, destroyDialog } from "@/components/dialog/dialog-helpers";
import { tip } from "@/components/tooltips";
import { savedMessage } from "@/services/platform";
import { VERSION } from "@/services/versioning";
import { ensureEl } from "@/utils";
import { downloadFile, getFileName } from "@/utils/fileUtils";
import {
  type ArchiveWorldSnapshot,
  buildArchiveExportPlan,
  createArchiveExportProfile,
  sanitizeArchiveFilename
} from "./archive-export";
import {
  ARCHIVE_FULL_SNAPSHOT_OPTIONS,
  ARCHIVE_REFERENCE_SAFE_OPTIONS,
  type ArchiveSimulationOptions,
  loadArchiveSimulationOptions,
  saveArchiveSimulationOptions
} from "./archive-export-profile";

const JSZIP_SOURCE = "libs/jszip.min.js";
const WORLD_ID_PREFIX = "archive-export-world-id";
const PROFILE_DIALOG_ID = "archiveExportProfile";

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
    mapId,
    populationRate: typeof populationRate === "number" ? populationRate : 1000,
    urbanization: typeof urbanization === "number" ? urbanization : 1
  },
  pack: {
    states: pack.states,
    provinces: pack.provinces,
    burgs: pack.burgs,
    cultures: pack.cultures,
    religions: pack.religions,
    goods: pack.goods,
    markets: pack.markets,
    deals: pack.deals,
    cells: { province: pack.cells.province }
  }
});

const getCurrentProfile = () => createArchiveExportProfile(loadArchiveSimulationOptions(localStorage, mapId));

async function downloadArchive(): Promise<void> {
  if (customization) {
    tip("Archive data cannot be exported when edit mode is active. Exit the mode and retry", false, "error");
    return;
  }

  const worldId = getWorldId();

  TIME && console.time("downloadArchive");
  try {
    const snapshot = getCurrentArchiveSnapshot();
    const plan = buildArchiveExportPlan(snapshot, { worldId, profile: getCurrentProfile() });
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
    const plan = buildArchiveExportPlan(getCurrentArchiveSnapshot(), { worldId, profile: getCurrentProfile() });
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

const getProfileFormOptions = (): ArchiveSimulationOptions => ({
  population: ensureEl<HTMLInputElement>("archiveExportPopulation").checked,
  economy: ensureEl<HTMLInputElement>("archiveExportEconomy").checked,
  military: ensureEl<HTMLInputElement>("archiveExportMilitary").checked,
  diplomacy: ensureEl<HTMLInputElement>("archiveExportDiplomacy").checked
});

const setProfileFormOptions = (options: ArchiveSimulationOptions) => {
  ensureEl<HTMLInputElement>("archiveExportPopulation").checked = options.population;
  ensureEl<HTMLInputElement>("archiveExportEconomy").checked = options.economy;
  ensureEl<HTMLInputElement>("archiveExportMilitary").checked = options.military;
  ensureEl<HTMLInputElement>("archiveExportDiplomacy").checked = options.diplomacy;
};

const saveProfileForm = () => {
  const options = getProfileFormOptions();
  saveArchiveSimulationOptions(localStorage, mapId, options);
  const count = Object.values(options).filter(Boolean).length;
  ensureEl("archiveExportProfileStatus").textContent = count
    ? `${count} optional simulation ${count === 1 ? "category" : "categories"} selected. All are reference-only.`
    : "Reference-safe profile: geography, identity, relationships, and settlement features only.";
};

const runConfiguredExport = async (target: "download" | "directory") => {
  saveProfileForm();
  $(`#${PROFILE_DIALOG_ID}`).dialog("close");
  if (target === "download") await downloadArchive();
  else await exportToDirectory();
};

function openConfiguration(): void {
  if (customization) {
    tip("Archive data cannot be exported when edit mode is active. Exit the mode and retry", false, "error");
    return;
  }

  closeDialogs(`#${PROFILE_DIALOG_ID}`);
  destroyDialog(PROFILE_DIALOG_ID);
  const folderDisabled = window.electron?.archiveExport ? "" : "disabled";
  const html = /* html */ `<div id="${PROFILE_DIALOG_ID}" class="dialog stable">
    <p style="max-width: 42em">
      Generated files remain reference-only. Optional simulation values never become Archive canon and their freshness is not tracked.
      If a category is later disabled, its old generated snapshot is retained on disk for manual review rather than deleted.
    </p>
    <div style="display: flex; gap: 0.5em; margin-bottom: 0.8em">
      <button type="button" id="archiveExportSafePreset">Reference-safe defaults</button>
      <button type="button" id="archiveExportFullPreset">Full simulation snapshot</button>
    </div>
    <fieldset style="display: grid; gap: 0.65em; max-width: 44em">
      <legend>Optional generated simulation</legend>
      <div>
        <input id="archiveExportPopulation" class="checkbox" type="checkbox">
        <label for="archiveExportPopulation" class="checkbox-label"><b>Population and demographics</b></label>
        <small style="display: block; margin-left: 1.45em">Estimated people, split into rural and urban values where available.</small>
      </div>
      <div>
        <input id="archiveExportEconomy" class="checkbox" type="checkbox">
        <label for="archiveExportEconomy" class="checkbox-label"><b>Goods, markets, trade, and treasuries</b></label>
        <small style="display: block; margin-left: 1.45em">Adds entity figures and a complete economy snapshot note.</small>
      </div>
      <div>
        <input id="archiveExportMilitary" class="checkbox" type="checkbox">
        <label for="archiveExportMilitary" class="checkbox-label"><b>Military</b></label>
        <small style="display: block; margin-left: 1.45em">War alert and generated formations attached to each polity reference.</small>
      </div>
      <div>
        <input id="archiveExportDiplomacy" class="checkbox" type="checkbox">
        <label for="archiveExportDiplomacy" class="checkbox-label"><b>Diplomacy</b></label>
        <small style="display: block; margin-left: 1.45em">Generated diplomatic relationships attached to each polity reference.</small>
      </div>
    </fieldset>
    <p id="archiveExportProfileStatus" style="max-width: 42em"></p>
    <div style="display: flex; justify-content: flex-end; gap: 0.6em">
      <button type="button" id="archiveExportDownload">Download package (.zip)</button>
      <button type="button" id="archiveExportDirectory" ${folderDisabled}>Export folder</button>
    </div>
  </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);
  setProfileFormOptions(loadArchiveSimulationOptions(localStorage, mapId));
  saveProfileForm();

  ensureEl("archiveExportSafePreset").addEventListener("click", () => {
    setProfileFormOptions(ARCHIVE_REFERENCE_SAFE_OPTIONS);
    saveProfileForm();
  });
  ensureEl("archiveExportFullPreset").addEventListener("click", () => {
    setProfileFormOptions(ARCHIVE_FULL_SNAPSHOT_OPTIONS);
    saveProfileForm();
  });
  for (const id of [
    "archiveExportPopulation",
    "archiveExportEconomy",
    "archiveExportMilitary",
    "archiveExportDiplomacy"
  ]) {
    ensureEl(id).addEventListener("change", saveProfileForm);
  }
  ensureEl("archiveExportDownload").addEventListener("click", () => void runConfiguredExport("download"));
  ensureEl("archiveExportDirectory").addEventListener("click", () => void runConfiguredExport("directory"));

  $(`#${PROFILE_DIALOG_ID}`).dialog({
    title: "Archive Export Profile",
    resizable: false,
    width: "fit-content",
    position: { my: "center", at: "center", of: "svg", collision: "fit" }
  });
}

export const ArchiveExportDownload = { downloadArchive, exportToDirectory, openConfiguration };
