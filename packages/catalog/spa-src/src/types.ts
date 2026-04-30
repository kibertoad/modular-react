// Mirror of the public schema from @modular-react/catalog. Duplicated here
// (rather than imported) because the SPA is built independently and
// importing from the parent package introduces a build-order coupling we
// don't need — the schema is small and JSON-stable.

export interface CatalogMetaShape {
  name?: string;
  description?: string;
  ownerTeam?: string;
  domain?: string;
  tags?: readonly string[];
  status?: "experimental" | "stable" | "deprecated";
  since?: string;
  links?: {
    docs?: string;
    source?: string;
    slack?: string;
    runbook?: string;
  };
  screenshots?: readonly string[];
}

export interface ResolvedExtensionTab {
  id: string;
  label: string;
  url?: string;
  html?: string;
}

export type CustomFacetValues = Record<string, readonly string[]>;

export interface ModuleEntry {
  kind: "module";
  id: string;
  version: string;
  sourcePath: string;
  rootName: string;
  meta: CatalogMetaShape;
  extraMeta: Record<string, unknown>;
  slotKeys: readonly string[];
  hasRoutes: boolean;
  hasComponent: boolean;
  requires: readonly string[];
  optionalRequires: readonly string[];
  entryPointNames: readonly string[];
  exitPointNames: readonly string[];
  navigationLabels: readonly string[];
  startsJourneyIds: readonly string[];
  extensionTabs?: readonly ResolvedExtensionTab[];
  customFacets?: CustomFacetValues;
}

export interface JourneyEntry {
  kind: "journey";
  id: string;
  version: string;
  sourcePath: string;
  rootName: string;
  meta: CatalogMetaShape;
  extraMeta: Record<string, unknown>;
  modulesUsed: readonly string[];
  invokesJourneyIds: readonly string[];
  moduleCompat: Record<string, string>;
  extensionTabs?: readonly ResolvedExtensionTab[];
  customFacets?: CustomFacetValues;
}

export interface CustomFacet {
  key: string;
  label: string;
  values: readonly string[];
}

export interface CatalogFacets {
  teams: readonly string[];
  domains: readonly string[];
  tags: readonly string[];
  statuses: readonly ("experimental" | "stable" | "deprecated")[];
  custom?: readonly CustomFacet[];
}

export interface CatalogExtensionsMeta {
  moduleDetailTabs?: readonly { id: string; label: string }[];
  journeyDetailTabs?: readonly { id: string; label: string }[];
}

export interface TransitionDestination {
  module: string;
  entry?: string;
}

export interface ModuleEntryUsage {
  journeyId: string;
  handledExits: readonly string[];
}

export interface ModuleExitUsage {
  journeyId: string;
  fromEntry: string;
  destinations?: readonly TransitionDestination[];
  aborts?: boolean;
  completes?: boolean;
}

export interface CatalogModel {
  schemaVersion: string;
  title: string;
  builtAt: string;
  modules: readonly ModuleEntry[];
  journeys: readonly JourneyEntry[];
  facets: CatalogFacets;
  journeysByModule: Record<string, readonly string[]>;
  journeysByInvokedJourney: Record<string, readonly string[]>;
  modulesByStartedJourney: Record<string, readonly string[]>;
  moduleEntryUsage: Record<string, Record<string, readonly ModuleEntryUsage[]>>;
  moduleExitUsage: Record<string, Record<string, readonly ModuleExitUsage[]>>;
  extensions?: CatalogExtensionsMeta;
}

export interface CatalogTheme {
  brandName?: string;
  logoUrl?: string;
  primaryColor?: string;
  backgroundColor?: string;
}
