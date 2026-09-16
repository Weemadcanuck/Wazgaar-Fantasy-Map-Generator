import type { CustomFieldDefinition, CustomLayer, CustomPointEntity, CustomPointLayer } from "@/types/custom-layers";

const listeners = new Set<() => void>();

const createId = (): string => crypto.randomUUID();

const ensure = (): CustomLayer[] => (pack.customLayers ??= []);

function initiate(): void {
  pack.customLayers = [];
  emit();
}

function restore(layers: CustomLayer[]): void {
  pack.customLayers = layers ?? [];
  emit();
}

function getLayer(id: string): CustomPointLayer | undefined {
  return ensure().find(layer => layer.id === id);
}

function createLayer(input: {
  name: string;
  pluralName?: string;
  icon?: string;
  color?: string;
  size?: number;
  resizeOnZoom?: boolean;
  archiveExport?: boolean;
  fields?: CustomFieldDefinition[];
}): CustomPointLayer {
  const name = input.name.trim() || "Custom Point";
  const layer: CustomPointLayer = {
    id: createId(),
    name,
    pluralName: input.pluralName?.trim() || `${name}s`,
    geometry: "point",
    icon: input.icon?.trim() || "◆",
    color: input.color || "#7c4d8b",
    size: input.size ?? 30,
    resizeOnZoom: input.resizeOnZoom ?? true,
    visible: true,
    archiveExport: input.archiveExport ?? true,
    fields: input.fields ?? [],
    entities: []
  };
  ensure().push(layer);
  emit();
  return layer;
}

function updateLayer(id: string, updates: Partial<Omit<CustomPointLayer, "id" | "geometry" | "entities">>): void {
  const layer = getLayer(id);
  if (!layer) return;
  Object.assign(layer, updates);
  emit();
}

function removeLayer(id: string): void {
  pack.customLayers = ensure().filter(layer => layer.id !== id);
  emit();
}

function addPoint(
  layerId: string,
  point: Pick<CustomPointEntity, "x" | "y" | "cell"> & Partial<CustomPointEntity>
): CustomPointEntity | undefined {
  const layer = getLayer(layerId);
  if (!layer) return;
  const entity: CustomPointEntity = {
    id: createId(),
    name: point.name?.trim() || `New ${layer.name}`,
    x: point.x,
    y: point.y,
    cell: point.cell,
    authority: point.authority ?? "authored",
    notes: point.notes ?? "",
    icon: point.icon,
    color: point.color,
    values: point.values ?? {}
  };
  layer.entities.push(entity);
  emit();
  return entity;
}

function updatePoint(layerId: string, entityId: string, updates: Partial<Omit<CustomPointEntity, "id">>): void {
  const entity = getLayer(layerId)?.entities.find(point => point.id === entityId);
  if (!entity) return;
  Object.assign(entity, updates);
  emit();
}

function removePoint(layerId: string, entityId: string): void {
  const layer = getLayer(layerId);
  if (!layer) return;
  layer.entities = layer.entities.filter(point => point.id !== entityId);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

export const CustomLayers = {
  addPoint,
  createLayer,
  ensure,
  getLayer,
  initiate,
  removeLayer,
  removePoint,
  restore,
  subscribe,
  updateLayer,
  updatePoint
};

type CustomLayersModule = typeof CustomLayers;

declare global {
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy code
  var CustomLayers: CustomLayersModule;
}

window.CustomLayers = CustomLayers;
