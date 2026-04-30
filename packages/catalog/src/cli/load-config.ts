import { existsSync } from "node:fs";
import { resolve } from "pathe";
import { createServer } from "vite";
import type { CatalogConfig } from "../config/types.js";

const DEFAULT_CONFIG_NAMES = [
  "catalog.config.ts",
  "catalog.config.js",
  "catalog.config.mts",
  "catalog.config.mjs",
];

/**
 * Locate and load a `catalog.config.{ts,js,mts,mjs}` file from the given cwd.
 * Reuses Vite SSR for TS support, then closes the server immediately —
 * config loading is a one-shot operation, distinct from the long-lived
 * harvester server.
 *
 * `explicitPath` overrides the autodiscovery and is interpreted relative
 * to `cwd`. Throws when no config can be found, so callers can surface a
 * clear error to the user.
 */
export async function loadCatalogConfig(
  cwd: string,
  explicitPath?: string,
): Promise<{ config: CatalogConfig; configPath: string }> {
  const configPath = explicitPath ? resolve(cwd, explicitPath) : findDefaultConfig(cwd);

  if (!configPath) {
    throw new Error(
      `Could not find a catalog config in ${cwd}. ` +
        `Create one of: ${DEFAULT_CONFIG_NAMES.join(", ")}, ` +
        `or pass --config <path>.`,
    );
  }
  if (!existsSync(configPath)) {
    throw new Error(`Catalog config not found at ${configPath}.`);
  }

  const server = await createServer({
    root: cwd,
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
    configFile: false,
    plugins: [],
  });
  try {
    const mod = (await server.ssrLoadModule(configPath)) as {
      default?: CatalogConfig;
    };
    if (!mod.default) {
      throw new Error(
        `Catalog config at ${configPath} must have a default export ` +
          `(use \`export default defineCatalogConfig({ ... })\`).`,
      );
    }
    return { config: mod.default, configPath };
  } finally {
    await server.close();
  }
}

function findDefaultConfig(cwd: string): string | null {
  for (const name of DEFAULT_CONFIG_NAMES) {
    const path = resolve(cwd, name);
    if (existsSync(path)) return path;
  }
  return null;
}
