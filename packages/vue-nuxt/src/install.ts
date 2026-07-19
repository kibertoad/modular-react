import type { App, Plugin } from "vue";
import type { NavigationGuard, RouteRecordName, Router } from "vue-router";
import type {
  NavigationItem,
  NavigationItemBase,
  RegistryPlugin,
  SlotMap,
  SlotMapOf,
} from "@modular-frontend/core";
import type {
  ApplicationManifest,
  ModuleExitEvent,
  ModuleRegistry,
  ResolveOptions,
} from "@modular-vue/runtime";

/**
 * The minimal slice of Nuxt's `NuxtApp` the installer needs: the Vue app to
 * install the modular contexts on, and the vue-router instance Nuxt created to
 * graft module routes onto.
 *
 * Kept structural on purpose — a real `NuxtApp` satisfies it, but the package
 * takes no `nuxt` / `@nuxt/schema` runtime dependency for this path, so the
 * installer stays unit-testable against a plain `createApp()` + `createRouter()`
 * pair (no Nuxt build needed).
 */
export interface NuxtAppLike {
  /** The Nuxt Vue application — `nuxtApp.vueApp`. */
  vueApp: App;
  /** The vue-router instance Nuxt created — `nuxtApp.$router`. */
  $router: Router;
}

/**
 * Options for {@link installModularApp}. A subset of the runtime's
 * `ResolveOptions`: the `router` is taken from the Nuxt app rather than passed
 * in, and everything else is forwarded to `registry.resolve()`.
 */
export interface InstallModularAppOptions<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
> {
  /**
   * Name of an already-registered parent route to graft module routes under
   * (via `router.addRoute(parentName, route)`). Point this at a Nuxt page that
   * owns the shell layout to place all module routes inside it; omit to add
   * module routes at the top level.
   */
  parentRouteName?: RouteRecordName;

  /**
   * Auth (or observability) guard installed with `router.beforeEach` on Nuxt's
   * router. Reads `to.meta` — the vue-router channel modules populate via their
   * `RouteMeta` convention.
   */
  authGuard?: NavigationGuard;

  /**
   * Extra Vue plugins installed on the Nuxt Vue app after the modular contexts,
   * so they can depend on them. First element is installed first.
   */
  providers?: Plugin[];

  /**
   * Global filter applied to the fully resolved slot manifest (static +
   * dynamic) on every `recalculateSlots()` call.
   */
  slotFilter?: (slots: TSlots, deps: TSharedDependencies) => TSlots;

  /** Called when a module emits an exit outside a journey host. */
  onModuleExit?: (event: ModuleExitEvent) => void;
}

/**
 * A registry whose `resolve()` return exposes its plugin-extension map as an
 * inferable `TExtensions`. The extensions ride on {@link ApplicationManifest}'s
 * third type argument, which — unlike the registry's opaque plugin tuple, buried
 * behind `PluginRuntimesOf<TPlugins>` and not recoverable by inference — TS can
 * recover by structurally matching the `resolve` return. This is what lets
 * {@link installModularApp} hand back a manifest that keeps `extensions.journeys`
 * (and the `manifest.journeys` alias) typed against the plugin's runtime instead
 * of collapsing to `Record<string, unknown>` / `unknown`.
 *
 * The plugin position is left as the wide constraint (`readonly RegistryPlugin[]`)
 * so any registry — plugin-carrying or not — satisfies it; the concrete
 * extension shape flows through `TExtensions` off the `resolve` signature.
 */
type InstallableRegistry<
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
  // `resolve` is re-declared (base signature omitted) so it is the *single*
  // call signature here: `TExtensions` is inferred from — and the body's
  // `registry.resolve()` returns — this manifest type unambiguously, with no
  // intersection-overload ordering to pick the wide base return.
  resolve(
    options: ResolveOptions<TSharedDependencies, TSlots>,
  ): ApplicationManifest<TSlots, TNavItem, TExtensions>;
};

