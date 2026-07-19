import type {
  NavigationItem,
  NavigationItemBase,
  RegistryPlugin,
  SlotMap,
  SlotMapOf,
} from "@modular-frontend/core";
import type { ModuleRegistry } from "./registry.js";
import type { ApplicationManifest, ResolveOptions } from "./types.js";

/**
 * A registry whose `resolve()` return exposes its plugin-extension map as an
 * inferable `TExtensions`. The registry's plugin *tuple* can't be recovered by
 * inference — it hides behind `PluginRuntimesOf<TPlugins>` — but the resolved
 * extensions ride plainly on {@link ApplicationManifest}'s third type argument,
 * so matching the `resolve` return recovers them. This is what lets an installer
 * wrapper — {@link createModularApp} here, `installModularApp` in
 * `@modular-vue/nuxt` — hand back a manifest that keeps `extensions.journeys`
 * (and the `manifest.journeys` alias) typed against the plugin's runtime rather
 * than collapsing to `Record<string, unknown>` / `unknown`.
 *
 * The plugin position is left as the wide constraint (`readonly RegistryPlugin[]`)
 * so any registry — plugin-carrying or not — satisfies it; the concrete
 * extension shape flows through `TExtensions` off the `resolve` signature. The
 * base `resolve` is `Omit`ted and re-declared so this is the single call
 * signature — `TExtensions` is then inferred, and a wrapper's `registry.resolve()`
 * returns it, unambiguously (no intersection-overload ordering to pick the wide
 * base return).
 *
 * Exported so the Nuxt installer (and any downstream installer wrapper) shares
 * this one definition rather than re-declaring it.
 */
export type InstallableRegistry<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots>,
  TNavItem extends NavigationItemBase,
  TExtensions extends Record<string, unknown>,
> = Omit<
  ModuleRegistry<
    TSharedDependencies,
    TSlots,
    TNavItem,
    readonly RegistryPlugin<string, any, any>[]
  >,
  "resolve"
> & {
  resolve(
    options: ResolveOptions<TSharedDependencies, TSlots>,
  ): ApplicationManifest<TSlots, TNavItem, TExtensions>;
};

/**
 * Resolves a registry and returns its application manifest — a Vue plugin that
 * installs the modular contexts, plus the router (with module routes grafted)
 * and the resolved navigation / slots / modules surface.
 *
 * The manifest is itself installable, so the common wiring is one line:
 *
 * ```ts
 * const router = createRouter({ history: createWebHistory(), routes: shellRoutes })
 * const app = createApp(RootComponent)
 * app.use(router)
 * app.use(createModularApp(registry, { router }))
 * app.mount('#app')
 * ```
 *
 * Thin convenience over {@link ModuleRegistry.resolve}; call `registry.resolve`
 * directly if you need to name the manifest before installing it.
 *
 * Plugin extensions survive: the manifest's `TExtensions` is inferred from the
 * registry's `resolve()` return, so `manifest.extensions.journeys` /
 * `manifest.journeys` stay typed against the plugin runtime when the registry
 * carries `journeysPlugin()` — no cast. See {@link InstallableRegistry}.
 */
export function createModularApp<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = NavigationItem,
  TExtensions extends Record<string, unknown> = Record<string, unknown>,
>(
  registry: InstallableRegistry<TSharedDependencies, TSlots, TNavItem, TExtensions>,
  options: ResolveOptions<TSharedDependencies, TSlots>,
): ApplicationManifest<TSlots, TNavItem, TExtensions> {
  return registry.resolve(options);
}
