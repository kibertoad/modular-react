import type {
  CatalogConfig,
  CatalogEntry,
  CatalogExtensionFacet,
  CatalogExtensionTab,
  CatalogExtensions,
  CatalogJourneyEntry,
  CatalogModuleEntry,
} from "../config/types.js";
import type {
  CatalogExtensionsMeta,
  CatalogFacets,
  CatalogManifest,
  CatalogModel,
  CustomFacet,
  CustomFacetValues,
  ModuleEntryUsage,
  ModuleExitUsage,
  ResolvedExtensionTab,
  SerializedJourneyEntry,
  SerializedModuleEntry,
  TransitionDestination,
} from "./types.js";
import { CATALOG_SCHEMA_VERSION } from "./version.js";

const STATUS_VALUES = ["experimental", "stable", "deprecated"] as const;
type Status = (typeof STATUS_VALUES)[number];

const RESERVED_FACET_KEYS = new Set(["query", "team", "domain", "status", "tag"]);
const FACET_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Fail at build time on extension misconfiguration that would otherwise
 * silently misbehave: duplicate ids/keys (one wins, the other vanishes),
 * collisions with reserved URL search-param keys, and facet keys that don't
 * survive a roundtrip through the `?c.<key>=<value>` URL convention.
 */
function validateExtensions(ext: CatalogExtensions): void {
  const errors: string[] = [];

  const moduleTabIds = new Set<string>();
  for (const tab of ext.moduleDetailTabs ?? []) {
    if (moduleTabIds.has(tab.id)) {
      errors.push(`extensions.moduleDetailTabs has duplicate id "${tab.id}".`);
    }
    moduleTabIds.add(tab.id);
  }

  const journeyTabIds = new Set<string>();
  for (const tab of ext.journeyDetailTabs ?? []) {
    if (journeyTabIds.has(tab.id)) {
      errors.push(`extensions.journeyDetailTabs has duplicate id "${tab.id}".`);
    }
    journeyTabIds.add(tab.id);
  }

  const facetKeys = new Set<string>();
  for (const facet of ext.facets ?? []) {
    if (!FACET_KEY_PATTERN.test(facet.key)) {
      errors.push(
        `extensions.facets key "${facet.key}" must match /^[a-zA-Z0-9_-]+$/ ` +
          `(used as a URL search-param suffix).`,
      );
    }
    if (RESERVED_FACET_KEYS.has(facet.key)) {
      errors.push(
        `extensions.facets key "${facet.key}" collides with a built-in filter ` +
          `(${Array.from(RESERVED_FACET_KEYS).join(", ")}).`,
      );
    }
    if (facetKeys.has(facet.key)) {
      errors.push(`extensions.facets has duplicate key "${facet.key}".`);
    }
    facetKeys.add(facet.key);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid catalog extensions config:\n  - ${errors.join("\n  - ")}`);
  }
}

/**
 * Convert a list of harvested entries into the JSON-safe `CatalogModel` the
 * SPA reads at boot. Pre-computes facets and the journeys-by-module index
 * so the SPA never has to scan the full set on render.
 *
 * Extensions (when provided) are also resolved here: facet `source`
 * functions and tab `url`/`render` functions are evaluated once per entry
 * and the results are baked into the serialized output. Extension code
 * never reaches the SPA.
 *
 * Throws if duplicate ids are seen within a single kind — duplicates would
 * silently shadow each other in the SPA, which is worse than a build-time
 * failure.
 */
export function buildCatalogModel(
  entries: readonly CatalogEntry[],
  config: { readonly title?: string; readonly extensions?: CatalogExtensions },
): CatalogModel {
  const ext = config.extensions;
  if (ext) validateExtensions(ext);
  const moduleTabs = ext?.moduleDetailTabs ?? [];
  const journeyTabs = ext?.journeyDetailTabs ?? [];
  const facetDefs = ext?.facets ?? [];

  // Build per-facet value buckets as we walk entries — cheaper than a second
  // pass after serialization.
  const facetBuckets = new Map<string, Set<string>>();
  for (const f of facetDefs) facetBuckets.set(f.key, new Set());

  const modules: SerializedModuleEntry[] = [];
  const journeys: SerializedJourneyEntry[] = [];
  const seenModuleIds = new Set<string>();
  const seenJourneyIds = new Set<string>();
  const duplicates: string[] = [];

  for (const entry of entries) {
    const tabs =
      entry.kind === "module" ? resolveTabs(entry, moduleTabs) : resolveTabs(entry, journeyTabs);
    const customFacets = resolveCustomFacets(entry, facetDefs, facetBuckets);

    if (entry.kind === "module") {
      if (seenModuleIds.has(entry.id)) {
        duplicates.push(`module:${entry.id}`);
        continue;
      }
      seenModuleIds.add(entry.id);
      modules.push(serializeModule(entry, tabs, customFacets));
    } else {
      if (seenJourneyIds.has(entry.id)) {
        duplicates.push(`journey:${entry.id}`);
        continue;
      }
      seenJourneyIds.add(entry.id);
      journeys.push(serializeJourney(entry, tabs, customFacets));
    }
  }

  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate descriptor ids in catalog: ${duplicates.join(", ")}. ` +
        `Each module / journey id must be unique across all scan roots.`,
    );
  }

  modules.sort((a, b) => a.id.localeCompare(b.id));
  journeys.sort((a, b) => a.id.localeCompare(b.id));

  const facets = computeFacets(modules, journeys, facetDefs, facetBuckets);
  const extensionsMeta = buildExtensionsMeta(ext);
  const journeyEntries = entries.filter((e): e is CatalogJourneyEntry => e.kind === "journey");
  const { entryUsage, exitUsage } = computeModuleUsage(journeyEntries);

  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    title: config.title ?? "Catalog",
    builtAt: new Date().toISOString(),
    modules,
    journeys,
    facets,
    journeysByModule: computeJourneysByModule(journeys),
    journeysByInvokedJourney: computeJourneysByInvokedJourney(journeys),
    moduleEntryUsage: entryUsage,
    moduleExitUsage: exitUsage,
    ...(extensionsMeta && { extensions: extensionsMeta }),
  };
}

