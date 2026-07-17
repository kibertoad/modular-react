import type { PluginOption } from "vite";
import type { AnyModuleDescriptor, CatalogMeta } from "@modular-react/core";

// JourneyDefinition types live in @modular-react/journeys, but we don't take a
// runtime dep on that package — descriptor detection is duck-typed and the
// exported entry types stay structural.

/**
 * Resolver style. Each scan root picks one of these, telling the harvester
 * how to extract descriptors from a loaded source file.
 */
export type ResolverStyle =
  | "defaultExport"
  | "namedExport"
  | "objectMap"
  | { kind: "namedExport"; exportName: string }
  | { kind: "custom"; select: (mod: Record<string, unknown>, filePath: string) => unknown[] };

/**
 * One scan root in the catalog config. The harvester walks every file
 * matching `pattern` (relative to the project root), loads it via Vite SSR,
 * and runs the configured resolver to extract descriptors.
 */
export interface CatalogRoot {
  /** Stable identifier for the root, used in error messages and source attribution. */
  readonly name: string;

  /**
   * Glob pattern resolved relative to the project root (the directory
   * containing the config file). Examples: `["packages/*", "src/index.ts"].join("/")`,
   * `"vendor/modules/index.ts"`, `["legacy/**", "module.ts"].join("/")`.
   */
  readonly pattern: string;

  /**
   * Maximum depth (number of path segments below the root) the harvester
   * is allowed to descend. Useful for keeping scans bounded in monorepos
   * with deep nesting. Defaults to no limit.
   */
  readonly depth?: number;

  /**
   * Resolver style. Defaults to `defaultExport` — the file's default export
   * is treated as the descriptor.
   */
  readonly resolver?: ResolverStyle;

  /**
   * Optional explicit project root override for this scan. Defaults to the
   * directory containing the config file. Useful when aggregating multiple
   * external repositories from a single config.
   */
  readonly cwd?: string;
}

/**
 * A single path-alias entry, mirroring one element of Vite's array-form
 * `resolve.alias`. `find` is matched against import specifiers (string =
 * prefix match, `RegExp` = pattern match); `replacement` is substituted in.
 */
export interface CatalogAlias {
  /** Specifier (or pattern) to rewrite. */
  readonly find: string | RegExp;
  /** Value to rewrite it to. A relative path (starting with `.`) resolves against the config directory. */
  readonly replacement: string;
}

/**
 * Module-resolution overrides forwarded to the harvester's Vite SSR loader.
 *
 * The harvester loads source files with `configFile: false`, so it never sees
 * your project's own `vite.config`. Codebases that resolve imports through
 * path aliases (e.g. `@app/ui` → `packages/ui/src`) must mirror those aliases
 * here, or the files that use them fail to load. A focused subset of Vite's
 * `resolve` options — enough for the common alias / dedupe cases without
 * coupling the public config to Vite's full surface.
 */
export interface CatalogResolve {
  /**
   * Path aliases applied when loading source files. Accepts either the object
   * form (`{ "@app/ui": "./packages/ui/src" }`) or the array form
   * (`[{ find: /^@app\//, replacement: "/abs/path/" }]`), matching Vite's
   * `resolve.alias`. String replacements that start with `.` are resolved
   * against the config directory; absolute paths and bare specifiers (e.g.
   * `react` → `preact/compat`) are passed through unchanged.
   */
  readonly alias?: Readonly<Record<string, string>> | readonly CatalogAlias[];

  /**
   * Package names to force-resolve to a single copy, mirroring Vite's
   * `resolve.dedupe`. Useful when loading component files pulls in two copies
   * of a singleton like `react`.
   */
  readonly dedupe?: readonly string[];
}

/**
 * Theme tokens consumed by the prebuilt SPA at build time. The CLI emits a
 * tiny `theme.json` next to `catalog.json`, plus a CSS file injecting the
 * matching custom properties. Apps that need anything beyond these tokens
 * should look at the (forthcoming) extension API.
 */
export interface CatalogTheme {
  /** Display name shown in the SPA header (e.g. "Acme Portal Catalog"). */
  readonly brandName?: string;
  /** Logo URL — served directly to <img src>. Relative paths resolve to the catalog out dir. */
  readonly logoUrl?: string;
  /** Primary brand color (any CSS color value). Drives accent and link colors. */
  readonly primaryColor?: string;
  /** Background color for the app shell. */
  readonly backgroundColor?: string;
}

