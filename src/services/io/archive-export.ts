export const ARCHIVE_SCHEMA_VERSION = 1;

export type ArchiveEntityType = "state" | "province" | "burg" | "culture" | "religion";

type NativeEntity = {
  i: number;
  name?: string;
  removed?: boolean;
};

type State = NativeEntity & {
  capital?: number;
  culture?: number;
  form?: string;
  formName?: string;
  fullName?: string;
  neighbors?: number[];
  provinces?: number[];
  type?: string;
};

type Province = NativeEntity & {
  burg?: number;
  burgs?: number[];
  formName?: string;
  fullName?: string;
  state?: number;
};

type Burg = NativeEntity & {
  capital?: number;
  cell?: number;
  culture?: number;
  port?: number;
  state?: number;
  type?: string;
  x?: number;
  y?: number;
};

type Culture = NativeEntity & {
  code?: string;
  type?: string;
};

type Religion = NativeEntity & {
  culture?: number;
  deity?: string | null;
  form?: string;
  type?: string;
};

type PackedCell = {
  i: number;
  province?: number;
};

type PackedCells = PackedCell[] | { province?: ArrayLike<number> };

export type ArchiveWorldSnapshot = {
  info: {
    mapId?: number | string;
    mapName?: string;
    version?: string;
  };
  pack: {
    burgs: Burg[];
    cells?: PackedCells;
    cultures: Culture[];
    provinces: Province[];
    religions: Religion[];
    states: State[];
  };
};

export type ArchiveExportProfile = {
  id: string;
  includeNeutralCulture: boolean;
  includeNeutralState: boolean;
  includeNoReligion: boolean;
};

export const ARCHIVE_REFERENCE_PROFILE: ArchiveExportProfile = {
  id: "archive-reference-v1",
  includeNeutralCulture: true,
  includeNeutralState: true,
  includeNoReligion: false
};

export type ArchiveExportOptions = {
  profile?: ArchiveExportProfile;
  worldId: string;
};

export type ArchiveExportFile = {
  content: string;
  entityKey?: string;
  path: string;
};

export type ArchiveManifestEntity = {
  contentHash: string;
  name: string;
  path: string;
};

export type ArchiveExportManifest = {
  schemaVersion: number;
  worldId: string;
  worldName: string;
  source: {
    fmGeneratorVersion: string;
    mapId: number | string | null;
  };
  profile: string;
  entities: Record<string, ArchiveManifestEntity>;
};

export type ArchiveExportPlan = {
  files: ArchiveExportFile[];
  manifest: ArchiveExportManifest;
};

type EntityDescriptor = {
  entity: NativeEntity;
  key: string;
  path: string;
  target: string;
  type: ArchiveEntityType;
};

const ENTITY_FOLDERS: Record<ArchiveEntityType, string> = {
  state: "States",
  province: "Provinces",
  burg: "Burgs",
  culture: "Cultures",
  religion: "Religions"
};

const ENTITY_LABELS: Record<ArchiveEntityType, string> = {
  state: "State",
  province: "Province",
  burg: "Burg",
  culture: "Culture",
  religion: "Religion"
};

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

const quoteYaml = (value: string) => JSON.stringify(value);

const escapeLinkLabel = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("]", "\\]");

const displayName = (entity: NativeEntity, type: ArchiveEntityType) =>
  entity.name?.trim() || `${ENTITY_LABELS[type]} ${entity.i}`;

export const sanitizeArchiveFilename = (value: string) => {
  const sanitized = Array.from(value, character =>
    character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? "-" : character
  )
    .join("")
    .replace(/\s+/g, " ")
    .replace(/[ .]+$/g, "")
    .trim();
  const safe = sanitized || "Unnamed";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `${safe}-note` : safe;
};

const getActiveEntities = <T extends NativeEntity>(entities: T[], includeZero: boolean) =>
  entities.filter(entity => entity && !entity.removed && (includeZero || entity.i !== 0));