/**
 * Build the lighter-weight manifest emitted alongside `catalog.json`.
 */
export function buildManifest(
  model: CatalogModel,
  config: CatalogConfig,
  catalogPackageVersion: string,
): CatalogManifest {
  return {
    schemaVersion: model.schemaVersion,
    title: model.title,
    builtAt: model.builtAt,
    catalogPackageVersion,
    roots: config.roots.map((r) => ({ name: r.name, pattern: r.pattern })),
    counts: { modules: model.modules.length, journeys: model.journeys.length },
  };
}

function serializeModule(
  entry: CatalogModuleEntry,
  tabs: readonly ResolvedExtensionTab[],
  customFacets: CustomFacetValues,
): SerializedModuleEntry {
  // Drop `descriptor` — the raw descriptor reference is for in-process
  // enrich hooks only and would not survive JSON.stringify (functions, etc).
  const { descriptor: _descriptor, kind, ...rest } = entry;
  void _descriptor;
  const out: SerializedModuleEntry = { kind, ...rest };
  return attachExtensions(out, tabs, customFacets);
}

function serializeJourney(
  entry: CatalogJourneyEntry,
  tabs: readonly ResolvedExtensionTab[],
  customFacets: CustomFacetValues,
): SerializedJourneyEntry {
  const { descriptor: _descriptor, kind, ...rest } = entry;
  void _descriptor;
  const out: SerializedJourneyEntry = { kind, ...rest };
  return attachExtensions(out, tabs, customFacets);
}

function attachExtensions<T extends SerializedModuleEntry | SerializedJourneyEntry>(
  base: T,
  tabs: readonly ResolvedExtensionTab[],
  customFacets: CustomFacetValues,
): T {
  // Only attach if non-empty so old fixtures and the on-disk JSON stay clean.
  const out: T = { ...base };
  if (tabs.length > 0) (out as { extensionTabs?: typeof tabs }).extensionTabs = tabs;
  if (Object.keys(customFacets).length > 0) {
    (out as { customFacets?: CustomFacetValues }).customFacets = customFacets;
  }
  return out;
}

function resolveTabs(
  entry: CatalogEntry,
  defs: readonly CatalogExtensionTab[],
): ResolvedExtensionTab[] {
  const out: ResolvedExtensionTab[] = [];
  for (const def of defs) {
    if (def.url && def.render) {
      throw new Error(`Extension tab "${def.id}" declares both \`url\` and \`render\` — pick one.`);
    }
    if (def.url) {
      const url = def.url(entry);
      if (typeof url === "string" && url.length > 0) {
        out.push({ id: def.id, label: def.label, url });
      }
    } else if (def.render) {
      const html = def.render(entry);
      if (typeof html === "string" && html.length > 0) {
        out.push({ id: def.id, label: def.label, html });
      }
    } else {
      throw new Error(`Extension tab "${def.id}" must declare either \`url\` or \`render\`.`);
    }
  }
  return out;
}

function resolveCustomFacets(
  entry: CatalogEntry,
  defs: readonly CatalogExtensionFacet[],
  buckets: Map<string, Set<string>>,
): CustomFacetValues {
  const out: Record<string, readonly string[]> = {};
  for (const def of defs) {
    const raw = def.source(entry);
    const rawValues = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
    const values = rawValues.filter((v): v is string => typeof v === "string" && v.length > 0);
    if (values.length === 0) continue;
    out[def.key] = values;
    const bucket = buckets.get(def.key)!;
    for (const v of values) bucket.add(v);
  }
  return out;
}

