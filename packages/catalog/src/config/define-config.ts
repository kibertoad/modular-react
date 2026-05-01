import type { CatalogConfig } from "./types.js";

/**
 * Identity helper that gives authors full type inference and IntelliSense
 * when writing a `catalog.config.ts`. Returns the config unchanged.
 *
 * @example
 * ```ts
 * import { defineCatalogConfig } from "@modular-react/catalog";
 *
 * export default defineCatalogConfig({
 *   out: "dist-catalog",
 *   title: "Acme Portal",
 *   roots: [
 *     { name: "monorepo", pattern: ["packages/*", "src/index.ts"].join("/"), resolver: "defaultExport" },
 *   ],
 * });
 * ```
 */
export function defineCatalogConfig<T extends CatalogConfig>(config: T): T {
  return config;
}
