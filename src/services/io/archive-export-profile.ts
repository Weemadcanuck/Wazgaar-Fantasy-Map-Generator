export type ArchiveSimulationOptions = {
  diplomacy: boolean;
  economy: boolean;
  military: boolean;
  population: boolean;
};

export const ARCHIVE_REFERENCE_SAFE_OPTIONS: ArchiveSimulationOptions = {
  diplomacy: false,
  economy: false,
  military: false,
  population: false
};

export const ARCHIVE_FULL_SNAPSHOT_OPTIONS: ArchiveSimulationOptions = {
  diplomacy: true,
  economy: true,
  military: true,
  population: true
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const PROFILE_PREFIX = "archive-export-profile";
const profileKey = (mapId: number | string) => `${PROFILE_PREFIX}:${mapId}`;

export const normalizeArchiveSimulationOptions = (value: unknown): ArchiveSimulationOptions => {
  const candidate = value && typeof value === "object" ? (value as Partial<ArchiveSimulationOptions>) : {};
  return {
    population: candidate.population === true,
    economy: candidate.economy === true,
    military: candidate.military === true,
    diplomacy: candidate.diplomacy === true
  };
};

export const loadArchiveSimulationOptions = (
  storage: StorageLike,
  mapId: number | string
): ArchiveSimulationOptions => {
  try {
    const stored = storage.getItem(profileKey(mapId));
    return stored ? normalizeArchiveSimulationOptions(JSON.parse(stored)) : { ...ARCHIVE_REFERENCE_SAFE_OPTIONS };
  } catch {
    return { ...ARCHIVE_REFERENCE_SAFE_OPTIONS };
  }
};

export const saveArchiveSimulationOptions = (
  storage: StorageLike,
  mapId: number | string,
  options: ArchiveSimulationOptions
) => storage.setItem(profileKey(mapId), JSON.stringify(normalizeArchiveSimulationOptions(options)));
