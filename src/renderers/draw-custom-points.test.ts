// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { drawCustomPoints, resizeCustomPoints } from "./draw-custom-points";

describe("drawCustomPoints", () => {
  beforeEach(() => {
    document.body.innerHTML = '<svg><g id="customPoints"></g></svg>';
    globalThis.scale = 1;
    globalThis.pack = {
      customLayers: [
        {
          id: "artifacts",
          name: "Artifact",
          pluralName: "Artifacts",
          geometry: "point",
          icon: "◆",
          color: "#7c4d8b",
          size: 30,
          resizeOnZoom: true,
          visible: true,
          archiveExport: true,
          fields: [],
          entities: [
            {
              id: "crown",
              name: "The Crown",
              x: 40,
              y: 30,
              cell: 1,
              authority: "authored",
              notes: "",
              values: {}
            }
          ]
        },
        {
          id: "hidden",
          name: "Hidden",
          pluralName: "Hidden",
          geometry: "point",
          icon: "?",
          color: "#000000",
          size: 30,
          resizeOnZoom: false,
          visible: false,
          archiveExport: false,
          fields: [],
          entities: []
        }
      ]
    } as unknown as typeof globalThis.pack;
  });

  it("renders independent layer groups and stable entity hooks", () => {
    drawCustomPoints();

    const entity = document.querySelector<SVGElement>('[data-custom-point-id="crown"]');
    expect(entity?.dataset.customLayerId).toBe("artifacts");
    expect(entity?.getAttribute("aria-label")).toBe("The Crown");
    expect(document.querySelector<SVGGElement>('[data-custom-layer-id="hidden"]')?.style.display).toBe("none");
  });

  it("resizes zoom-aware points after the scale settles", () => {
    drawCustomPoints();
    globalThis.scale = 2;
    resizeCustomPoints();

    const entity = document.querySelector<SVGElement>('[data-custom-point-id="crown"]');
    expect(entity?.getAttribute("width")).toBe("18");
    expect(entity?.getAttribute("x")).toBe("31");
    expect(entity?.getAttribute("y")).toBe("12");
  });

  it("renders embedded image icons inside the point pin", () => {
    pack.customLayers![0].entities[0].icon = "data:image/png;base64,AAAA";
    drawCustomPoints();

    const image = document.querySelector<SVGImageElement>('[data-custom-point-id="crown"] image');
    expect(image?.getAttribute("href")).toBe("data:image/png;base64,AAAA");
  });
});