/**
 * Hook called once per harvested entry, after the resolver has produced a
 * descriptor and before the entry lands in the catalog. The return value
 * fully replaces the entry — return the input unchanged if you don't want
 * to enrich it. Useful for inferring `ownerTeam` from CODEOWNERS, deriving
 * tags from a directory layout, or pulling team metadata from an internal
 * directory.
 */
export type CatalogEnrichHook = (entry: CatalogEntry) => CatalogEntry | Promise<CatalogEntry>;

/**
 * A single custom facet contributed by the host. The `source` function is
 * invoked once per harvested entry; whatever it returns (a single string,
 * an array, or undefined for "no value") is rolled up into a sorted, deduped
 * value list used by the SPA's filter rail.
 *
 * Custom facet values are baked into `catalog.json` at build time, so the
 * function never crosses the runtime boundary — using closures, network
 * calls, or fs reads from inside `source` is fine.
 */
export interface CatalogExtensionFacet {
  /** Stable identifier; surfaces as a URL search param key. */
  readonly key: string;
  /** Human-readable label shown in the SPA's filter rail. */
  readonly label: string;
  /** Derive the entry's value(s) for this facet; return `undefined` to skip. */
  readonly source: (entry: CatalogEntry) => string | readonly string[] | undefined;
}

/**
 * One extra tab attached to module-detail or journey-detail pages.
 *
 * Either `url` or `render` (but not both) must be provided. `url` becomes a
 * sandboxed iframe in the SPA; `render` is a build-time function returning an
 * HTML string that's inlined as-is. Both are evaluated per entry.
 */
export interface CatalogExtensionTab {
  /** Stable id within the tab list. */
  readonly id: string;
  /** Human-readable label shown on the tab strip. */
  readonly label: string;
  /** Derive an iframe URL for this entry, or `undefined` to hide the tab. */
  readonly url?: (entry: CatalogEntry) => string | undefined;
  /** Derive an HTML string for this entry, or `undefined` to hide the tab. */
  readonly render?: (entry: CatalogEntry) => string | undefined;
}

/**
 * Host extension surface. Everything declared here runs at build time and is
 * baked into the emitted catalog — there is no extension code on the client.
 */
export interface CatalogExtensions {
  /** Extra tabs added to every module detail page. */
  readonly moduleDetailTabs?: readonly CatalogExtensionTab[];
  /** Extra tabs added to every journey detail page. */
  readonly journeyDetailTabs?: readonly CatalogExtensionTab[];
  /** Extra facets that join the built-in team / domain / tag / status filters. */
  readonly facets?: readonly CatalogExtensionFacet[];
}

/**
 * Top-level catalog configuration. Created via {@link defineCatalogConfig}
 * or by exporting an object literal that satisfies this interface.
 */
export interface CatalogConfig {
  /** Output directory for the built catalog (catalog.json + SPA assets). */
  readonly out?: string;

  /** Title used for the HTML <title> and SPA header. Defaults to "Catalog". */
  readonly title?: string;

  /** Scan roots. The harvester runs each root in declaration order. */
  readonly roots: readonly CatalogRoot[];

  /**
   * Module-resolution overrides for the harvester's Vite SSR loader. Mirror
   * your project's path aliases here so files that import through them load.
   */
  readonly resolve?: CatalogResolve;

  /**
   * Vite plugins forwarded to the harvester's SSR loader. The loader runs with
   * `configFile: false`, so it never picks up your project's own Vite plugins.
   *
   * Descriptors written in plain TS/JSX need nothing here — Vite's built-in
   * esbuild pipeline handles them. But when a descriptor imports source that
   * needs a compiler plugin to load, that plugin must be listed here. The
   * canonical case is Vue: a `defineModule` descriptor importing an `.vue`
   * single-file component only loads through the SSR path when
   * `@vitejs/plugin-vue` is present, e.g. `plugins: [vue()]`. The plugin is
   * inert for files it doesn't handle, so a mixed React/Vue catalog can list
   * it unconditionally.
   */
  readonly plugins?: readonly PluginOption[];

  /** Theme tokens injected as CSS custom properties at build time. */
  readonly theme?: CatalogTheme;

  /** Per-entry enrichment hook. Runs after resolver, before catalog emit. */
  readonly enrich?: CatalogEnrichHook;

