// Mirror of the public schema from @modular-react/catalog. Duplicated here
// (rather than imported) because the SPA is built independently and
// importing from the parent package introduces a build-order coupling we
// don't need — the schema is small and JSON-stable.

export interface CatalogMetaShape {
  readonly name?: string;
  readonly description?: string;
  readonly ownerTeam?: string;
  readonly domain?: string;
  readonly tags?: readonly string[];
  readonly status?: "experimental" | "stable" | "deprecated";
  readonly since?: string;
  readonly links?: {
    readonly docs?: string;
    readonly source?: string;
    readonly slack?: string;
    readonly runbook?: string;
  };
  readonly screenshots?: readonly string[];
}

export interface ResolvedExtensionTab {
  readonly id: string;
  readonly label: string;
  readonly url?: string;
  readonly html?: string;
}

export type CustomFacetValues = Readonly<Record<string, readonly string[]>>;

export interface ModuleEntry {
  readonly kind: "module";
  readonly id: string;
  readonly version: string;
  readonly sourcePath: string;
  readonly rootName: string;
  readonly meta: CatalogMetaShape;
  readonly extraMeta: Readonly<Record<string, unknown>>;
  readonly slotKeys: readonly string[];
  readonly hasRoutes: boolean;
  readonly hasComponent: boolean;
  readonly requires: readonly string[];
  readonly optionalRequires: readonly string[];
  readonly entryPointNames: readonly string[];
  readonly exitPointNames: readonly string[];
  readonly navigationLabels: readonly string[];
  readonly extensionTabs?: readonly ResolvedExtensionTab[];
  readonly customFacets?: CustomFacetValues;
}

export interface JourneyEntry {
  readonly kind: "journey";
  readonly id: string;
  readonly version: string;
  readonly sourcePath: string;
  readonly rootName: string;
  readonly meta: CatalogMetaShape;
  readonly extraMeta: Readonly<Record<string, unknown>>;
  readonly modulesUsed: readonly string[];
  readonly invokesJourneyIds: readonly string[];
  readonly moduleCompat: Readonly<Record<string, string>>;
  readonly extensionTabs?: readonly ResolvedExtensionTab[];
  readonly customFacets?: CustomFacetValues;
}

export interface CustomFacet {
  readonly key: string;
  readonly label: string;
  readonly values: readonly string[];
}

export interface CatalogFacets {
  readonly teams: readonly string[];
  readonly domains: readonly string[];
  readonly tags: readonly string[];
  readonly statuses: readonly ("experimental" | "stable" | "deprecated")[];
  readonly custom?: readonly CustomFacet[];
}

export interface CatalogExtensionsMeta {
  readonly moduleDetailTabs?: readonly { readonly id: string; readonly label: string }[];
  readonly journeyDetailTabs?: readonly { readonly id: string; readonly label: string }[];
}

export interface TransitionDestination {
  readonly module: string;
  readonly entry?: string;
}

export interface ModuleEntryUsage {
  readonly journeyId: string;
  readonly handledExits: readonly string[];
}

export interface ModuleExitUsage {
  readonly journeyId: string;
  readonly fromEntry: string;
  readonly destinations?: readonly TransitionDestination[];
  readonly aborts?: boolean;
  readonly completes?: boolean;
}

export interface CatalogModel {
  readonly schemaVersion: string;
  readonly title: string;
  readonly builtAt: string;
  readonly modules: readonly ModuleEntry[];
  readonly journeys: readonly JourneyEntry[];
  readonly facets: CatalogFacets;
  readonly journeysByModule: Readonly<Record<string, readonly string[]>>;
  readonly journeysByInvokedJourney: Readonly<Record<string, readonly string[]>>;
  readonly moduleEntryUsage: Readonly<
    Record<string, Readonly<Record<string, readonly ModuleEntryUsage[]>>>
  >;
  readonly moduleExitUsage: Readonly<
    Record<string, Readonly<Record<string, readonly ModuleExitUsage[]>>>
  >;
  readonly extensions?: CatalogExtensionsMeta;
}

export interface CatalogTheme {
  readonly brandName?: string;
  readonly logoUrl?: string;
  readonly primaryColor?: string;
  readonly backgroundColor?: string;
}
