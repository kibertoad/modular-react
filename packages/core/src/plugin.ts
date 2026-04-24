import type { ComponentType, ReactNode } from "react";
import type { ModuleDescriptor, NavigationItemBase } from "./types.js";

/**
 * Plugin contract — plugins extend the registry without forcing runtime
 * packages to take a hard dependency on them.
 *
 * Lifecycle:
 *   1. `createRegistry` calls `extend(ctx)` for each plugin and merges the
 *      returned object onto the registry instance so plugin-contributed
 *      methods (e.g. `registerJourney`) appear on `registry` with full types.
 *   2. `resolve()` / `resolveManifest()` calls `validate(ctx)` after modules
 *      are validated — throw to fail assembly.
 *   3. Then calls `onResolve(ctx)` to produce the plugin's runtime value,
 *      stored on `manifest.extensions[plugin.name]`.
 *   4. Finally, `providers(ctx)` contributes React providers to the provider
 *      stack. The first element in the returned array is outermost.
 */
export interface RegistryPlugin<
  TName extends string = string,
  TExtension extends object = object,
  TRuntime = unknown,
> {
  readonly name: TName;

  /**
   * Contribute methods + state to the registry. The method keys appear on
   * `registry` with full types via type-level intersection.
   */
  readonly extend: (ctx: PluginExtendCtx) => TExtension;

  /**
   * Called during `resolve()` / `resolveManifest()` after core validators.
   * Throw to fail the resolve.
   */
  readonly validate?: (ctx: PluginValidateCtx) => void;

  /**
   * Produce the plugin's runtime value. The value lands on
   * `manifest.extensions[plugin.name]` and is forwarded to the provider
   * contributor below.
   */
  readonly onResolve?: (ctx: PluginResolveCtx) => TRuntime;

  /**
   * Contribute extra navigation items into the manifest. The returned items
   * are merged with module-contributed nav at `buildNavigationManifest`
   * time and participate in the same ordering / grouping logic.
   *
   * Plugins don't know the app's narrowed `TNavItem`, so the return type is
   * the structural `NavigationItemBase` bound — the assembly site widens.
   * Plugins that want to respect a host's narrowed nav-item shape should
   * accept a `buildNavItem` adapter in their own options (see
   * `journeysPlugin`'s typed factory).
   */
  readonly contributeNavigation?: (
    ctx: PluginNavigationCtx,
  ) => readonly NavigationItemBase[];

  /**
   * Contribute React providers to the provider stack. Applied after user
   * providers; first element is outermost.
   */
  readonly providers?: (
    ctx: PluginProvidersCtx<TRuntime>,
  ) => ComponentType<{ children: ReactNode }>[];
}

export interface PluginExtendCtx {
  /** Reserved. Plugins can call this when internal state changes. No-op today. */
  readonly markDirty: () => void;
}

export interface PluginValidateCtx {
  readonly modules: readonly ModuleDescriptor<any, any, any, any>[];
}

export interface PluginResolveCtx {
  readonly modules: readonly ModuleDescriptor<any, any, any, any>[];
  readonly moduleDescriptors: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  readonly debug: boolean;
}

export interface PluginNavigationCtx {
  readonly modules: readonly ModuleDescriptor<any, any, any, any>[];
}

export interface PluginProvidersCtx<TRuntime> {
  readonly runtime: TRuntime;
}

// -----------------------------------------------------------------------------
// Type helpers — derive registry extensions and manifest extension shape from
// a readonly tuple of plugins. `const`-generic inference on `createRegistry`
// lets the compiler see the exact tuple so these mapped types resolve to
// concrete keys / values.
// -----------------------------------------------------------------------------

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

/**
 * Intersection of every plugin's `extend` return value. Used to augment the
 * base `ModuleRegistry` type with plugin-contributed methods.
 */
export type PluginExtensionsOf<TPlugins extends readonly RegistryPlugin<string, any, any>[]> =
  TPlugins["length"] extends 0
    ? object
    : UnionToIntersection<
        TPlugins[number] extends RegistryPlugin<any, infer TExt, any> ? TExt : never
      >;

/**
 * Mapping of `plugin.name` → `plugin.onResolve` return type. Used to type
 * `manifest.extensions` so well-known plugins (e.g. `journeys`) land under
 * their documented key.
 */
export type PluginRuntimesOf<TPlugins extends readonly RegistryPlugin<string, any, any>[]> =
  TPlugins["length"] extends 0
    ? Record<string, never>
    : {
        [P in TPlugins[number] as P["name"]]: P extends RegistryPlugin<any, any, infer TRuntime>
          ? TRuntime
          : never;
      };
