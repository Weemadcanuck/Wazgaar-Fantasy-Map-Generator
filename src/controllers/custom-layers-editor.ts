import { pointer } from "d3";
import { closeDialogs, destroyDialog } from "@/components/dialog/dialog-helpers";
import { stopMapPlacement, toggleMapPlacement } from "@/components/map-placement";
import { CustomLayers } from "@/generators/custom-layers";
import type {
  CustomEntityAuthority,
  CustomFieldDefinition,
  CustomFieldType,
  CustomPointEntity,
  CustomPointLayer
} from "@/types/custom-layers";
import { ensureEl, rn } from "@/utils";

let selectedLayerId: string | undefined;
const safeColor = (value: string | undefined) => (value && /^#[\da-f]{6}$/i.test(value) ? value : "#7c4d8b");
const authorityLabels: Record<CustomEntityAuthority, string> = {
  authored: "Azgaar authored",
  generated: "FMG generated",
  archive: "Archive sourced"
};
const fieldTemplates: Record<string, string[]> = {
  artifact: [
    "Holder | text",
    "Condition | text",
    "Status | text",
    "Origin | text",
    "Danger | text",
    "Active | boolean"
  ],
  mind: [
    "Classification | text",
    "Disposition | text",
    "Domain | text",
    "Manifestation | text",
    "Known agents | text",
    "Contained | boolean",
    "Confidence | text"
  ],
  site: [
    "Category | text",
    "Status | text",
    "Parent polity | text",
    "Strategic role | text",
    "Access | text",
    "Active | boolean"
  ],
  tracking: ["Last verified | text", "Source | text", "Confidence | text", "Needs review | boolean"]
};

const isImageIcon = (value: string) => /^(https?:\/\/|data:image\/)/i.test(value);
const renderIconPreview = (value: string) =>
  isImageIcon(value)
    ? `<img src="${escapeHtml(value)}" alt="" style="width:1.4em;height:1.4em;object-fit:contain">`
    : escapeHtml(value);

function open(layerId?: string): void {
  if (customization) return;
  closeDialogs("#customLayersEditor, .stable");
  selectedLayerId = layerId ?? selectedLayerId ?? CustomLayers.ensure()[0]?.id;
  renderManager();
  $("#customLayersEditor").dialog({
    title: "Custom Point Layers",
    width: "42em",
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" },
    close: () => {
      stopMapPlacement();
      destroyDialog("customLayersEditor");
    }
  });
}

function renderManager(): void {
  destroyDialog("customLayersEditor");
  const layers = CustomLayers.ensure();
  const selected = CustomLayers.getLayer(selectedLayerId ?? "") ?? layers[0];
  selectedLayerId = selected?.id;

  const options = layers
    .map(
      layer =>
        `<option value="${layer.id}" ${layer.id === selected?.id ? "selected" : ""}>${escapeHtml(layer.pluralName)}</option>`
    )
    .join("");
  const rows =
    selected?.entities
      .map(
        entity => /* html */ `<div class="custom-point-row" data-entity-id="${entity.id}">
          <span class="custom-point-icon">${renderIconPreview(entity.icon || selected.icon)}</span>
          <span class="custom-point-name">${escapeHtml(entity.name)}</span>
          <span class="custom-point-authority">${authorityLabels[entity.authority]}</span>
          <button data-action="edit-point">Edit</button>
          <button data-action="remove-point" class="icon-trash-empty" data-tip="Remove this item"></button>
        </div>`
      )
      .join("") ||
    `<p class="custom-layers-empty">No ${escapeHtml(selected?.pluralName.toLowerCase() || "layers")} yet.</p>`;

  const html = /* html */ `<div id="customLayersEditor" class="dialog archive-export-dialog">
    <div class="custom-layers-toolbar">
      <select id="customLayerSelect" ${layers.length ? "" : "disabled"}>${options}</select>
      <button id="customLayerNew">New layer</button>
      <button id="customLayerEdit" ${selected ? "" : "disabled"}>Layer settings</button>
      <button id="customLayerRemove" ${selected ? "" : "disabled"}>Remove layer</button>
    </div>
    ${
      selected
        ? `<div class="custom-layer-summary">
            <span class="custom-layer-swatch" style="color:${safeColor(selected.color)}">${renderIconPreview(selected.icon)}</span>
            <span>${selected.entities.length} ${escapeHtml(selected.entities.length === 1 ? selected.name : selected.pluralName)}</span>
            <label><input id="customLayerVisible" type="checkbox" ${selected.visible ? "checked" : ""}> Visible</label>
            <label><input id="customLayerArchiveExport" type="checkbox" ${selected.archiveExport ? "checked" : ""}> Archive export</label>
          </div>
          <div id="customPointsBody">${rows}</div>
          <button id="customPointAdd" style="width:100%; margin-top:.5em">Place ${escapeHtml(selected.name)}</button>`
        : `<p>Create a point layer for artifacts, Minds, godheads, colonies, or any other map entity.</p>`
    }
  </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);

  ensureEl("customLayerNew").addEventListener("click", create);
  ensureEl<HTMLSelectElement>("customLayerSelect").addEventListener("change", event => {
    selectedLayerId = (event.target as HTMLSelectElement).value;
    reopen();
  });
  if (!selected) return;

  ensureEl("customLayerEdit").addEventListener("click", () => editLayer(selected.id));
  ensureEl("customLayerRemove").addEventListener("click", () => removeLayer(selected));
  ensureEl<HTMLInputElement>("customLayerVisible").addEventListener("change", event => {
    CustomLayers.updateLayer(selected.id, { visible: (event.target as HTMLInputElement).checked });
  });
  ensureEl<HTMLInputElement>("customLayerArchiveExport").addEventListener("change", event => {
    CustomLayers.updateLayer(selected.id, { archiveExport: (event.target as HTMLInputElement).checked });
  });
  ensureEl("customPointAdd").addEventListener("click", () => togglePointPlacement(selected.id));
  ensureEl("customPointsBody").addEventListener("click", event => onPointAction(event, selected.id));
}

function reopen(): void {
  const position = $("#customLayersEditor").dialog("option", "position");
  renderManager();
  $("#customLayersEditor").dialog({
    title: "Custom Point Layers",
    width: "42em",
    position,
    close: () => {
      stopMapPlacement();
      destroyDialog("customLayersEditor");
    }
  });
}

function create(): void {
  openLayerDefinition();
}

function editLayer(layerId: string): void {
  const layer = CustomLayers.getLayer(layerId);
  if (layer) openLayerDefinition(layer);
}

function openLayerDefinition(layer?: CustomPointLayer): void {
  destroyDialog("customLayerDefinition");
  const fields = layer?.fields.map(field => `${field.name} | ${field.type}`).join("\n") ?? "";
  const html = /* html */ `<div id="customLayerDefinition" class="dialog archive-export-dialog">
    <p><label>Singular name <input id="customLayerName" value="${escapeHtml(layer?.name || "")}" placeholder="Artifact"></label></p>
    <p><label>Plural name <input id="customLayerPlural" value="${escapeHtml(layer?.pluralName || "")}" placeholder="Artifacts"></label></p>
    <p><label>Icon <input id="customLayerIcon" value="${escapeHtml(layer?.icon || "◆")}" style="width:6em"></label>
      <button id="customLayerChooseIcon" type="button">Choose…</button>
      <label> Colour <input id="customLayerColor" type="color" value="${safeColor(layer?.color)}"></label></p>
    <p><label>Base size <input id="customLayerSize" type="number" min="8" max="100" value="${layer?.size ?? 30}" style="width:4em"></label>
      <label><input id="customLayerResize" type="checkbox" ${layer?.resizeOnZoom === false ? "" : "checked"}> Resize smoothly with map zoom</label></p>
    <p><label><input id="customLayerExport" type="checkbox" ${layer?.archiveExport === false ? "" : "checked"}> Include in Archive exports</label></p>
    <p><label>Field starter
      <select id="customLayerFieldTemplate">
        <option value="">Choose a starter…</option>
        <option value="artifact">Artifact</option>
        <option value="mind">Mind or godhead</option>
        <option value="site">Colony or point of interest</option>
        <option value="tracking">Archive tracking</option>
      </select>
    </label> <button id="customLayerApplyTemplate" type="button">Add fields</button></p>
    <label>Structured fields <span style="font-style:italic">(one per line: <code>Name | text</code>, <code>Name | number</code>, or <code>Name | boolean</code>)</span>
      <textarea id="customLayerFields" rows="8" style="width:100%" placeholder="Status | text&#10;Power | number&#10;Active | boolean">${escapeHtml(fields)}</textarea>
    </label>
    <p style="font-style:italic">Use fields for facts you may sort, export, or synchronize later. Use each item's Notes box for prose.</p>
  </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);

  ensureEl("customLayerChooseIcon").addEventListener("click", () => {
    const input = ensureEl<HTMLInputElement>("customLayerIcon");
    Controllers.IconSelector.open(input.value || "◆", value => (input.value = value));
  });
  ensureEl("customLayerApplyTemplate").addEventListener("click", () => {
    const key = ensureEl<HTMLSelectElement>("customLayerFieldTemplate").value;
    if (!key) return;
    const textarea = ensureEl<HTMLTextAreaElement>("customLayerFields");
    const existing = textarea.value
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    const names = new Set(existing.map(line => line.split("|")[0].trim().toLocaleLowerCase()));
    const additions = fieldTemplates[key].filter(line => !names.has(line.split("|")[0].trim().toLocaleLowerCase()));
    textarea.value = [...existing, ...additions].join("\n");
  });

  $("#customLayerDefinition").dialog({
    title: layer ? `Edit ${layer.name} layer` : "Create Custom Point Layer",
    width: "30em",
    modal: true,
    buttons: {
      Save: function (this: HTMLElement) {
        const name = ensureEl<HTMLInputElement>("customLayerName").value.trim();
        if (!name) return void window.alert("A singular layer name is required.");
        const pluralName = ensureEl<HTMLInputElement>("customLayerPlural").value.trim() || `${name}s`;
        const icon = ensureEl<HTMLInputElement>("customLayerIcon").value.trim() || "◆";
        const color = ensureEl<HTMLInputElement>("customLayerColor").value;
        const size = Math.min(100, Math.max(8, ensureEl<HTMLInputElement>("customLayerSize").valueAsNumber || 30));
        const resizeOnZoom = ensureEl<HTMLInputElement>("customLayerResize").checked;
        const archiveExport = ensureEl<HTMLInputElement>("customLayerExport").checked;
        const fields = parseFields(ensureEl<HTMLTextAreaElement>("customLayerFields").value, layer?.fields ?? []);
        if (layer)
          CustomLayers.updateLayer(layer.id, {
            name,
            pluralName,
            icon,
            color,
            size,
            resizeOnZoom,
            archiveExport,
            fields
          });
        else
          selectedLayerId = CustomLayers.createLayer({
            name,
            pluralName,
            icon,
            color,
            size,
            resizeOnZoom,
            archiveExport,
            fields
          }).id;
        $(this).dialog("close");
        if (document.getElementById("customLayersEditor")) reopen();
        else open(selectedLayerId);
      },
      Cancel: function (this: HTMLElement) {
        $(this).dialog("close");
      }
    },
    close: () => destroyDialog("customLayerDefinition")
  });
}

