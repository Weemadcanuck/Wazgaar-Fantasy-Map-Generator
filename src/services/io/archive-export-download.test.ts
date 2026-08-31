// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveExportDownload } from "./archive-export-download";

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
  document.body.innerHTML = '<div id="tooltip"></div><input id="mapName" value="Jotun">';
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
    cells: { province: new Uint16Array([0, 3]) }
  } as unknown as typeof pack;

  window.JSZip = FakeZip as unknown as typeof window.JSZip;
  window.prompt = vi.fn(() => "jotun-live");
  window.URL.createObjectURL = vi.fn(() => "blob:archive");
  window.URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

describe("in-application Archive export", () => {
  it("packages the live map projection under one Archive root", async () => {
    await ArchiveExportDownload.downloadArchive();

    expect(archivedFiles.has("Jotun (Azgaar Archive)/azgaar-archive-manifest.json")).toBe(true);
    expect(archivedFiles.has("Jotun (Azgaar Archive)/States/Daraluma (Azgaar State).md")).toBe(true);
    expect(archivedFiles.has("Jotun (Azgaar Archive)/Burgs/Drelgard (Azgaar Burg).md")).toBe(true);
    expect(localStorage.getItem("archive-export-world-id:1788160068282")).toBe("jotun-live");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });
});
