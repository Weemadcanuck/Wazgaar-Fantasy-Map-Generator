// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/services/versioning", () => ({ VERSION: "9.8.7" }));

import { showInfo } from "./app-info";

beforeEach(() => {
  document.body.innerHTML = '<div id="alertMessage"></div><svg></svg>';
  vi.stubGlobal("$", () => ({ dialog: vi.fn() }));
});

afterEach(() => {
  window.electron = undefined;
  vi.unstubAllGlobals();
});

it("shows the synchronized version and runtime in the About dialog", () => {
  window.electron = {
    isElectron: true,
    platform: "win32",
    requestQuit: vi.fn(),
    versions: { electron: "test", chrome: "test", node: "test" },
    archiveExport: { writeDirectory: vi.fn() }
  };

  showInfo();

  expect(document.getElementById("alertMessage")?.textContent).toContain("Version ID: 9.8.7 · Desktop");
});

it("identifies the web runtime when the desktop bridge is absent", () => {
  showInfo();

  expect(document.getElementById("alertMessage")?.textContent).toContain("Version ID: 9.8.7 · Web");
});