function parseFields(value: string, existing: CustomFieldDefinition[]): CustomFieldDefinition[] {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [rawName, rawType] = line.split("|").map(part => part.trim());
      const name = rawName || "Field";
      const type: CustomFieldType = ["text", "number", "boolean"].includes(rawType)
        ? (rawType as CustomFieldType)
        : "text";
      const prior = existing.find(field => field.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      return { id: prior?.id ?? crypto.randomUUID(), name, type };
    });
}

function removeLayer(layer: CustomPointLayer): void {
  if (!window.confirm(`Remove the ${layer.pluralName} layer and all ${layer.entities.length} items?`)) return;
  CustomLayers.removeLayer(layer.id);
  selectedLayerId = CustomLayers.ensure()[0]?.id;
  reopen();
}

function togglePointPlacement(layerId: string): void {
  const layer = CustomLayers.getLayer(layerId);
  if (!layer) return;
  CustomLayers.updateLayer(layerId, { visible: true });
  toggleMapPlacement(
    "customPointAdd",
    event => {
      const [x, y] = pointer(event, event.currentTarget as SVGGElement);
      const cell = Pack.findCell(x, y);
      if (cell === undefined) return;
      const entity = CustomLayers.addPoint(layerId, { x: rn(x, 2), y: rn(y, 2), cell });
      if (!event.shiftKey) {
        stopMapPlacement();
        if (entity) openPoint(layerId, entity.id);
      }
    },
    `Click on the map to place a ${layer.name}. Hold Shift to add multiple.`,
    undefined,
    () => document.getElementById("customPointAdd")?.classList.remove("pressed")
  );
}

