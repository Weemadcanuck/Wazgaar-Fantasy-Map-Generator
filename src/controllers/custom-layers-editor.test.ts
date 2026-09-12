// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { addFieldTemplate, getPreferredIcon } from "./custom-layers-editor";

describe("custom layer field starters", () => {
  it("adds only missing starter fields when editing an existing layer", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "Holder | text\nStatus | text";

    expect(addFieldTemplate(textarea, "artifact")).toBe(4);
    expect(textarea.value).toContain("Holder | text");
    expect(textarea.value.match(/Holder \| text/g)).toHaveLength(1);
    expect(textarea.value).toContain("Condition | text");
    expect(textarea.value).toContain("Active | boolean");
  });

  it("reports when the selected starter is already present", () => {
    const textarea = document.createElement("textarea");
    addFieldTemplate(textarea, "tracking");

    expect(addFieldTemplate(textarea, "tracking")).toBe(0);
  });
});

describe("custom layer icon defaults", () => {
  it("reuses an icon already chosen for a custom point", () => {
    globalThis.pack = {
      customLayers: [
        {
          id: "artifacts",
          name: "Artifact",
          pluralName: "Artifacts",
          geometry: "point",
          icon: "◆",
          color: "#000000",
          visible: true,
          archiveExport: true,
          fields: [],
          entities: [
            {
              id: "crown",
              name: "Crown",
              x: 1,
              y: 1,
              cell: 1,
              authority: "authored",
              notes: "",
              icon: "♛",
              values: {}
            }
          ]
        }
      ]
    } as unknown as typeof pack;

    expect(getPreferredIcon()).toBe("♛");
  });
});
