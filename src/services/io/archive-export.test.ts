import { describe, expect, it } from "vitest";
import jotunFixture from "../../../../../Jotun Full.json";
import { type ArchiveWorldSnapshot, buildArchiveExportPlan, sanitizeArchiveFilename } from "./archive-export";

const loadJotun = () => jotunFixture as unknown as ArchiveWorldSnapshot;

describe("Archive export", () => {
  it("exports the active Jotun reference entities", () => {
    const plan = buildArchiveExportPlan(loadJotun(), { worldId: "jotun-test" });
    const paths = plan.files.map(file => file.path);

    expect(paths.filter(path => path.startsWith("States/"))).toHaveLength(16);
    expect(paths.filter(path => path.startsWith("Provinces/"))).toHaveLength(31);
    expect(paths.filter(path => path.startsWith("Burgs/"))).toHaveLength(131);
    expect(paths.filter(path => path.startsWith("Cultures/"))).toHaveLength(18);
    expect(paths.filter(path => path.startsWith("Religions/"))).toHaveLength(15);
  });

  it("disambiguates the Jotun state and culture named Azar", () => {
    const plan = buildArchiveExportPlan(loadJotun(), { worldId: "jotun-test" });

    expect(plan.manifest.entities["jotun-test:state:8"]?.path).toBe("States/Azar (Azgaar State).md");
    expect(plan.manifest.entities["jotun-test:culture:14"]?.path).toBe("Cultures/Azar (Azgaar Culture).md");
  });

  it("resolves burg provinces from full JSON cell rows", () => {
    const plan = buildArchiveExportPlan(loadJotun(), { worldId: "jotun-test" });
    const drelgard = plan.files.find(file => file.entityKey === "jotun-test:burg:1");

    expect(drelgard?.content.includes("[[Eld (Azgaar Province)|Eld]]")).toBe(true);
  });

  it("is byte-deterministic for the same snapshot and profile", () => {
    const snapshot = loadJotun();
    const first = buildArchiveExportPlan(snapshot, { worldId: "jotun-test" });
    const second = buildArchiveExportPlan(snapshot, { worldId: "jotun-test" });

    expect(second.files).toEqual(first.files);
  });

  it("does not expose Archive-disallowed state simulation fields", () => {
    const plan = buildArchiveExportPlan(loadJotun(), { worldId: "jotun-test" });
    const state = plan.files.find(file => file.entityKey === "jotun-test:state:1");

    expect(state?.content).not.toMatch(/population|military|alert|expansionism|diplomacy/i);
    expect(state?.content.includes("not automatic Archive canon")).toBe(true);
  });

  it("exports settlement features but keeps population out of generated references", () => {
    const snapshot: ArchiveWorldSnapshot = {
      info: { mapName: "Features", version: "test" },
      pack: {
        states: [
          { i: 0, name: "Neutrals" },
          { i: 1, name: "Example Polity", capital: 1 }
        ],
        provinces: [],
        burgs: [
          { i: 0, name: "No settlement" },
          {
            i: 1,
            name: "Example Settlement",
            state: 1,
            population: 1000,
            capital: 1,
            port: 1,
            citadel: 1,
            walls: 1,
            plaza: 1,
            temple: 1,
            shanty: 1
          }
        ],
        cultures: [{ i: 0, name: "Wildlands" }],
        religions: [{ i: 0, name: "No religion" }]
      }
    };
    const plan = buildArchiveExportPlan(snapshot, { worldId: "jotun-test" });
    const note = plan.files.find(file => file.entityKey === "jotun-test:burg:1")?.content;

    expect(
      note?.includes("- **Features:** Capital, Port, Citadel, Walls, Market center, Religious center, Shanty town")
    ).toBe(true);
    expect(note?.includes("- **Polity:**")).toBe(true);
    expect(note).not.toMatch(/population/i);
  });

  it("sanitizes unsafe and Windows-reserved filenames", () => {
    expect(sanitizeArchiveFilename("AUX")).toBe("AUX-note");
    expect(sanitizeArchiveFilename("North: East/West. ")).toBe("North- East-West");
  });

  it("qualifies duplicate names within one entity type by native id", () => {
    const snapshot: ArchiveWorldSnapshot = {
      info: { mapName: "Duplicates", version: "test" },
      pack: {
        states: [
          { i: 0, name: "Neutrals" },
          { i: 1, name: "Same" },
          { i: 2, name: "Same" }
        ],
        provinces: [],
        burgs: [],
        cultures: [{ i: 0, name: "Wildlands" }],
        religions: [{ i: 0, name: "No religion" }]
      }
    };
    const plan = buildArchiveExportPlan(snapshot, { worldId: "duplicates" });

    expect(plan.manifest.entities["duplicates:state:1"]?.path.includes("(#1)")).toBe(true);
    expect(plan.manifest.entities["duplicates:state:2"]?.path.includes("(#2)")).toBe(true);
  });
});