const buildDescriptors = (
  snapshot: ArchiveWorldSnapshot,
  worldId: string,
  profile: ArchiveExportProfile
): EntityDescriptor[] => {
  const byType: Record<ArchiveEntityType, NativeEntity[]> = {
    state: getActiveEntities(snapshot.pack.states, profile.includeNeutralState),
    province: getActiveEntities(snapshot.pack.provinces, false),
    burg: getActiveEntities(snapshot.pack.burgs, false),
    culture: getActiveEntities(snapshot.pack.cultures, profile.includeNeutralCulture),
    religion: getActiveEntities(snapshot.pack.religions, profile.includeNoReligion)
  };

  const candidates = (Object.keys(byType) as ArchiveEntityType[]).flatMap(type =>
    byType[type].map(entity => {
      const name = displayName(entity, type);
      const stem = sanitizeArchiveFilename(`${name} (Azgaar ${ENTITY_LABELS[type]})`);
      return { entity, name, stem, type };
    })
  );

  const stemCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const normalized = `${candidate.type}/${candidate.stem}`.toLocaleLowerCase();
    stemCounts.set(normalized, (stemCounts.get(normalized) ?? 0) + 1);
  }

  return candidates.map(({ entity, stem, type }) => {
    const normalized = `${type}/${stem}`.toLocaleLowerCase();
    const uniqueStem = stemCounts.get(normalized) === 1 ? stem : `${stem} (#${entity.i})`;
    return {
      entity,
      key: `${worldId}:${type}:${entity.i}`,
      path: `${ENTITY_FOLDERS[type]}/${uniqueStem}.md`,
      target: uniqueStem,
      type
    };
  });
};

const makeLookup = (descriptors: EntityDescriptor[]) => {
  const lookup = new Map<string, EntityDescriptor>();
  for (const descriptor of descriptors) lookup.set(`${descriptor.type}:${descriptor.entity.i}`, descriptor);
  return lookup;
};

const makeLink = (lookup: Map<string, EntityDescriptor>, type: ArchiveEntityType, nativeId: number | undefined) => {
  if (nativeId === undefined) return null;
  const descriptor = lookup.get(`${type}:${nativeId}`);
  if (!descriptor) return null;
  return `[[${descriptor.target}|${escapeLinkLabel(displayName(descriptor.entity, type))}]]`;
};

const renderList = (label: string, values: Array<string | null>) => {
  const present = values.filter((value): value is string => Boolean(value));
  return present.length ? `- **${label}:** ${present.join(", ")}` : null;
};

const renderState = (state: State, lookup: Map<string, EntityDescriptor>) => [
  state.fullName && state.fullName !== state.name ? `- **Full name:** ${state.fullName}` : null,
  state.form ? `- **Government:** ${state.formName || state.form}` : null,
  state.type ? `- **FMG type:** ${state.type}` : null,
  renderList("Capital", [makeLink(lookup, "burg", state.capital)]),
  renderList("Culture", [makeLink(lookup, "culture", state.culture)]),
  renderList(
    "Provinces",
    (state.provinces ?? []).map(id => makeLink(lookup, "province", id))
  ),
  renderList(
    "Neighbors",
    (state.neighbors ?? []).map(id => makeLink(lookup, "state", id))
  )
];

const renderProvince = (province: Province, lookup: Map<string, EntityDescriptor>) => [
  province.fullName && province.fullName !== province.name ? `- **Full name:** ${province.fullName}` : null,
  province.formName ? `- **Administrative form:** ${province.formName}` : null,
  renderList("State", [makeLink(lookup, "state", province.state)]),
  renderList("Capital", [makeLink(lookup, "burg", province.burg)]),
  renderList(
    "Burgs",
    (province.burgs ?? []).map(id => makeLink(lookup, "burg", id))
  )
];

const getProvinceId = (cells: PackedCells | undefined, cellId: number | undefined) => {
  if (!cells || cellId === undefined) return undefined;
  if (Array.isArray(cells)) return cells[cellId]?.province ?? cells.find(cell => cell.i === cellId)?.province;
  return cells.province?.[cellId];
};

const renderBurg = (burg: Burg, snapshot: ArchiveWorldSnapshot, lookup: Map<string, EntityDescriptor>) => {
  const provinceId = getProvinceId(snapshot.pack.cells, burg.cell);
  return [
    renderList("State", [makeLink(lookup, "state", burg.state)]),
    renderList("Province", [makeLink(lookup, "province", provinceId)]),
    renderList("Culture", [makeLink(lookup, "culture", burg.culture)]),
    burg.type ? `- **FMG type:** ${burg.type}` : null,
    burg.capital ? "- **Capital:** Yes" : null,
    burg.port ? "- **Port:** Yes" : null,
    burg.x !== undefined && burg.y !== undefined ? `- **Map coordinates:** ${burg.x}, ${burg.y}` : null
  ];
};

