import type { CatalogMeta } from "@modular-react/core";

/**
 * One detail-page tab resolved at build time. Either `url` (iframe) or `html`
 * (inlined string) is set; both being absent means the host returned no
 * content for this entry, in which case the tab is omitted entirely.
 */
export interface ResolvedExtensionTab {
  readonly id: string;
  readonly label: string;
  readonly url?: string;
  readonly html?: string;
}

/**
 * Per-entry custom-facet values, keyed by facet key. Each entry only carries
 * the facets that produced a value for it.
 */
export type CustomFacetValues = Readonly<Record<string, readonly string[]>>;

/**
 * Public shape of a serialized module entry as it appears in `catalog.json`.
 * Every field is JSON-safe — the SPA reads this directly with no further
 * transformation.
 */
export interface SerializedModuleEntry {
  readonly kind: "module";
  readonly id: string;
  readonly version: string;
  readonly sourcePath: string;
  readonly rootName: string;
  readonly meta: CatalogMeta;
  /** App-specific meta keys that aren't part of CatalogMeta. */
  readonly extraMeta: Readonly<Record<string, unknown>>;
  readonly slotKeys: readonly string[];
  readonly hasRoutes: boolean;
  readonly hasComponent: boolean;
  readonly requires: readonly string[];
  readonly optionalRequires: readonly string[];
  readonly entryPointNames: readonly string[];
  readonly exitPointNames: readonly string[];
  readonly navigationLabels: readonly string[];
  /** Resolved extension tabs (omitted when none configured). */
  readonly extensionTabs?: readonly ResolvedExtensionTab[];
  /** Custom facet values from `extensions.facets` (omitted when none). */
  readonly customFacets?: CustomFacetValues;
}

/**
 * Public shape of a serialized journey entry as it appears in `catalog.json`.
 */
export interface SerializedJourneyEntry {
  readonly kind: "journey";
  readonly id: string;
  readonly version: string;
  readonly sourcePath: string;
  readonly rootName: string;
  readonly meta: CatalogMeta;
  readonly extraMeta: Readonly<Record<string, unknown>>;
  readonly modulesUsed: readonly string[];
  readonly invokesJourneyIds: readonly string[];
  readonly moduleCompat: Readonly<Record<string, string>>;
  readonly extensionTabs?: readonly ResolvedExtensionTab[];
  readonly customFacets?: CustomFacetValues;
}

/**
 * Custom facet aggregated from `extensions.facets` — the SPA reads these to
 * render extra dropdowns alongside the built-in team / domain / tag / status.
 */
export interface CustomFacet {
  readonly key: string;
  readonly label: string;
  readonly values: readonly string[];
}

/**
 * Pre-computed facet aggregations the SPA uses for filter rails.
 * Kept tiny — recomputing client-side is fast for catalogs of any
 * realistic size, but baking these in at build time keeps the SPA's
 * boot path zero-cost.
 */
export interface CatalogFacets {
  /** Sorted, deduped list of every `meta.ownerTeam` value seen. */
  readonly teams: readonly string[];
  /** Sorted, deduped list of every `meta.domain` value seen. */
  readonly domains: readonly string[];
  /** Sorted, deduped list of every `meta.tags[*]` value seen. */
  readonly tags: readonly string[];
  /** Sorted, deduped list of `meta.status` values present. */
  readonly statuses: readonly ("experimental" | "stable" | "deprecated")[];
  /** Custom facets contributed via `config.extensions.facets`. */
  readonly custom?: readonly CustomFacet[];
}

/** Top-level extension surface metadata — labels for tabs, etc. */
export interface CatalogExtensionsMeta {
  /** Module-detail tab labels in declaration order (from config). */
  readonly moduleDetailTabs?: readonly { readonly id: string; readonly label: string }[];
  /** Journey-detail tab labels in declaration order (from config). */
  readonly journeyDetailTabs?: readonly { readonly id: string; readonly label: string }[];
}

/**
 * The full payload written to `catalog.json`. The SPA loads this once at
 * boot and reads from it for every page.
 */
export interface CatalogModel {
  readonly schemaVersion: string;
  readonly title: string;
  readonly builtAt: string;
  readonly modules: readonly SerializedModuleEntry[];
  readonly journeys: readonly SerializedJourneyEntry[];
  readonly facets: CatalogFacets;
  /**
   * Index from module id → list of journey ids that reference it via
   * transitions. Pre-computed so the module detail page can show
   * "used by N journeys" without scanning at render time.
   */
  readonly journeysByModule: Readonly<Record<string, readonly string[]>>;
  /**
   * Index from journey id → list of journey ids that invoke it (reverse of
   * each journey's `invokesJourneyIds`). Lets the journey detail page show
   * "Invoked by …" without scanning at render time.
   */
  readonly journeysByInvokedJourney: Readonly<Record<string, readonly string[]>>;
  /**
   * Index from module id → entry/exit point usage by journeys. For each
   * entry point, lists the journeys whose transitions reference that
   * `transitions[moduleId][entryName]` slot. For each exit point, lists
   * the journeys whose transition handlers handle that exit (keys of
   * `transitions[moduleId][entryName]` excluding `allowBack`). Pre-computed
   * so module detail pages can render per-entry/exit "used by" rows.
   */
  readonly moduleEntryUsage: Readonly<
    Record<string, Readonly<Record<string, readonly ModuleEntryUsage[]>>>
  >;
  readonly moduleExitUsage: Readonly<
    Record<string, Readonly<Record<string, readonly ModuleExitUsage[]>>>
  >;
  /** Top-level extension surface metadata; only present when configured. */
  readonly extensions?: CatalogExtensionsMeta;
}

/**
 * One journey-side reference to a module entry point — "journey J routes to
 * this module.entry via its transitions". The handled exit names tell readers
 * which outcomes that journey handles when at this step.
 */
export interface ModuleEntryUsage {
  readonly journeyId: string;
  /** Exit names this journey handles for this entry (excludes `allowBack`). */
  readonly handledExits: readonly string[];
}

/** One journey-side reference to a module exit point. */
export interface ModuleExitUsage {
  readonly journeyId: string;
  /** Entry name on the same module whose handler matches this exit. */
  readonly fromEntry: string;
  /**
   * Where this exit's handler routes the flow to. Each item is one possible
   * branch detected statically; multiple entries mean the handler returns
   * different `next` shapes on different code paths. Empty when the
   * destination is dynamic / not statically resolvable.
   */
  readonly destinations?: readonly TransitionDestination[];
  /** True when the handler returns `{ abort }` on at least one branch. */
  readonly aborts?: boolean;
  /** True when the handler returns `{ complete }` on at least one branch. */
  readonly completes?: boolean;
}

/**
 * One statically-resolved transition destination — the `next: { module, entry }`
 * literal from a transition handler's return value. `entry` is omitted when
 * only `module` could be resolved (e.g. computed entry name).
 */
export interface TransitionDestination {
  readonly module: string;
  readonly entry?: string;
}

/**
 * The build's manifest sidecar. Written next to `catalog.json` for
 * operators who want to know what produced a given build without parsing
 * the full catalog payload.
 */
export interface CatalogManifest {
  readonly schemaVersion: string;
  readonly title: string;
  readonly builtAt: string;
  readonly catalogPackageVersion: string;
  readonly roots: readonly { readonly name: string; readonly pattern: string }[];
  readonly counts: { readonly modules: number; readonly journeys: number };
}
