import { describe, expect, it } from "vitest";
import jotunFixture from "../../../../../Jotun Full.json";
import {
  type ArchiveWorldSnapshot,
  buildArchiveExportPlan,
  createArchiveExportProfile,
  sanitizeArchiveFilename
} from "./archive-export";
import { ARCHIVE_FULL_SNAPSHOT_OPTIONS } from "./archive-export-profile";

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

  it("exports selected simulation categories with explicit freshness and authority warnings", () => {
    const snapshot: ArchiveWorldSnapshot = {
      info: { mapName: "Simulation", version: "test", populationRate: 1000, urbanization: 2 },
      pack: {
        states: [
          { i: 0, name: "Neutrals" },
          {
            i: 1,
            name: "North",
            rural: 10,
            urban: 5,
            alert: 1.5,
            salesTax: 0.1,
            pollTax: 0.2,
            treasury: 300,
            diplomacy: ["x", "x", "Enemy"],
            military: [{ i: 0, name: "First Host", t: 120, type: "land", u: { infantry: 100 } }]
          },
          { i: 2, name: "South" }
        ],
        provinces: [],
        burgs: [
          { i: 0, name: "No settlement" },
          { i: 1, name: "Northport", state: 1, population: 3, market: 1, product: 50, treasury: 20 }
        ],
        cultures: [{ i: 0, name: "Wildlands" }],
        religions: [{ i: 0, name: "No religion" }],
        goods: [{ i: 0, name: "Wood", unit: "pile", value: 1, tags: ["construction"] }],
        markets: [{ i: 1, name: "North Market", centerBurgId: 1, goods: { 0: { stock: 12, price: 2 } } }],
        deals: [
          { i: 4, seller: 1, sellerType: "burg", buyer: 1, buyerType: "market", good: 0, units: 2, price: 4, tax: 0.4 }
        ]
      }
    };
    const plan = buildArchiveExportPlan(snapshot, {
      worldId: "simulation-test",
      profile: createArchiveExportProfile(ARCHIVE_FULL_SNAPSHOT_OPTIONS)
    });
    const polity = plan.files.find(file => file.entityKey === "simulation-test:state:1")?.content;
    const settlement = plan.files.find(file => file.entityKey === "simulation-test:burg:1")?.content;
    const economy = plan.files.find(file => file.path === "Simulation/Economy Snapshot.md")?.content;

    expect(polity?.includes("Estimated rural population:** 10000 people")).toBe(true);
    expect(polity?.includes("Estimated urban population:** 10000 people")).toBe(true);
    expect(polity?.includes("Formation 0:** First Host (land); personnel: 120; units: infantry: 100")).toBe(true);
    expect(polity?.includes("Enemy:** [[South (Azgaar State)|South]]")).toBe(true);
    expect(settlement?.includes("Estimated population:** 6000 people")).toBe(true);
    expect(economy?.includes('Azgaar_simulation_freshness: "not-tracked"')).toBe(true);
    expect(economy?.includes("| 4 | [[Northport (Azgaar Burg)|Northport]] | North Market | Wood | 2 | 4 | 0.4 |")).toBe(
      true
    );
    expect(plan.manifest.simulation.categories).toEqual(["population", "economy", "military", "diplomacy"]);
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