const renderCulture = (culture: Culture) => [
  culture.type ? `- **FMG type:** ${culture.type}` : null,
  culture.code ? `- **Code:** ${culture.code}` : null
];

const renderReligion = (religion: Religion, lookup: Map<string, EntityDescriptor>) => [
  religion.type ? `- **FMG type:** ${religion.type}` : null,
  religion.form ? `- **Form:** ${religion.form}` : null,
  religion.deity ? `- **Deity:** ${religion.deity}` : null,
  renderList("Culture", [makeLink(lookup, "culture", religion.culture)])
];

const renderEntityBody = (
  descriptor: EntityDescriptor,
  snapshot: ArchiveWorldSnapshot,
  lookup: Map<string, EntityDescriptor>
) => {
  switch (descriptor.type) {
    case "state":
      return renderState(descriptor.entity as State, lookup);
    case "province":
      return renderProvince(descriptor.entity as Province, lookup);
    case "burg":
      return renderBurg(descriptor.entity as Burg, snapshot, lookup);
    case "culture":
      return renderCulture(descriptor.entity as Culture);
    case "religion":
      return renderReligion(descriptor.entity as Religion, lookup);
  }
};

const renderEntity = (
  descriptor: EntityDescriptor,
  snapshot: ArchiveWorldSnapshot,
  lookup: Map<string, EntityDescriptor>
) => {
  const name = displayName(descriptor.entity, descriptor.type);
  const details = renderEntityBody(descriptor, snapshot, lookup).filter((line): line is string => Boolean(line));
  return [
    "---",
    `Source_type: ${quoteYaml("Azgaar-generated-reference")}`,
    `Azgaar_key: ${quoteYaml(descriptor.key)}`,
    `Azgaar_schema: ${ARCHIVE_SCHEMA_VERSION}`,
    `Azgaar_native_id: ${descriptor.entity.i}`,
    `Azgaar_entity_type: ${quoteYaml(descriptor.type)}`,
    "---",
    "",
    `# ${name}`,
    "",
    "> [!warning] Generated reference data",
    "> This note is an FMG projection, not automatic Archive canon.",
    ...(details.length ? ["", "## FMG reference", "", ...details] : []),
    ""
  ].join("\n");
};

const hashContent = (content: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const buildArchiveExportPlan = (
  snapshot: ArchiveWorldSnapshot,
  options: ArchiveExportOptions
): ArchiveExportPlan => {
  const worldId = options.worldId.trim();
  if (!worldId) throw new Error("Archive export requires a non-empty worldId");

  const profile = options.profile ?? ARCHIVE_REFERENCE_PROFILE;
  const descriptors = buildDescriptors(snapshot, worldId, profile);
  const lookup = makeLookup(descriptors);
  const entityFiles = descriptors
    .map(descriptor => ({
      content: renderEntity(descriptor, snapshot, lookup),
      entityKey: descriptor.key,
      path: descriptor.path
    }))
    .sort((left, right) => compareText(left.path, right.path));

  const entities: Record<string, ArchiveManifestEntity> = {};
  for (const file of entityFiles) {
    if (!file.entityKey) continue;
    const descriptor = descriptors.find(candidate => candidate.key === file.entityKey);
    if (!descriptor) continue;
    entities[file.entityKey] = {
      contentHash: hashContent(file.content),
      name: displayName(descriptor.entity, descriptor.type),
      path: file.path
    };
  }

  const manifest: ArchiveExportManifest = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    worldId,
    worldName: snapshot.info.mapName?.trim() || "Unnamed world",
    source: {
      fmGeneratorVersion: snapshot.info.version?.trim() || "unknown",
      mapId: snapshot.info.mapId ?? null
    },
    profile: profile.id,
    entities
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;

  return {
    files: [...entityFiles, { content: manifestContent, path: "azgaar-archive-manifest.json" }],
    manifest
  };
};

export const ArchiveExport = {
  buildPlan: buildArchiveExportPlan,
  sanitizeFilename: sanitizeArchiveFilename
};