function computeFacets(
  modules: readonly SerializedModuleEntry[],
  journeys: readonly SerializedJourneyEntry[],
  facetDefs: readonly CatalogExtensionFacet[],
  buckets: Map<string, Set<string>>,
): CatalogFacets {
  const teams = new Set<string>();
  const domains = new Set<string>();
  const tags = new Set<string>();
  const statuses = new Set<Status>();

  for (const entry of [...modules, ...journeys]) {
    const m = entry.meta;
    if (m.ownerTeam) teams.add(m.ownerTeam);
    if (m.domain) domains.add(m.domain);
    if (m.tags) for (const tag of m.tags) tags.add(tag);
    if (m.status && (STATUS_VALUES as readonly string[]).includes(m.status)) {
      statuses.add(m.status);
    }
  }

  const custom: CustomFacet[] = facetDefs.map((def) => ({
    key: def.key,
    label: def.label,
    values: Array.from(buckets.get(def.key) ?? []).sort(),
  }));

  return {
    teams: Array.from(teams).sort(),
    domains: Array.from(domains).sort(),
    tags: Array.from(tags).sort(),
    statuses: STATUS_VALUES.filter((s) => statuses.has(s)),
    ...(custom.length > 0 && { custom }),
  };
}

function buildExtensionsMeta(
  ext: CatalogExtensions | undefined,
): CatalogExtensionsMeta | undefined {
  if (!ext) return undefined;
  const moduleDetailTabs = (ext.moduleDetailTabs ?? []).map((t) => ({
    id: t.id,
    label: t.label,
  }));
  const journeyDetailTabs = (ext.journeyDetailTabs ?? []).map((t) => ({
    id: t.id,
    label: t.label,
  }));
  if (moduleDetailTabs.length === 0 && journeyDetailTabs.length === 0) {
    return undefined;
  }
  return {
    ...(moduleDetailTabs.length > 0 && { moduleDetailTabs }),
    ...(journeyDetailTabs.length > 0 && { journeyDetailTabs }),
  };
}

function computeJourneysByModule(
  journeys: readonly SerializedJourneyEntry[],
): Readonly<Record<string, readonly string[]>> {
  const byModule: Record<string, string[]> = {};
  for (const journey of journeys) {
    for (const moduleId of journey.modulesUsed) {
      (byModule[moduleId] ??= []).push(journey.id);
    }
  }
  for (const ids of Object.values(byModule)) ids.sort();
  return byModule;
}

function computeJourneysByInvokedJourney(
  journeys: readonly SerializedJourneyEntry[],
): Readonly<Record<string, readonly string[]>> {
  const byInvoked: Record<string, string[]> = {};
  for (const journey of journeys) {
    for (const invokedId of journey.invokesJourneyIds) {
      (byInvoked[invokedId] ??= []).push(journey.id);
    }
  }
  for (const ids of Object.values(byInvoked)) ids.sort();
  return byInvoked;
}

function computeModuleUsage(journeys: readonly CatalogJourneyEntry[]): {
  entryUsage: Readonly<Record<string, Readonly<Record<string, readonly ModuleEntryUsage[]>>>>;
  exitUsage: Readonly<Record<string, Readonly<Record<string, readonly ModuleExitUsage[]>>>>;
} {
  const entryUsage: Record<string, Record<string, ModuleEntryUsage[]>> = {};
  const exitUsage: Record<string, Record<string, ModuleExitUsage[]>> = {};

  // Stable iteration: pre-sort journeys by id so the emitted lists are
  // deterministic regardless of harvest order.
  const sorted = [...journeys].sort((a, b) => a.id.localeCompare(b.id));

  for (const journey of sorted) {
    for (const [moduleId, byEntry] of Object.entries(journey.transitionShape)) {
      const moduleEntries = (entryUsage[moduleId] ??= {});
      const moduleExits = (exitUsage[moduleId] ??= {});

      for (const [entryName, exitNames] of Object.entries(byEntry)) {
        (moduleEntries[entryName] ??= []).push({
          journeyId: journey.id,
          handledExits: [...exitNames].sort(),
        });

        for (const exitName of exitNames) {
          const outcome = journey.transitionDestinations[moduleId]?.[entryName]?.[exitName];
          const usage: ModuleExitUsage = buildExitUsage(journey.id, entryName, outcome);
          (moduleExits[exitName] ??= []).push(usage);
        }
      }
    }
  }

  return { entryUsage, exitUsage };
}

function buildExitUsage(
  journeyId: string,
  fromEntry: string,
  outcome:
    | {
        readonly nexts: readonly { readonly module: string; readonly entry?: string }[];
        readonly aborts: boolean;
        readonly completes: boolean;
      }
    | undefined,
): ModuleExitUsage {
  if (!outcome) return { journeyId, fromEntry };
  const out: {
    journeyId: string;
    fromEntry: string;
    destinations?: readonly TransitionDestination[];
    aborts?: boolean;
    completes?: boolean;
  } = { journeyId, fromEntry };
  if (outcome.nexts.length > 0) {
    out.destinations = outcome.nexts.map((n) =>
      n.entry !== undefined ? { module: n.module, entry: n.entry } : { module: n.module },
    );
  }
  if (outcome.aborts) out.aborts = true;
  if (outcome.completes) out.completes = true;
  return out;
}
