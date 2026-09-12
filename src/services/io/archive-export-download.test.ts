// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArchiveDirectoryRequest, ArchiveDirectoryResult } from "@/types/archive-export-ipc";
import { loadArchiveExportDiagnostic } from "./archive-export-diagnostics";
import { ArchiveExportDownload } from "./archive-export-download";
import { saveArchiveSimulationOptions } from "./archive-export-profile";

const archivedFiles = new Map<string, string>();

class FakeZip {
  file(path: string, content: string) {
    archivedFiles.set(path, content);
    return this;
  }

  async generateAsync() {
    return new Blob(["fake zip"]);
  }
}

beforeEach(() => {
  document.body.innerHTML = '<div id="tooltip"></div><div id="dialogs"></div><input id="mapName" value="Jotun">';
  archivedFiles.clear();
  localStorage.clear();
  vi.restoreAllMocks();

  globalThis.mapName = document.querySelector<HTMLInputElement>("#mapName")!;
  globalThis.mapId = 1788160068282;
  globalThis.customization = 0;
  globalThis.pack = {
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Daraluma", provinces: [3] }
    ],
    provinces: [{ i: 3, name: "Aethenir", state: 1, burg: 1, burgs: [1] }],
    burgs: [{ i: 1, name: "Drelgard", state: 1, culture: 2, cell: 1 }],
    cultures: [
      { i: 0, name: "Wildlands" },
      { i: 2, name: "Gorgorothi Gestalt" }
    ],
    religions: [{ i: 0, name: "No religion" }],
    goods: [{ i: 0, name: "Wood", unit: "pile", value: 1, tags: ["construction"] }],
    markets: [{ i: 1, name: "Drelgard Market", centerBurgId: 1, goods: {} }],
    deals: [],
    cells: { province: new Uint16Array([0, 3]) }
  } as unknown as typeof pack;

  window.JSZip = FakeZip as unknown as typeof window.JSZip;
  window.electron = undefined;
  window.URL.createObjectURL = vi.fn(() => "blob:archive");
  window.URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const dialog = vi.fn();
  globalThis.$ = vi.fn((selector: unknown) =>
    selector === ".dialog:visible" ? { not: () => ({ each: () => undefined }) } : { dialog }
  );
});

describe("in-application Archive export", () => {
  it("packages the live map projection under one Archive root", async () => {
    await ArchiveExportDownload.downloadArchive();

    expect(archivedFiles.has("Jotun (Azgaar Archive)/azgaar-archive-manifest.json")).toBe(true);
    expect(archivedFiles.has("Jotun (Azgaar Archive)/States/Daraluma (Azgaar State).md")).toBe(true);
    expect(archivedFiles.has("Jotun (Azgaar Archive)/Burgs/Drelgard (Azgaar Burg).md")).toBe(true);
    expect(localStorage.getItem("archive-export-world-id:1788160068282")).toBe("jotun-1788160068282");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it("sends the same export plan through the desktop bridge", async () => {
    localStorage.setItem("archive-export-world-id:1788160068282", "jotun-live");
    const writeDirectory = vi.fn(
      async (_request: ArchiveDirectoryRequest): Promise<ArchiveDirectoryResult> => ({ status: "written" })
    );
    window.electron = {
      isElectron: true,
      platform: "win32",
      requestQuit: vi.fn(),
      versions: { electron: "test", chrome: "test", node: "test" },
      archiveExport: { writeDirectory }
    };

    await ArchiveExportDownload.exportToDirectory();

    expect(writeDirectory).toHaveBeenCalledOnce();
    const request = writeDirectory.mock.calls[0]?.[0];
    expect(request).toBeDefined();
    if (!request) throw new Error("Desktop bridge did not receive an export request");
    expect(request.worldId).toBe("jotun-live");
    expect(request.files).toHaveLength(7);
    expect(request.files.some(file => file.path === "azgaar-archive-manifest.json")).toBe(true);
    expect(loadArchiveExportDiagnostic(localStorage, mapId)).toMatchObject({
      status: "written",
      target: "directory",
      worldId: "jotun-live"
    });
  });

  it("uses the simulation profile saved for the current map", async () => {
    saveArchiveSimulationOptions(localStorage, 1788160068282, {
      population: false,
      economy: true,
      military: false,
      diplomacy: false
    });

    await ArchiveExportDownload.downloadArchive();

    const economy = archivedFiles.get("Jotun (Azgaar Archive)/Simulation/Economy Snapshot.md");
    expect(economy?.includes("Drelgard Market")).toBe(true);
    const manifest = archivedFiles.get("Jotun (Azgaar Archive)/azgaar-archive-manifest.json");
    expect(manifest && JSON.parse(manifest).simulation.categories).toEqual(["economy"]);
  });

  it("opens with a reference-safe profile and disables direct folder export on the web", () => {
    ArchiveExportDownload.openConfiguration();

    expect(document.querySelectorAll<HTMLInputElement>("#archiveExportProfile input:checked")).toHaveLength(0);
    expect(document.querySelectorAll<HTMLInputElement>("#archiveExportProfile input.checkbox")).toHaveLength(4);
    expect(document.querySelectorAll<HTMLLabelElement>("#archiveExportProfile label.checkbox-label")).toHaveLength(4);
    expect(document.querySelector<HTMLButtonElement>("#archiveExportDirectory")?.disabled).toBe(true);
    expect(document.querySelector("#archiveExportProfileStatus")?.textContent).toContain("Reference-safe profile");

    document.querySelector<HTMLButtonElement>("#archiveExportFullPreset")?.click();

    expect(document.querySelectorAll<HTMLInputElement>("#archiveExportProfile input:checked")).toHaveLength(4);
    expect(document.querySelector("#archiveExportProfileStatus")?.textContent).toContain(
      "4 optional simulation categories"
    );
  });

  it("shows current package contents, ownership, and the last export", async () => {
    await ArchiveExportDownload.downloadArchive();

    ArchiveExportDownload.openDiagnostics();

    const diagnostics = document.querySelector("#archiveExportDiagnostics")?.textContent;
    expect(diagnostics).toContain("jotun-1788160068282");
    expect(diagnostics).toContain("2 polities, 1 territories, 1 settlements, 2 cultures");
    expect(diagnostics).toContain("Authored Archive prose and canon fields");
    expect(diagnostics).toContain("downloaded");
    expect(document.querySelectorAll("#archiveExportDiagnostics details")).toHaveLength(1);
  });
});
