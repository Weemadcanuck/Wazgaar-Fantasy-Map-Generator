import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomLayers } from "./custom-layers";

describe("CustomLayers", () => {
  beforeEach(() => {
    globalThis.pack = { customLayers: [] } as unknown as typeof globalThis.pack;
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
  });

  afterEach(() => vi.restoreAllMocks());

  it("creates stable point layers and authored entities", () => {
    const layer = CustomLayers.createLayer({
      name: "Artifact",
      pluralName: "Artifacts",
      fields: [{ id: "holder", name: "Holder", type: "text" }]
    });
    const entity = CustomLayers.addPoint(layer.id, { x: 12.5, y: 30, cell: 7, name: "The Crown" });

    expect(layer.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(entity).toMatchObject({
      id: "00000000-0000-4000-8000-000000000002",
      name: "The Crown",
      authority: "authored",
      values: {}
    });
  });

  it("keeps layer visibility and data together for serialization", () => {
    const layer = CustomLayers.createLayer({ name: "Mind" });
    CustomLayers.updateLayer(layer.id, { visible: false, archiveExport: false });
    const restored = structuredClone(pack.customLayers);
    CustomLayers.initiate();
    CustomLayers.restore(restored);

    expect(CustomLayers.getLayer(layer.id)).toMatchObject({ visible: false, archiveExport: false });
  });
});
