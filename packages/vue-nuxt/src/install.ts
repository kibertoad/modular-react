import type { App, Plugin } from "vue";
import type { NavigationGuard, RouteRecordName, Router } from "vue-router";
import type {
  NavigationItem,
  NavigationItemBase,
  SlotMap,
  SlotMapOf,
} from "@modular-frontend/core";
import type { ApplicationManifest, ModuleExitEvent, ModuleRegistry } from "@modular-vue/runtime";

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
 * import { installModularApp } from "@modular-vue/nuxt";
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
 */
export function installModularApp<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = NavigationItem,
>(
  nuxtApp: NuxtAppLike,
  registry: ModuleRegistry<TSharedDependencies, TSlots, TNavItem, any>,
  options?: InstallModularAppOptions<TSharedDependencies, TSlots>,
): ApplicationManifest<TSlots, TNavItem> {
  const manifest = registry.resolve({
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
