import { describe, expect, it } from "vitest";
import type { CustomLayer } from "@/types/custom-layers";
import { readForkData, serializeForkData } from "./fork-data";

const layer: CustomLayer = {
  id: "layer-id",
  name: "Landmark",
  pluralName: "Landmarks",
  geometry: "point",
  icon: "X",
  color: "#ffffff",
  visible: false,
  archiveExport: true,
  fields: [],
  entities: [
    { id: "point-id", name: "Tower", x: 10, y: 20, cell: 3, authority: "authored", notes: "Keep this", values: {} }
  ]
};
const data = (settings: string, slot52: unknown, slot53 = "") => {
  const rows = Array<string>(54).fill("");
  rows[1] = settings;
  rows[52] = JSON.stringify(slot52);
  rows[53] = slot53;
  return rows;
};

describe("fork save compatibility", () => {
  it("moves legacy custom layers into the labelled extension without creating journeys", () => {
    const old = data("km|3|square", [layer], "world-id");
    const notes = [{ id: "regiment9-4", name: "Regiment", legend: "Preserve original text" }];
    old[4] = JSON.stringify(notes);
    const before = [...old];
    const loaded = readForkData(old, "1.153.9");
    expect(loaded).toEqual({
      customLayers: [layer],
      archiveWorldId: "world-id",
      legacyNotes: notes,
      journeys: [],
      migrationVersion: "1.149.2"
    });
    expect(old).toEqual(before);
    const saved = data(
      "{}",
      loaded.journeys,
      serializeForkData({ ...loaded, archiveLegacyNotes: loaded.legacyNotes }, "1.154.0")
    );
    expect(readForkData(saved, "1.153.0")).toEqual({ ...loaded, migrationVersion: "1.153.0" });
  });

  it("preserves journeys and custom layers together through a round trip", () => {
    const journeys = [{ i: 1, name: "Route", segments: [{ points: [[1, 2, 3]] }] }];
    const rows = data(
      "{}",
      journeys,
      serializeForkData({ customLayers: [layer], archiveWorldId: "world-id" }, "1.154.0")
    );
    const loaded = readForkData(rows, "1.153.0");
    expect(loaded.journeys).toEqual(journeys);
    expect(loaded.customLayers).toEqual([layer]);
    expect(readForkData(data("{}", journeys), "1.153.0").customLayers).toEqual([]);
  });

  it("recognizes an empty legacy fork and leaves genuine old upstream versions alone", () => {
    expect(readForkData(data("km|3", []), "1.153.5").migrationVersion).toBe("1.149.2");
    expect(readForkData(data("km|3", []), "1.140.0").migrationVersion).toBe("1.140.0");
  });

  it("rejects unknown extension versions rather than discarding their data", () => {
    expect(() => readForkData(data("{}", [], '{"format":"azgaar-obsidian","schemaVersion":2}'), "1.153.0")).toThrow(
      "Unsupported"
    );
    expect(() => readForkData(data("{}", [layer]), "1.153.0")).toThrow("journey");
  });
});