function onPointAction(event: Event, layerId: string): void {
  const target = event.target as HTMLElement;
  const row = target.closest<HTMLElement>("[data-entity-id]");
  const entityId = row?.dataset.entityId;
  if (!entityId) return;
  if (target.closest('[data-action="remove-point"]')) {
    const layer = CustomLayers.getLayer(layerId);
    const entity = layer?.entities.find(point => point.id === entityId);
    if (entity && window.confirm(`Remove ${entity.name}?`)) {
      CustomLayers.removePoint(layerId, entityId);
      reopen();
    }
  } else if (target.closest('[data-action="edit-point"]') || row === target) openPoint(layerId, entityId);
}

function openPoint(layerId: string, entityId: string): void {
  const layer = CustomLayers.getLayer(layerId);
  const entity = layer?.entities.find(point => point.id === entityId);
  if (!layer || !entity) return;
  destroyDialog("customPointEditor");

  const fields = layer.fields.map(field => renderField(field, entity)).join("");
  const html = /* html */ `<div id="customPointEditor" class="dialog archive-export-dialog">
    <p><label>Name <input id="customPointName" value="${escapeHtml(entity.name)}" style="width:22em"></label></p>
    <p><label>Authority <select id="customPointAuthority">
      ${(["authored", "generated", "archive"] as CustomEntityAuthority[])
        .map(
          value =>
            `<option value="${value}" ${entity.authority === value ? "selected" : ""}>${authorityLabels[value]}</option>`
        )
        .join("")}
    </select></label> <span style="font-style:italic">Archive sourced records provenance only; it is not live synchronization.</span></p>
    <p><label>Icon override <input id="customPointIcon" value="${escapeHtml(entity.icon || "")}" placeholder="${escapeHtml(layer.icon)}" style="width:6em"></label>
      <button id="customPointChooseIcon" type="button">Choose…</button>
      <label> Colour override <input id="customPointColor" type="color" value="${safeColor(entity.color || layer.color)}"></label>
      <label><input id="customPointUseLayerColor" type="checkbox" ${entity.color ? "" : "checked"}> Use layer colour</label></p>
    <div class="custom-point-fields">${fields}</div>
    <p><label>Notes<textarea id="customPointNotes" rows="5" style="width:100%">${escapeHtml(entity.notes)}</textarea></label></p>
    <p class="custom-point-id">Stable ID: <code>${entity.id}</code></p>
  </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);

  ensureEl("customPointChooseIcon").addEventListener("click", () => {
    const input = ensureEl<HTMLInputElement>("customPointIcon");
    Controllers.IconSelector.open(
      input.value || layer.icon,
      value => (input.value = value === layer.icon ? "" : value)
    );
  });

  $("#customPointEditor").dialog({
    title: `Edit ${layer.name}`,
    width: "32em",
    modal: false,
    buttons: {
      Save: function (this: HTMLElement) {
        const values = readFieldValues(layer.fields);
        const useLayerColor = ensureEl<HTMLInputElement>("customPointUseLayerColor").checked;
        CustomLayers.updatePoint(layerId, entityId, {
          name: ensureEl<HTMLInputElement>("customPointName").value.trim() || `Unnamed ${layer.name}`,
          authority: ensureEl<HTMLSelectElement>("customPointAuthority").value as CustomEntityAuthority,
          icon: ensureEl<HTMLInputElement>("customPointIcon").value.trim() || undefined,
          color: useLayerColor ? undefined : ensureEl<HTMLInputElement>("customPointColor").value,
          notes: ensureEl<HTMLTextAreaElement>("customPointNotes").value,
          values
        });
        $(this).dialog("close");
        if (document.getElementById("customLayersEditor")) reopen();
      },
      Remove: function (this: HTMLElement) {
        if (!window.confirm(`Remove ${entity.name}?`)) return;
        CustomLayers.removePoint(layerId, entityId);
        $(this).dialog("close");
        if (document.getElementById("customLayersEditor")) reopen();
      },
      Cancel: function (this: HTMLElement) {
        $(this).dialog("close");
      }
    },
    close: () => destroyDialog("customPointEditor")
  });
}

function renderField(field: CustomFieldDefinition, entity: CustomPointEntity): string {
  const value = entity.values[field.id];
  if (field.type === "boolean") {
    return `<p><label><input data-custom-field="${field.id}" data-field-type="boolean" type="checkbox" ${value ? "checked" : ""}> ${escapeHtml(field.name)}</label></p>`;
  }
  return `<p><label>${escapeHtml(field.name)} <input data-custom-field="${field.id}" data-field-type="${field.type}" type="${field.type}" value="${escapeHtml(value == null ? "" : String(value))}"></label></p>`;
}

function readFieldValues(fields: CustomFieldDefinition[]): Record<string, string | number | boolean> {
  return Object.fromEntries(
    fields.map(field => {
      const input = document.querySelector<HTMLInputElement>(`[data-custom-field="${field.id}"]`)!;
      if (field.type === "boolean") return [field.id, input.checked];
      if (field.type === "number") return [field.id, input.value === "" ? "" : input.valueAsNumber];
      return [field.id, input.value];
    })
  );
}

function escapeHtml(value: string): string {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}

export const CustomLayersEditor = { create, open, openPoint };
