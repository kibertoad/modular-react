/**
 * Schema version baked into every emitted `catalog.json`. Bump on any
 * non-additive change to the schema so the SPA can refuse to load a
 * mismatched build with a clear error instead of crashing on unexpected
 * shapes.
 */
export const CATALOG_SCHEMA_VERSION = "2";
