// Public, programmatic API for embedders that want to invoke the harvester
// from their own build scripts instead of going through the CLI.

export { defineCatalogConfig } from "./config/define-config.js";
export type {
  CatalogConfig,
  CatalogRoot,
  ResolverStyle,
  CatalogTheme,
  CatalogEnrichHook,
  CatalogEntry,
  CatalogModuleEntry,
  CatalogJourneyEntry,
  CatalogExtensions,
  CatalogExtensionTab,
  CatalogExtensionFacet,
} from "./config/types.js";

export { harvest } from "./harvester/harvest.js";
export type { HarvestResult } from "./harvester/harvest.js";

export { buildCatalogModel } from "./schema/build-model.js";
export type {
  CatalogModel,
  CatalogManifest,
  CatalogFacets,
  CatalogExtensionsMeta,
  CustomFacet,
  CustomFacetValues,
  ResolvedExtensionTab,
} from "./schema/types.js";

export { CATALOG_SCHEMA_VERSION } from "./schema/version.js";
