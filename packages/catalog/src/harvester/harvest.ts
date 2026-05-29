import { isAbsolute, resolve } from "pathe";
import { glob } from "tinyglobby";
import { createServer, type Alias, type InlineConfig, type ViteDevServer } from "vite";
import type {
  CatalogConfig,
  CatalogEntry,
  CatalogJourneyEntry,
  CatalogResolve,
} from "../config/types.js";
import { extractTransitionDestinations } from "./ast-destinations.js";
import { isJourneyDefinition, isModuleDescriptor } from "./detect.js";
import { extractJourneyEntry, extractModuleEntry } from "./extract.js";
import { applyResolver } from "./resolve.js";

/**
 * Errors collected during a harvest run. Non-fatal — the harvester reports
 * them but completes the rest of the scan.
 */
export interface HarvestError {
  readonly filePath: string;
  readonly rootName: string;
  readonly message: string;
}

export interface HarvestResult {
  readonly entries: readonly CatalogEntry[];
  readonly errors: readonly HarvestError[];
}

/**
 * Run the harvester over the configured roots and return every descriptor
 * the resolvers surfaced. Loads files via Vite SSR — the same machinery the
 * runtime examples use — so JSX/TS/ESM/peer-dep resolution work out of the box.
 *
 * `cwd` is the directory the config file lives in (used to resolve relative
 * patterns). Roots may override this per-root via `root.cwd`.
 */
export async function harvest(config: CatalogConfig, cwd: string): Promise<HarvestResult> {
  const server = await createSsrServer(cwd, config.resolve);
  const entries: CatalogEntry[] = [];
  const errors: HarvestError[] = [];

  try {
    for (const root of config.roots) {
      const rootCwd = root.cwd ? resolve(cwd, root.cwd) : cwd;
      const files = await glob(root.pattern, {
        cwd: rootCwd,
        absolute: true,
        onlyFiles: true,
        // depth in tinyglobby counts directory levels; undefined = unlimited.
        ...(root.depth !== undefined ? { deep: root.depth } : {}),
      });

      for (const filePath of files) {
        let mod: Record<string, unknown>;
        try {
          mod = (await server.ssrLoadModule(filePath)) as Record<string, unknown>;
        } catch (err) {
          errors.push({
            filePath,
            rootName: root.name,
            message: `Load failed: ${(err as Error).message}`,
          });
          continue;
        }

        const candidates = applyResolver(root.resolver, mod, filePath);
        for (const candidate of candidates) {
          if (isModuleDescriptor(candidate)) {
            entries.push(extractModuleEntry(candidate, filePath, root.name));
          } else if (isJourneyDefinition(candidate)) {
            entries.push(extractJourneyEntry(candidate, filePath, root.name));
          }
          // Silently ignore candidates that aren't descriptors — the resolver
          // may legitimately return barrel exports, helpers, etc.
        }
      }
    }

    // Static analysis pass — recover `next/abort/complete` literals from
    // each journey's transition handlers. Failures are collected as
    // non-fatal HarvestErrors and the journey simply ends up with empty
    // `transitionDestinations` (the SPA renders unknown destinations
    // gracefully).
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      if (entry.kind !== "journey") continue;
      const journey = entry as CatalogJourneyEntry;
      const destinations = await extractTransitionDestinations(
        journey.sourcePath,
        journey.id,
        (message) => {
          errors.push({
            filePath: journey.sourcePath,
            rootName: journey.rootName,
            message: `AST analysis: ${message}`,
          });
        },
      );
      // CatalogJourneyEntry is `readonly`, so swap in a new entry with the
      // analyzed map rather than mutating in place.
      entries[i] = { ...journey, transitionDestinations: destinations };
    }

    if (config.enrich) {
      for (let i = 0; i < entries.length; i++) {
        entries[i] = await config.enrich(entries[i]!);
      }
    }
  } finally {
    await server.close();
  }

  return { entries, errors };
}

async function createSsrServer(
  cwd: string,
  resolveConfig?: CatalogResolve,
): Promise<ViteDevServer> {
  return createServer({
    root: cwd,
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
    // The harvester only ever calls ssrLoadModule, so it never needs the
    // dependency optimizer. `noDiscovery` disables on-the-fly discovery and
    // an empty `entries` list stops the initial scan from crawling the
    // project for HTML entry points (which otherwise surfaces noisy, harmless
    // "server is being restarted or closed" errors when the server closes).
    optimizeDeps: { noDiscovery: true, entries: [] },
    // The user's own configFile / plugins are irrelevant to ssrLoadModule and
    // only add noise, so they stay disabled. Resolution is the exception:
    // projects that use path aliases must be able to mirror them here, since
    // otherwise the harvester can't load any file that imports through one.
    configFile: false,
    plugins: [],
    ...buildResolve(cwd, resolveConfig),
  });
}

/**
 * Translate the catalog's `resolve` config into the `resolve` slice of a Vite
 * inline config. Alias replacements that are relative paths are resolved
 * against the config directory so authors can write `./packages/ui/src`
 * instead of an absolute path. Returns an empty object when nothing is
 * configured, so spreading it into the inline config is a no-op.
 */
function buildResolve(cwd: string, resolveConfig?: CatalogResolve): Pick<InlineConfig, "resolve"> {
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
    // Bare specifiers (e.g. `react` → `preact/compat`) and already-absolute
    // paths pass through; only relative paths get anchored to the config dir.
    replacement:
      replacement.startsWith(".") && !isAbsolute(replacement)
        ? resolve(cwd, replacement)
        : replacement,
  }));
}
