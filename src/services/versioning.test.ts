// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import html from "../index.html?raw";

vi.mock("@/components/dialog/dialog-state", () => ({ dialogState: { clear: vi.fn() } }));
vi.mock("@/components/tooltips", () => ({ tip: vi.fn() }));

it("populates the actual About tab on startup with the current release version", async () => {
  const page = new DOMParser().parseFromString(html, "text/html");
  document.body.replaceChildren(page.getElementById("aboutContent")!);
  // A newer stored version avoids update announcements in this isolated startup check.
  localStorage.setItem("version", "999.0.0");
  const { VERSION } = await import("./versioning");
  await import("@/components/options/tabs/about-tab");
  expect(document.querySelector("#aboutContent #aboutVersion")?.textContent).toBe(VERSION);
  expect(document.getElementById("aboutContent")?.textContent).toContain("Azgaar Obsidian Fork");
  localStorage.clear();
});