  /** Build-time extension surface — extra tabs and facets, no runtime code. */
  readonly extensions?: CatalogExtensions;
}

// -----------------------------------------------------------------------------
// Harvested entry shape (used by the enrich hook and the schema emitter)
// -----------------------------------------------------------------------------

/**
 * Common fields surfaced on every harvested entry, regardless of kind.
 * The emitter and the SPA both rely on this structure being uniform.
 */
interface CatalogEntryBase {
  /** Absolute path of the file the descriptor was loaded from. */
  readonly sourcePath: string;
  /** Name of the scan root this entry came from. */
  readonly rootName: string;
  /** Descriptor id (unique within its kind across the catalog). */
  readonly id: string;
  /** Descriptor version. */
  readonly version: string;
  /** Officially-supported metadata (subset of the descriptor's `meta` field). */
  readonly meta: CatalogMeta;
  /** Remaining `meta` keys that are not part of CatalogMeta — surfaced as-is. */
  readonly extraMeta: Readonly<Record<string, unknown>>;
}

/** A harvested module descriptor. */
export interface CatalogModuleEntry extends CatalogEntryBase {
  readonly kind: "module";
  /** Slot keys the module contributes to (static + dynamic). */
  readonly slotKeys: readonly string[];
  /** Whether the module declares routes. */
  readonly hasRoutes: boolean;
  /** Whether the module is a workspace-style component module. */
  readonly hasComponent: boolean;
  /** Required dependency keys. */
  readonly requires: readonly string[];
  /** Optional dependency keys. */
  readonly optionalRequires: readonly string[];
  /** Entry point names. */
  readonly entryPointNames: readonly string[];
  /** Exit point names. */
  readonly exitPointNames: readonly string[];
  /** Navigation labels (whatever the descriptor declared). */
  readonly navigationLabels: readonly string[];
  /** Raw descriptor reference for advanced enrich logic. Not serialized. */
  readonly descriptor: AnyModuleDescriptor;
}

/** A harvested journey definition. */
export interface CatalogJourneyEntry extends CatalogEntryBase {
  readonly kind: "journey";
  /** Module ids the journey references via transitions. */
  readonly modulesUsed: readonly string[];
  /** Journey ids this journey may invoke (from `invokes`, if declared). */
  readonly invokesJourneyIds: readonly string[];
  /** Module compatibility constraints, keyed by module id. */
  readonly moduleCompat: Readonly<Record<string, string>>;
  /**
   * Shape of `transitions[moduleId][entryName]` keys, captured at harvest
   * time: `{ [moduleId]: { [entryName]: ["exitName", ...] } }`. Used by the
   * build step to aggregate per-module entry/exit usage; never serialized.
   */
  readonly transitionShape: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  /**
   * Statically-resolved `{ next | invoke | abort | complete }` outcomes per
   * `[moduleId][entryName][exitName]`, when AST analysis is enabled and
   * found a literal. Empty when AST is off or the handler is dynamic.
   * Never serialized.
   */
  readonly transitionDestinations: TransitionDestinationMap;
  /** Raw descriptor reference for advanced enrich logic. Not serialized. */
  readonly descriptor: Readonly<Record<string, unknown>>;
}

/**
 * Map shape used by the AST analyzer. Each leaf is an `ExitOutcome` describing
 * the static outcomes detected on the corresponding transition handler.
 */
export type TransitionDestinationMap = Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, ExitOutcome>>>>>
>;

/**
 * What a single transition handler routes to, based on the literal returns
 * the AST analyzer recovered. `nexts` is the list of `{ next: { module, entry } }`
 * destinations seen across branches; `aborts` / `completes` flag whether any
 * branch returned `{ abort }` / `{ complete }`.
 */
export interface ExitOutcome {
  readonly nexts: readonly { readonly module: string; readonly entry?: string }[];
  readonly aborts: boolean;
  readonly completes: boolean;
  /**
   * True when `nexts` was sourced from a `defineTransition({ targets })`
   * declaration on the handler — the destination set is statically
   * authoritative, including branches a pure AST walk could not resolve.
   * False / absent when destinations were AST-inferred from `next` literals
   * inside the handler body.
   */
  readonly targetsDeclared?: boolean;
}

/** Discriminated union of every harvestable entry kind. */
export type CatalogEntry = CatalogModuleEntry | CatalogJourneyEntry;
