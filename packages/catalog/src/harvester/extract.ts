import type { AnyModuleDescriptor, CatalogMeta } from "@modular-react/core";
import type { CatalogJourneyEntry, CatalogModuleEntry } from "../config/types.js";
import type { JourneyShape } from "./detect.js";

const CATALOG_META_KEYS = new Set([
  "name",
  "description",
  "ownerTeam",
  "domain",
  "tags",
  "status",
  "since",
  "links",
  "screenshots",
]);

/**
 * Split a descriptor's `meta` bag into the officially-supported
 * {@link CatalogMeta} subset plus an `extraMeta` record of every other key.
 * The catalog SPA renders both: the recognized keys with rich UI, the
 * remainder under a generic "Other metadata" expander.
 */
function partitionMeta(raw: Readonly<Record<string, unknown>> | undefined): {
  meta: CatalogMeta;
  extraMeta: Readonly<Record<string, unknown>>;
} {
  if (!raw) return { meta: {}, extraMeta: {} };
  const meta: Record<string, unknown> = {};
  const extraMeta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (CATALOG_META_KEYS.has(key)) {
      meta[key] = value;
    } else {
      extraMeta[key] = value;
    }
  }
  return { meta: meta as CatalogMeta, extraMeta };
}

/**
 * Convert a raw {@link AnyModuleDescriptor} into a {@link CatalogModuleEntry}
 * suitable for emission and post-processing. Descriptor shape inspection is
 * read-only — no fields are mutated.
 */
export function extractModuleEntry(
  descriptor: AnyModuleDescriptor,
  sourcePath: string,
  rootName: string,
): CatalogModuleEntry {
  const { meta, extraMeta } = partitionMeta(descriptor.meta);

  const slotKeys = new Set<string>();
  if (descriptor.slots) {
    for (const k of Object.keys(descriptor.slots)) slotKeys.add(k);
  }
  // dynamicSlots is a function — inspecting its keys requires invoking it
  // with deps, which we can't safely do here. Skip.

  const navigationLabels = (descriptor.navigation ?? [])
    .map((n) => (typeof n.label === "string" ? n.label : null))
    .filter((label): label is string => label !== null);

  const requires = (descriptor.requires ?? []).map((k) => String(k));
  const optionalRequires = (descriptor.optionalRequires ?? []).map((k) => String(k));

  const entryPointNames = descriptor.entryPoints ? Object.keys(descriptor.entryPoints) : [];
  const exitPointNames = descriptor.exitPoints ? Object.keys(descriptor.exitPoints) : [];

  const startsJourneyIds = (descriptor.startsJourneys ?? [])
    .map((handle) => (typeof handle?.id === "string" ? handle.id : null))
    .filter((id): id is string => id !== null)
    .sort();

  return {
    kind: "module",
    id: descriptor.id,
    version: descriptor.version,
    sourcePath,
    rootName,
    meta,
    extraMeta,
    slotKeys: Array.from(slotKeys).sort(),
    hasRoutes: typeof descriptor.createRoutes === "function",
    hasComponent: descriptor.component !== undefined,
    requires,
    optionalRequires,
    entryPointNames,
    exitPointNames,
    navigationLabels,
    startsJourneyIds,
    descriptor,
  };
}

/**
 * Convert a raw {@link JourneyShape} into a {@link CatalogJourneyEntry}.
 * Module references come from the keys of `transitions`, which are module
 * ids by construction of the journey definition shape. The same walk also
 * captures `transitionShape` — a JSON-safe `[moduleId][entryName] → [exitName...]`
 * skeleton the build step uses to aggregate per-module entry/exit usage.
 */
export function extractJourneyEntry(
  journey: JourneyShape,
  sourcePath: string,
  rootName: string,
): CatalogJourneyEntry {
  const { meta, extraMeta } = partitionMeta(journey.meta);

  const modulesUsed = Object.keys(journey.transitions).sort();

  const transitionShape: Record<string, Record<string, string[]>> = {};
  for (const [moduleId, byEntry] of Object.entries(journey.transitions)) {
    if (!byEntry || typeof byEntry !== "object") continue;
    transitionShape[moduleId] = {};
    for (const [entryName, byExit] of Object.entries(byEntry as Record<string, unknown>)) {
      if (!byExit || typeof byExit !== "object") {
        transitionShape[moduleId][entryName] = [];
        continue;
      }
      // `allowBack` is a config flag, not an exit name — exclude it.
      const exits = Object.keys(byExit as Record<string, unknown>).filter((k) => k !== "allowBack");
      transitionShape[moduleId][entryName] = exits;
    }
  }

  const invokesJourneyIds = (journey.invokes ?? [])
    .map((handle) => (typeof handle.id === "string" ? handle.id : null))
    .filter((id): id is string => id !== null)
    .sort();

  const moduleCompat: Record<string, string> = {};
  if (journey.moduleCompat) {
    for (const [k, v] of Object.entries(journey.moduleCompat)) {
      if (typeof v === "string") moduleCompat[k] = v;
    }
  }

  return {
    kind: "journey",
    id: journey.id,
    version: journey.version,
    sourcePath,
    rootName,
    meta,
    extraMeta,
    modulesUsed,
    invokesJourneyIds,
    moduleCompat,
    transitionShape,
    transitionDestinations: {},
    descriptor: journey as unknown as Readonly<Record<string, unknown>>,
  };
}
