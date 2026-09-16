import type { CustomLayer } from "@/types/custom-layers";
import type { Journey } from "@/types/Journey";

export interface LegacyNote {
  id: string;
  name: string;
  legend: string;
}

interface ForkData {
  format: "azgaar-obsidian";
  schemaVersion: 1;
  release: string;
  customLayers: CustomLayer[];
  archiveWorldId?: string;
  legacyNotes?: LegacyNote[];
}

export function serializeForkData(
  source: { customLayers?: CustomLayer[]; archiveWorldId?: string; archiveLegacyNotes?: LegacyNote[] },
  release: string
): string {
  const extension: ForkData = {
    format: "azgaar-obsidian",
    schemaVersion: 1,
    release,
    customLayers: source.customLayers ?? [],
    legacyNotes: source.archiveLegacyNotes,
    archiveWorldId: source.archiveWorldId
  };
  return JSON.stringify(extension);
}

export function readForkData(
  data: string[],
  mapVersion: string
): {
  customLayers: CustomLayer[];
  archiveWorldId?: string;
  legacyNotes?: LegacyNote[];
  journeys: Journey[];
  migrationVersion: string;
} {
  const modernSettings = data[1]?.trimStart().startsWith("{");
  const slot: unknown = data[52] ? JSON.parse(data[52]) : [];
  const legacyLayers =
    Array.isArray(slot) &&
    slot.length > 0 &&
    slot.every(value => value && value.geometry === "point" && Array.isArray(value.entities));
  const legacy = !modernSettings && (legacyLayers || Boolean(data[53]) || /^1\.153\.\d+$/.test(mapVersion));
  if (legacy) {
    if (!Array.isArray(slot) || (slot.length > 0 && !legacyLayers))
      throw new Error("Unrecognized legacy fork layer data");
    return {
      customLayers: slot as CustomLayer[],
      archiveWorldId: data[53] || undefined,
      legacyNotes: data[4] ? JSON.parse(data[4]) : [],
      journeys: [],
      migrationVersion: "1.149.2"
    };
  }
  const extension: ForkData | undefined = data[53] ? JSON.parse(data[53]) : undefined;
  if (
    extension &&
    (extension.format !== "azgaar-obsidian" || extension.schemaVersion !== 1 || !Array.isArray(extension.customLayers))
  )
    throw new Error("Unsupported Obsidian fork data; use a compatible version to preserve it");
  if (!Array.isArray(slot) || slot.some(value => !value || !Array.isArray(value.segments)))
    throw new Error("Unrecognized journey data");
  return {
    customLayers: extension?.customLayers ?? [],
    archiveWorldId: extension?.archiveWorldId,
    legacyNotes: extension?.legacyNotes,
    journeys: slot as Journey[],
    migrationVersion: mapVersion
  };
}