/**
 * Wire a `@modular-vue` registry into a Nuxt app from inside a Nuxt plugin.
 *
 * Nuxt owns the Vue app and the vue-router instance, so this is the
 * router-owning integration: it grafts every module's `createRoutes()` subtree
 * onto `nuxtApp.$router` via `router.addRoute()`, installs the optional auth
 * guard, and installs the resolved manifest (the modular contexts — shared
 * deps, navigation, slots, modules) app-wide on `nuxtApp.vueApp`. The manifest
 * is returned so the caller can expose it (e.g. `return { provide: { modular:
 * manifest } }`) and drive `recalculateSlots()`.
 *
 * ```ts
 * // plugins/modular-vue.ts
 * import { installModularApp } from "@modular-vue/nuxt/runtime";
 * import { buildRegistry } from "~/modular/registry";
 *
 * export default defineNuxtPlugin((nuxtApp) => {
 *   // Build the registry PER REQUEST so server-side state never leaks between
 *   // requests, and so the single-use resolve() runs once per Nuxt app.
 *   const registry = buildRegistry();
 *   const manifest = installModularApp(nuxtApp, registry, { parentRouteName: "app" });
 *   return { provide: { modular: manifest } };
 * });
 * ```
 *
 * Under SSR a fresh Nuxt app (and router) is created per request, so the
 * registry must be built per request too — `registry.resolve()` is single-use,
 * and a module-level singleton registry would throw on the second request. For
 * a client-only app (`ssr: false`) a singleton is fine because the plugin runs
 * once.
 *
 * **Plugin extensions survive.** The manifest's extension map (`TExtensions`) is
 * inferred from the registry's `resolve()` return, so the returned manifest keeps
 * `extensions.journeys: JourneyRuntime` — and the `manifest.journeys` convenience
 * alias — with no cast when the registry carries `journeysPlugin()`. A registry
 * with no plugins yields an empty extension map, exactly as before. (The plugin
 * *tuple* itself can't be recovered by inference — it hides behind
 * `PluginRuntimesOf<TPlugins>` — so the extensions are read off the manifest,
 * where they sit plainly; see {@link InstallableRegistry}.)
 *
 * **Typing `manifest` under `defineNuxtPlugin`.** Returning
 * `{ provide: { modular: manifest } }` makes Nuxt infer the plugin's provide
 * types from `manifest`. When the manifest carries a large plugin runtime (e.g.
 * the journeys runtime), that structural inference can trip TypeScript's
 * self-reference guard (TS7022, "referenced directly or indirectly in its own
 * initializer"). Annotate the binding to break the cycle — the precise type is
 * now nameable thanks to the `TPlugins` threading above:
 *
 * ```ts
 * import type { ApplicationManifest } from "@modular-vue/nuxt/runtime";
 * const manifest: ApplicationManifest<AppSlots, AppNavItem, { journeys: JourneyRuntime }> =
 *   installModularApp(nuxtApp, registry);
 * return { provide: { modular: manifest } };
 * ```
 */
export function installModularApp<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = NavigationItem,
  TExtensions extends Record<string, unknown> = Record<string, unknown>,
>(
  nuxtApp: NuxtAppLike,
  registry: InstallableRegistry<TSharedDependencies, TSlots, TNavItem, TExtensions>,
  options?: InstallModularAppOptions<TSharedDependencies, TSlots>,
): ApplicationManifest<TSlots, TNavItem, TExtensions> {
  const manifest: ApplicationManifest<TSlots, TNavItem, TExtensions> = registry.resolve({
    router: nuxtApp.$router,
    parentRouteName: options?.parentRouteName,
    authGuard: options?.authGuard,
    providers: options?.providers,
    slotFilter: options?.slotFilter,
    onModuleExit: options?.onModuleExit,
  });

  // Install the modular contexts app-wide. `resolve()` already grafted the
  // routes onto nuxtApp.$router above; the manifest is itself a Vue plugin.
  nuxtApp.vueApp.use(manifest);

  return manifest;
}
