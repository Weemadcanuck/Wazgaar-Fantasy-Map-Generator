import { closeDialogs, destroyDialog } from "@/components/dialog/dialog-helpers";
import { tip } from "@/components/tooltips";
import { savedMessage } from "@/services/platform";
import { VERSION } from "@/services/versioning";
import { ensureEl } from "@/utils";
import { downloadFile, getFileName } from "@/utils/fileUtils";
import {
  ARCHIVE_SCHEMA_VERSION,
  type ArchiveExportPlan,
  type ArchiveWorldSnapshot,
  buildArchiveExportPlan,
  createArchiveExportProfile,
  sanitizeArchiveFilename
} from "./archive-export";
import { loadArchiveExportDiagnostic, saveArchiveExportDiagnostic } from "./archive-export-diagnostics";
import {
  ARCHIVE_FULL_SNAPSHOT_OPTIONS,
  ARCHIVE_REFERENCE_SAFE_OPTIONS,
  type ArchiveSimulationOptions,
  loadArchiveSimulationOptions,
  saveArchiveSimulationOptions
} from "./archive-export-profile";

const getMapId = () => mapHistory.at(-1)?.created ?? 0;

const JSZIP_SOURCE = "libs/jszip.min.js";
const WORLD_ID_PREFIX = "archive-export-world-id";
const PROFILE_DIALOG_ID = "archiveExportProfile";
const DIAGNOSTICS_DIALOG_ID = "archiveExportDiagnostics";

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
  const name = globalThis.options.map.lore.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${name || "world"}-${getMapId()}`;
};

const getWorldId = (): string => {
  const storageKey = `${WORLD_ID_PREFIX}:${getMapId()}`;
  const worldId = pack.archiveWorldId || localStorage.getItem(storageKey) || getSuggestedWorldId();
  pack.archiveWorldId = worldId;
  localStorage.setItem(storageKey, worldId);
  return worldId;
};

const rememberWorldId = (worldId: string): void => {
  pack.archiveWorldId = worldId;
  localStorage.setItem(`${WORLD_ID_PREFIX}:${getMapId()}`, worldId);
};

export const getCurrentArchiveSnapshot = (): ArchiveWorldSnapshot => ({
  info: {
    version: VERSION,
    mapName: globalThis.options.map.lore.name,
    mapId: getMapId(),
    populationRate: globalThis.options.map.units.population.scale,
    urbanization: globalThis.options.map.units.population.urbanization.rate
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
    customLayers: pack.customLayers,
    cells: { province: pack.cells.province }
  }
});

const getCurrentProfile = () => createArchiveExportProfile(loadArchiveSimulationOptions(localStorage, getMapId()));

const recordExport = (
  target: "directory" | "download",
  status: "blocked" | "cancelled" | "failed" | "unchanged" | "written" | "downloaded",
  plan: ArchiveExportPlan,
  details: {
    directory?: string;
    fileName?: string;
    report?: import("@/types/archive-export-ipc").ArchiveDirectoryReport;
  } = {}
) =>
  saveArchiveExportDiagnostic(localStorage, getMapId(), {
    categories: plan.manifest.simulation.categories,
    completedAt: new Date().toISOString(),
    fileCount: plan.files.length,
    schemaVersion: plan.manifest.schemaVersion,
    status,
    target,
    worldId: plan.manifest.worldId,
    ...details
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
    recordExport("download", "downloaded", plan, { fileName });
    tip(savedMessage(fileName), true, "success", 7000);
  } catch (error) {
    ERROR && console.error(error);
    tip(`Archive export failed: ${(error as Error)?.message || "Unknown error"}`, true, "error", 7000);
  } finally {
    TIME && console.timeEnd("downloadArchive");
  }
}

async function exportToDirectory(reuseLastDirectory = false): Promise<void> {
  if (customization) {
    tip("Archive data cannot be exported when edit mode is active. Exit the mode and retry", false, "error");
    return;
  }
  if (!window.electron?.archiveExport) {
    tip("Direct folder export is available in the desktop app", true, "error", 7000);
    return;
  }

  let worldId = getWorldId();

  TIME && console.time("exportArchiveToDirectory");
  try {
    while (true) {
      const plan = buildArchiveExportPlan(getCurrentArchiveSnapshot(), { worldId, profile: getCurrentProfile() });
      const result = await window.electron.archiveExport.writeDirectory({
        files: plan.files,
        reuseLastDirectory,
        worldId
      });
      if (result.status === "reconnect") {
        if (!result.reconnectWorldId) throw new Error("Archive reconnect did not return the existing world ID");
        worldId = result.reconnectWorldId;
        rememberWorldId(worldId);
        reuseLastDirectory = true;
        tip("Reconnected this map to its existing Archive export", true, "success", 5000);
        continue;
      }
      recordExport("directory", result.status, plan, {
        directory: result.directory,
        report: result.report
      });
      if (result.status === "written") {
        tip("Archive reference directory was updated", true, "success", 7000);
      } else if (result.status === "unchanged") {
        tip("Archive reference directory is already current", true, "success", 7000);
      } else if (result.status === "blocked") {
        tip("Archive export was blocked by conflicts; no files were written", true, "error", 7000);
      } else if (result.status === "failed") {
        tip(`Archive export failed: ${result.message || "Unknown error"}`, true, "error", 7000);
      }
      break;
    }
  } catch (error) {
    ERROR && console.error(error);
    tip(`Archive export failed: ${(error as Error)?.message || "Unknown error"}`, true, "error", 7000);
  } finally {
    TIME && console.timeEnd("exportArchiveToDirectory");
  }
}

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const countFiles = (plan: ArchiveExportPlan, prefix: string) =>
  plan.files.filter(file => file.path.startsWith(prefix)).length;

const renderLastExport = () => {
  const last = loadArchiveExportDiagnostic(localStorage, getMapId());
  if (!last) return "<p><i>No export has been recorded for this map in this installation.</i></p>";
  const affected = last.report?.changes.filter(change => change.kind !== "unchanged") ?? [];
  const counts = last.report?.counts;
  const destination = last.directory || last.fileName || "Not recorded";
  return /* html */ `
    <dl style="display: grid; grid-template-columns: max-content 1fr; gap: 0.25em 0.8em">
      <dt>Status</dt><dd>${escapeHtml(last.status)}</dd>
      <dt>Completed</dt><dd>${escapeHtml(new Date(last.completedAt).toLocaleString())}</dd>
      <dt>Target</dt><dd>${escapeHtml(last.target)}</dd>
      <dt>Destination</dt><dd><code>${escapeHtml(destination)}</code></dd>
      ${counts ? `<dt>Dry run</dt><dd>${counts.create} create, ${counts.update} update, ${counts.move} move, ${counts.removed} retained, ${counts.conflict} conflict</dd>` : ""}
    </dl>
    ${
      affected.length
        ? `<details><summary>${affected.length} affected ${affected.length === 1 ? "file" : "files"}</summary><ul style="max-height: 12em; overflow: auto">${affected
            .map(
              change =>
                `<li><b>${escapeHtml(change.kind)}</b>: <code>${escapeHtml(change.fromPath ? `${change.fromPath} → ${change.path}` : change.path)}</code>${change.reason ? ` — ${escapeHtml(change.reason)}` : ""}</li>`
            )
            .join("")}</ul></details>`
        : ""
    }`;
};

function openDiagnostics(): void {
  const snapshot = getCurrentArchiveSnapshot();
  const worldId = getWorldId();
  const plan = buildArchiveExportPlan(snapshot, { worldId, profile: getCurrentProfile() });
  const categories = plan.manifest.simulation.categories;
  const categoryRows = [
    [
      "Names, FMG types and forms, parent links, neighbors, coordinates, and settlement features",
      true,
      "FMG-owned generated reference"
    ],
    [
      "Estimated population, rural population, and urban population",
      categories.includes("population"),
      "Derived simulation reference"
    ],
    [
      "Taxes, treasuries, markets, gross product, goods, inventories, prices, and trade deals",
      categories.includes("economy"),
      "Generated simulation reference"
    ],
    [
      "War alert, formations, personnel, and unit composition",
      categories.includes("military"),
      "Generated simulation reference"
    ],
    ["Polity relationship labels and targets", categories.includes("diplomacy"), "Generated simulation reference"],
    [
      "Custom point layers opted into Archive export",
      (snapshot.pack.customLayers ?? []).some(layer => layer.archiveExport),
      "Map-authored reference; never automatic Archive canon"
    ],
    ["Authored Archive prose and canon fields", false, "Archive-owned; never imported or overwritten"]
  ] as const;

  closeDialogs(`#${DIAGNOSTICS_DIALOG_ID}`);
  destroyDialog(DIAGNOSTICS_DIALOG_ID);
  const html = /* html */ `<div id="${DIAGNOSTICS_DIALOG_ID}" class="dialog stable archive-export-dialog">
    <h3>Current map and profile</h3>
    <dl style="display: grid; grid-template-columns: max-content 1fr; gap: 0.25em 0.8em">
      <dt>World</dt><dd>${escapeHtml(plan.manifest.worldName)}</dd>
      <dt>World ID</dt><dd><code>${escapeHtml(worldId)}</code></dd>
      <dt>Map ID</dt><dd><code>${escapeHtml(snapshot.info.mapId ?? "Unknown")}</code></dd>
      <dt>FMG version</dt><dd>${escapeHtml(snapshot.info.version ?? "Unknown")}</dd>
      <dt>Archive schema</dt><dd>${ARCHIVE_SCHEMA_VERSION}</dd>
      <dt>Profile</dt><dd><code>${escapeHtml(plan.manifest.profile)}</code></dd>
      <dt>Optional categories</dt><dd>${categories.length ? categories.map(escapeHtml).join(", ") : "None (reference-safe)"}</dd>
    </dl>
    <h3>Planned package</h3>
    <p>${plan.files.length} files: ${countFiles(plan, "States/")} polities, ${countFiles(plan, "Provinces/")} territories, ${countFiles(plan, "Burgs/")} settlements, ${countFiles(plan, "Cultures/")} cultures, ${countFiles(plan, "Religions/")} religions, ${countFiles(plan, "Custom Layers/")} custom points, and ${countFiles(plan, "Simulation/")} simulation snapshots, plus the manifest.</p>
    <details><summary>Show exact generated file paths</summary><ul style="max-height: 14em; overflow: auto">${plan.files
      .map(file => `<li><code>${escapeHtml(file.path)}</code></li>`)
      .join("")}</ul></details>
    <h3>Field ownership</h3>
    <table class="standard" style="width: 100%"><thead><tr><th>Data group</th><th>Included</th><th>Authority</th></tr></thead><tbody>${categoryRows
      .map(
        ([label, included, authority]) =>
          `<tr><td>${label}</td><td>${included ? "Yes" : "No"}</td><td>${authority}</td></tr>`
      )
      .join("")}</tbody></table>
    <h3>Last export</h3>
    ${renderLastExport()}
    <div style="display: flex; justify-content: flex-end; margin-top: 0.8em">
      <button type="button" id="archiveDiagnosticsConfigure">Configure or export…</button>
    </div>
  </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);
  ensureEl("archiveDiagnosticsConfigure").addEventListener("click", openConfiguration);
  $(`#${DIAGNOSTICS_DIALOG_ID}`).dialog({
    classes: { "ui-dialog": "archive-export-window" },
    title: "Archive Export Diagnostics",
    width: Math.min(innerWidth * 0.9, 820),
    maxHeight: Math.min(innerHeight * 0.9, 760),
    position: { my: "center", at: "center", of: "svg", collision: "fit" }
  });
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
  saveArchiveSimulationOptions(localStorage, getMapId(), options);
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
  const html = /* html */ `<div id="${PROFILE_DIALOG_ID}" class="dialog stable archive-export-dialog">
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
  setProfileFormOptions(loadArchiveSimulationOptions(localStorage, getMapId()));
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
    classes: { "ui-dialog": "archive-export-window" },
    title: "Archive Export Profile",
    resizable: false,
    width: "fit-content",
    position: { my: "center", at: "center", of: "svg", collision: "fit" }
  });
}

export const ArchiveExportDownload = { downloadArchive, exportToDirectory, openConfiguration, openDiagnostics };
