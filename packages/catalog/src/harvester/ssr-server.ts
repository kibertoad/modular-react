import { resolve } from "pathe";
import { createServer, type Alias, type InlineConfig, type ViteDevServer } from "vite";
import type { CatalogResolve } from "../config/types.js";

/**
 * Build the inline Vite config shared by every short-lived SSR loader in the
 * catalog: the harvester (which `ssrLoadModule`s descriptor source files) and
 * the config loader (which `ssrLoadModule`s `catalog.config.ts`). Both only
 * ever load a handful of modules and then close immediately, so neither needs
 * the dependency optimizer.
 *
 * `noDiscovery` switches off on-the-fly discovery, and an empty `entries` list
 * stops the optimizer's initial scan from crawling the project for HTML entry
 * points. Without the empty list that scan runs asynchronously and races the
 * `server.close()` that follows right after the load, surfacing harmless but
 * noisy "server is being restarted or closed" / "Failed to scan for
 * dependencies" errors. Keeping both loaders on this one factory means the
 * quieting can't drift back out of one of them.
 *
 * `resolveConfig` is only meaningful for the harvester — the config loader runs
 * before the resolve config is even known, so it omits it.
 *
 * Pure and exported so the shared options can be asserted in a unit test
 * without standing up a real server.
 */
export function buildSsrServerConfig(cwd: string, resolveConfig?: CatalogResolve): InlineConfig {
  return {
    root: cwd,
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, entries: [] },
    // The user's own configFile / plugins are irrelevant to ssrLoadModule and
    // only add noise, so they stay disabled. Resolution is the exception —
    // see buildResolve.
    configFile: false,
    plugins: [],
    ...buildResolve(cwd, resolveConfig),
  };
}

/**
 * Create the short-lived SSR server shared by the harvester and the config
 * loader. See {@link buildSsrServerConfig} for why the optimizer is disabled.
 */
export function createCatalogSsrServer(
  cwd: string,
  resolveConfig?: CatalogResolve,
): Promise<ViteDevServer> {
  return createServer(buildSsrServerConfig(cwd, resolveConfig));
}

/**
 * Translate the catalog's `resolve` config into the `resolve` slice of a Vite
 * inline config. Alias replacements that are relative paths are resolved
 * against the config directory so authors can write `./packages/ui/src`
 * instead of an absolute path. Returns an empty object when nothing is
 * configured, so spreading it into the inline config is a no-op.
 *
 * Exported for unit testing — the alias normalization and dedupe forwarding
 * are easier to assert here than through a live Vite SSR load.
 */
export function buildResolve(
  cwd: string,
  resolveConfig?: CatalogResolve,
): Pick<InlineConfig, "resolve"> {
  if (!resolveConfig) return {};

  const resolveOptions: NonNullable<InlineConfig["resolve"]> = {};

  if (resolveConfig.alias) {
    resolveOptions.alias = normalizeAlias(cwd, resolveConfig.alias);
  }
  if (resolveConfig.dedupe) {
    resolveOptions.dedupe = [...resolveConfig.dedupe];
  }

  return { resolve: resolveOptions };
}

/**
 * Normalize the object- or array-form alias map into Vite's array form,
 * resolving relative-path replacements against the config directory.
 */
function normalizeAlias(cwd: string, alias: NonNullable<CatalogResolve["alias"]>): Alias[] {
  const entries: ReadonlyArray<readonly [string | RegExp, string]> = Array.isArray(alias)
    ? alias.map((a) => [a.find, a.replacement] as const)
    : Object.entries(alias);

  return entries.map(([find, replacement]) => ({
    find,
    // Only `.`-prefixed paths are anchored to the config dir. Bare specifiers
    // (e.g. `react` → `preact/compat`) and absolute paths pass through — and a
    // `.`-prefixed string can never be absolute, so no extra guard is needed.
    replacement: replacement.startsWith(".") ? resolve(cwd, replacement) : replacement,
  }));
}
