import type { CustomLayer, CustomPointEntity, CustomPointLayer } from "../../types/custom-layers";
import {
  ARCHIVE_REFERENCE_SAFE_OPTIONS,
  type ArchiveSimulationOptions,
  normalizeArchiveSimulationOptions
} from "./archive-export-profile";

export const ARCHIVE_SCHEMA_VERSION = 3;

export type ArchiveEntityType = "state" | "province" | "burg" | "culture" | "religion";

type NativeEntity = {
  i: number;
  name?: string;
  removed?: boolean;
};

type State = NativeEntity & {
  alert?: number;
  capital?: number;
  culture?: number;
  diplomacy?: string[];
  form?: string;
  formName?: string;
  fullName?: string;
  military?: Regiment[];
  neighbors?: number[];
  pollTax?: number;
  provinces?: number[];
  rural?: number;
  salesTax?: number;
  treasury?: number;
  type?: string;
  urban?: number;
};

type Province = NativeEntity & {
  burg?: number;
  burgs?: number[];
  formName?: string;
  fullName?: string;
  rural?: number;
  state?: number;
  urban?: number;
};

type Burg = NativeEntity & {
  capital?: number;
  cell?: number;
  citadel?: number;
  culture?: number;
  market?: number;
  plaza?: number;
  population?: number;
  port?: number;
  product?: number;
  production?: Array<Record<string, unknown>>;
  shanty?: number;
  state?: number;
  temple?: number;
  treasury?: number;
  type?: string;
  walls?: number;
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

type Regiment = {
  i: number;
  name?: string;
  t?: number;
  type?: string;
  u?: Record<string, number>;
};

type Good = {
  i: number;
  name?: string;
  tags?: string[];
  unit?: string;
  value?: number;
};

type Market = {
  i: number;
  centerBurgId?: number;
  goods?: Record<number, { price?: number; stock?: number }>;
  name?: string;
};

type Deal = {
  i: number;
  buyer?: number;
  buyerType?: "burg" | "market";
  good?: number;
  price?: number;
  seller?: number;
  sellerType?: "burg" | "market";
  tax?: number;
  units?: number;
};

export type ArchiveWorldSnapshot = {
  info: {
    mapId?: number | string;
    mapName?: string;
    populationRate?: number;
    urbanization?: number;
    version?: string;
  };
  pack: {
    burgs: Burg[];
    cells?: PackedCells;
    cultures: Culture[];
    deals?: Deal[];
    goods?: Good[];
    markets?: Market[];
    provinces: Province[];
    religions: Religion[];
    states: State[];
    customLayers?: CustomLayer[];
  };
};

export type ArchiveExportProfile = {
  id: string;
  includeNeutralCulture: boolean;
  includeNeutralState: boolean;
  includeNoReligion: boolean;
  simulation: ArchiveSimulationOptions;
};

export const ARCHIVE_REFERENCE_PROFILE: ArchiveExportProfile = {
  id: "archive-reference-v2",
  includeNeutralCulture: true,
  includeNeutralState: true,
  includeNoReligion: false,
  simulation: ARCHIVE_REFERENCE_SAFE_OPTIONS
};

export const createArchiveExportProfile = (simulation: ArchiveSimulationOptions): ArchiveExportProfile => ({
  ...ARCHIVE_REFERENCE_PROFILE,
  simulation: normalizeArchiveSimulationOptions(simulation)
});

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
  simulation: {
    categories: string[];
    freshness: "not-tracked";
  };
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
  renderList("Polity", [makeLink(lookup, "state", province.state)]),
  renderList("Capital", [makeLink(lookup, "burg", province.burg)]),
  renderList(
    "Settlements",
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
  const features = [
    burg.capital ? "Capital" : null,
    burg.port ? "Port" : null,
    burg.citadel ? "Citadel" : null,
    burg.walls ? "Walls" : null,
    burg.plaza ? "Market center" : null,
    burg.temple ? "Religious center" : null,
    burg.shanty ? "Shanty town" : null
  ].filter((feature): feature is string => Boolean(feature));
  return [
    renderList("Polity", [makeLink(lookup, "state", burg.state)]),
    renderList("Province", [makeLink(lookup, "province", provinceId)]),
    renderList("Culture", [makeLink(lookup, "culture", burg.culture)]),
    burg.type ? `- **FMG type:** ${burg.type}` : null,
    features.length ? `- **Features:** ${features.join(", ")}` : null,
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

const formatNumber = (value: number | undefined) =>
  Number.isFinite(value) ? String(Math.round(value! * 100) / 100) : null;

const estimatePopulation = (points: number | undefined, snapshot: ArchiveWorldSnapshot, urban: boolean) => {
  if (!Number.isFinite(points)) return null;
  const populationRate = snapshot.info.populationRate ?? 1000;
  const urbanization = urban ? (snapshot.info.urbanization ?? 1) : 1;
  return String(Math.round(points! * populationRate * urbanization));
};

const renderPopulation = (descriptor: EntityDescriptor, snapshot: ArchiveWorldSnapshot) => {
  if (descriptor.type === "burg") {
    const population = estimatePopulation((descriptor.entity as Burg).population, snapshot, true);
    return population ? [`- **Estimated population:** ${population} people`] : [];
  }
  if (descriptor.type !== "state" && descriptor.type !== "province") return [];
  const entity = descriptor.entity as State | Province;
  const rural = estimatePopulation(entity.rural, snapshot, false);
  const urban = estimatePopulation(entity.urban, snapshot, true);
  return [
    rural ? `- **Estimated rural population:** ${rural} people` : null,
    urban ? `- **Estimated urban population:** ${urban} people` : null
  ].filter((line): line is string => Boolean(line));
};

const renderEconomy = (descriptor: EntityDescriptor) => {
  if (descriptor.type === "state") {
    const state = descriptor.entity as State;
    return [
      Number.isFinite(state.salesTax) ? `- **Sales tax:** ${formatNumber(state.salesTax! * 100)}%` : null,
      Number.isFinite(state.pollTax) ? `- **Poll tax per population point:** ${formatNumber(state.pollTax)}` : null,
      Number.isFinite(state.treasury) ? `- **Treasury:** ${formatNumber(state.treasury)}` : null
    ].filter((line): line is string => Boolean(line));
  }
  if (descriptor.type === "burg") {
    const burg = descriptor.entity as Burg;
    return [
      burg.market ? `- **Market ID:** ${burg.market}` : null,
      Number.isFinite(burg.product) ? `- **Gross product:** ${formatNumber(burg.product)}` : null,
      Number.isFinite(burg.treasury) ? `- **Treasury:** ${formatNumber(burg.treasury)}` : null
    ].filter((line): line is string => Boolean(line));
  }
  return [];
};

const renderMilitary = (descriptor: EntityDescriptor) => {
  if (descriptor.type !== "state") return [];
  const state = descriptor.entity as State;
  const lines = [Number.isFinite(state.alert) ? `- **War alert:** ${formatNumber(state.alert)}` : null].filter(
    (line): line is string => Boolean(line)
  );
  for (const regiment of state.military ?? []) {
    const units = Object.entries(regiment.u ?? {})
      .filter(([, count]) => count)
      .map(([unit, count]) => `${unit}: ${count}`)
      .join(", ");
    lines.push(
      `- **Formation ${regiment.i}:** ${regiment.name || "Unnamed"}${regiment.type ? ` (${regiment.type})` : ""}${Number.isFinite(regiment.t) ? `; personnel: ${formatNumber(regiment.t)}` : ""}${units ? `; units: ${units}` : ""}`
    );
  }
  return lines;
};

const renderDiplomacy = (descriptor: EntityDescriptor, lookup: Map<string, EntityDescriptor>) => {
  if (descriptor.type !== "state") return [];
  const state = descriptor.entity as State;
  return (state.diplomacy ?? [])
    .map((relation, stateId) => {
      if (!stateId || stateId === state.i || !relation || relation === "x") return null;
      const polity = makeLink(lookup, "state", stateId);
      return polity ? `- **${relation}:** ${polity}` : null;
    })
    .filter((line): line is string => Boolean(line));
};

const renderSimulationBody = (
  descriptor: EntityDescriptor,
  snapshot: ArchiveWorldSnapshot,
  lookup: Map<string, EntityDescriptor>,
  profile: ArchiveExportProfile
) => [
  ...(profile.simulation.population ? renderPopulation(descriptor, snapshot) : []),
  ...(profile.simulation.economy ? renderEconomy(descriptor) : []),
  ...(profile.simulation.military ? renderMilitary(descriptor) : []),
  ...(profile.simulation.diplomacy ? renderDiplomacy(descriptor, lookup) : [])
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
  lookup: Map<string, EntityDescriptor>,
  profile: ArchiveExportProfile
) => {
  const name = displayName(descriptor.entity, descriptor.type);
  const details = renderEntityBody(descriptor, snapshot, lookup).filter((line): line is string => Boolean(line));
  const simulation = renderSimulationBody(descriptor, snapshot, lookup, profile);
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
    ...(simulation.length
      ? [
          "",
          "## Generated simulation snapshot",
          "",
          "> [!caution] Unapproved generated simulation",
          "> These values are reference-only. Freshness is not tracked; regenerate the relevant FMG systems before relying on them.",
          "",
          ...simulation
        ]
      : []),
    ""
  ].join("\n");
};

const customAuthorityLabel = (authority: CustomPointEntity["authority"]): string => {
  if (authority === "generated") return "FMG generated";
  if (authority === "archive") return "Archive sourced (not synchronized)";
  return "Azgaar authored";
};

const renderCustomPoint = (layer: CustomPointLayer, entity: CustomPointEntity, key: string): string => {
  const fields = layer.fields.flatMap(field => {
    const value = entity.values[field.id];
    if (value === undefined || value === "") return [];
    return [`- **${field.name}:** ${String(value)}`];
  });
  return [
    "---",
    `Source_type: ${quoteYaml("Azgaar-map-reference")}`,
    `Azgaar_key: ${quoteYaml(key)}`,
    `Azgaar_schema: ${ARCHIVE_SCHEMA_VERSION}`,
    `Azgaar_native_id: ${quoteYaml(entity.id)}`,
    `Azgaar_entity_type: ${quoteYaml("custom-point")}`,
    `Azgaar_layer_id: ${quoteYaml(layer.id)}`,
    `Azgaar_layer: ${quoteYaml(layer.name)}`,
    `Azgaar_authority: ${quoteYaml(entity.authority)}`,
    "---",
    "",
    `# ${entity.name}`,
    "",
    "> [!warning] Map reference data",
    "> This item is maintained in the map and is not automatically promoted to Archive canon.",
    "",
    "## Map reference",
    "",
    `- **Layer:** ${layer.name}`,
    `- **Authority:** ${customAuthorityLabel(entity.authority)}`,
    `- **Map coordinates:** ${entity.x}, ${entity.y}`,
    ...fields,
    ...(entity.notes.trim() ? ["", "## Notes", "", entity.notes.trim()] : []),
    ""
  ].join("\n");
};

const buildCustomPointFiles = (snapshot: ArchiveWorldSnapshot, worldId: string): ArchiveExportFile[] => {
  const files: ArchiveExportFile[] = [];
  for (const layer of snapshot.pack.customLayers ?? []) {
    if (!layer.archiveExport) continue;
    const stems = layer.entities.map(entity =>
      sanitizeArchiveFilename(`${entity.name || `Unnamed ${layer.name}`} (Azgaar ${layer.name})`)
    );
    const counts = new Map<string, number>();
    for (const stem of stems) counts.set(stem.toLocaleLowerCase(), (counts.get(stem.toLocaleLowerCase()) ?? 0) + 1);
    layer.entities.forEach((entity, index) => {
      const stem = stems[index];
      const uniqueStem = counts.get(stem.toLocaleLowerCase()) === 1 ? stem : `${stem} (${entity.id.slice(0, 8)})`;
      const key = `${worldId}:custom-point:${layer.id}:${entity.id}`;
      files.push({
        content: renderCustomPoint(layer, entity, key),
        entityKey: key,
        path: `Custom Layers/${sanitizeArchiveFilename(layer.pluralName)}/${uniqueStem}.md`
      });
    });
  }
  return files;
};

const escapeTableCell = (value: unknown) =>
  String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll(/\r?\n/g, " ");

const renderEconomySnapshot = (
  snapshot: ArchiveWorldSnapshot,
  lookup: Map<string, EntityDescriptor>,
  worldId: string
): ArchiveExportFile => {
  const goods = [...(snapshot.pack.goods ?? [])].filter(good => good && good.i >= 0).sort((a, b) => a.i - b.i);
  const markets = [...(snapshot.pack.markets ?? [])].filter(Boolean).sort((a, b) => a.i - b.i);
  const deals = [...(snapshot.pack.deals ?? [])].filter(Boolean).sort((a, b) => a.i - b.i);
  const goodNames = new Map(goods.map(good => [good.i, good.name || `Good ${good.i}`]));
  const marketNames = new Map(markets.map(market => [market.i, market.name || `Market ${market.i}`]));
  const endpoint = (type: "burg" | "market" | undefined, id: number | undefined) => {
    if (id === undefined) return "Unknown";
    if (type === "burg") return makeLink(lookup, "burg", id) || `Settlement ${id}`;
    return marketNames.get(id) || `Market ${id}`;
  };
  const goodsRows = goods.map(
    good =>
      `| ${good.i} | ${escapeTableCell(good.name || `Good ${good.i}`)} | ${escapeTableCell(good.unit)} | ${formatNumber(good.value) || ""} | ${escapeTableCell((good.tags ?? []).join(", "))} |`
  );
  const marketRows = markets.map(market => {
    const center = makeLink(lookup, "burg", market.centerBurgId) || market.centerBurgId || "";
    return `| ${market.i} | ${escapeTableCell(market.name || `Market ${market.i}`)} | ${center} |`;
  });
  const inventoryRows = markets.flatMap(market =>
    Object.entries(market.goods ?? {})
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(
        ([goodId, record]) =>
          `| ${market.i} | ${escapeTableCell(goodNames.get(Number(goodId)) || `Good ${goodId}`)} | ${formatNumber(record.stock) || ""} | ${formatNumber(record.price) || ""} |`
      )
  );
  const dealRows = deals.map(
    deal =>
      `| ${deal.i} | ${endpoint(deal.sellerType, deal.seller)} | ${endpoint(deal.buyerType, deal.buyer)} | ${escapeTableCell(goodNames.get(deal.good ?? -1) || `Good ${deal.good ?? "?"}`)} | ${formatNumber(deal.units) || ""} | ${formatNumber(deal.price) || ""} | ${formatNumber(deal.tax) || ""} |`
  );
  const section = (title: string, header: string[], rows: string[]) => [
    `## ${title}`,
    "",
    ...header,
    ...(rows.length ? rows : ["_No generated records are currently available._"]),
    ""
  ];
  const key = `${worldId}:snapshot:economy`;
  const content = [
    "---",
    `Source_type: ${quoteYaml("Azgaar-generated-simulation-reference")}`,
    `Azgaar_key: ${quoteYaml(key)}`,
    `Azgaar_schema: ${ARCHIVE_SCHEMA_VERSION}`,
    `Azgaar_entity_type: ${quoteYaml("simulation-snapshot")}`,
    `Azgaar_simulation_category: ${quoteYaml("economy")}`,
    `Azgaar_simulation_freshness: ${quoteYaml("not-tracked")}`,
    "---",
    "",
    "# Economy Simulation Snapshot",
    "",
    "> [!caution] Unapproved generated simulation",
    "> Goods, markets, inventories, and trade deals are reference-only. Regenerate Production before relying on them.",
    "",
    ...section("Goods", ["| ID | Good | Unit | Base value | Tags |", "| ---: | --- | --- | ---: | --- |"], goodsRows),
    ...section("Markets", ["| ID | Market | Center settlement |", "| ---: | --- | --- |"], marketRows),
    ...section(
      "Market inventory",
      ["| Market ID | Good | Stock | Price |", "| ---: | --- | ---: | ---: |"],
      inventoryRows
    ),
    ...section(
      "Trade deals",
      ["| ID | Seller | Buyer | Good | Units | Price | Tax |", "| ---: | --- | --- | --- | ---: | ---: | ---: |"],
      dealRows
    )
  ].join("\n");
  return { content, entityKey: key, path: "Simulation/Economy Snapshot.md" };
};

export const hashArchiveContent = (content: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const YAML_STRING_KEYS = new Set([
  "Source_type",
  "Azgaar_key",
  "Azgaar_entity_type",
  "Azgaar_layer_id",
  "Azgaar_layer",
  "Azgaar_authority",
  "Azgaar_simulation_category",
  "Azgaar_simulation_freshness"
]);

/** Restore the harmless quote removal performed by Obsidian's Properties writer. */
const restoreManagedFrontmatterQuotes = (content: string): string => {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") return lines.join("\n");

  for (let index = 1; index < lines.length; index++) {
    if (lines[index] === "---") break;
    const match = lines[index].match(/^([A-Za-z_]+): (.+)$/);
    if (!match) continue;
    const [, key, value] = match;
    const isStringNativeId = key === "Azgaar_native_id" && !/^-?\d+(?:\.\d+)?$/.test(value);
    if ((!YAML_STRING_KEYS.has(key) && !isStringNativeId) || value.startsWith('"')) continue;
    lines[index] = `${key}: ${JSON.stringify(value)}`;
  }

  return lines.join("\n");
};

export const matchesArchiveContentHash = (content: string, expectedHash: string): boolean =>
  hashArchiveContent(content) === expectedHash ||
  hashArchiveContent(restoreManagedFrontmatterQuotes(content)) === expectedHash;

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
      content: renderEntity(descriptor, snapshot, lookup, profile),
      entityKey: descriptor.key,
      path: descriptor.path
    }))
    .sort((left, right) => compareText(left.path, right.path));
  const snapshotFiles = profile.simulation.economy ? [renderEconomySnapshot(snapshot, lookup, worldId)] : [];
  const customPointFiles = buildCustomPointFiles(snapshot, worldId);
  const generatedFiles = [...entityFiles, ...customPointFiles, ...snapshotFiles].sort((left, right) =>
    compareText(left.path, right.path)
  );

  const entities: Record<string, ArchiveManifestEntity> = {};
  for (const file of entityFiles) {
    if (!file.entityKey) continue;
    const descriptor = descriptors.find(candidate => candidate.key === file.entityKey);
    if (!descriptor) continue;
    entities[file.entityKey] = {
      contentHash: hashArchiveContent(file.content),
      name: displayName(descriptor.entity, descriptor.type),
      path: file.path
    };
  }
  for (const file of snapshotFiles) {
    entities[file.entityKey!] = {
      contentHash: hashArchiveContent(file.content),
      name: "Economy Simulation Snapshot",
      path: file.path
    };
  }
  for (const file of customPointFiles) {
    const layer = snapshot.pack.customLayers?.find(candidate => file.entityKey?.includes(`:${candidate.id}:`));
    const entity = layer?.entities.find(candidate => file.entityKey?.endsWith(`:${candidate.id}`));
    if (!file.entityKey || !layer || !entity) continue;
    entities[file.entityKey] = {
      contentHash: hashArchiveContent(file.content),
      name: entity.name,
      path: file.path
    };
  }

  const simulationCategories = (Object.keys(profile.simulation) as Array<keyof ArchiveSimulationOptions>).filter(
    category => profile.simulation[category]
  );

  const manifest: ArchiveExportManifest = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    worldId,
    worldName: snapshot.info.mapName?.trim() || "Unnamed world",
    source: {
      fmGeneratorVersion: snapshot.info.version?.trim() || "unknown",
      mapId: snapshot.info.mapId ?? null
    },
    profile: profile.id,
    simulation: {
      categories: simulationCategories,
      freshness: "not-tracked"
    },
    entities
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;

  return {
    files: [...generatedFiles, { content: manifestContent, path: "azgaar-archive-manifest.json" }],
    manifest
  };
};

export const ArchiveExport = {
  buildPlan: buildArchiveExportPlan,
  sanitizeFilename: sanitizeArchiveFilename
};
