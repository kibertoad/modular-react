import type { App, Component, Plugin } from "vue";
import type { NavigationGuard, Router, RouteRecordName, RouteRecordRaw } from "vue-router";
import type {
  ModuleDescriptor,
  NavigationItem,
  NavigationItemBase,
  NavigationManifest,
  ModuleEntry,
  SlotMap,
  SlotMapOf,
} from "@modular-frontend/core";

// The registry config is framework-neutral — stores are `Store<T>` (the core
// contract satisfied by both zustand and `@modular-frontend/core`'s
// `createStore`), so vue-router reuses it directly rather than redeclaring a
// zustand-typed copy the way the React runtime does.
export type { RegistryConfig } from "@modular-frontend/core";

// Re-export shared runtime types from @modular-frontend/core.
export type { NavigationGroup, NavigationManifest, ModuleEntry } from "@modular-frontend/core";

/**
 * A module exit surfaced outside a journey host. Mirrors the React runtime's
 * `onModuleExit` event shape; carried on {@link ResolveManifestOptions} and
 * echoed back on {@link ResolvedManifest} for shells that wire module hosting
 * themselves.
 */
export interface ModuleExitEvent {
  readonly moduleId: string;
  readonly entry: string;
  readonly exit: string;
  readonly output: unknown;
  readonly tabId?: string;
}

/**
 * A vue-router navigation guard, as accepted by `router.beforeEach`. Re-exported
 * so shells can type their auth guard without importing vue-router directly.
 */
export type { NavigationGuard };

/**
 * Options for the router-owning {@link import("./registry.js").ModuleRegistry.resolve}.
 *
 * The host creates the router (`createRouter({ history, routes })`) and passes
 * it in; the runtime grafts every module's `createRoutes()` subtree onto it via
 * `router.addRoute()`, installs the optional auth guard, and returns an
 * installable manifest.
 */
export interface ResolveOptions<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
> {
  /**
   * The vue-router instance the app already created. Module routes are grafted
   * onto it; the same instance is returned on the manifest.
   */
  router: Router;

  /**
   * Name of an already-registered parent route to graft module routes under
   * (via `router.addRoute(parentName, route)`). Use this to place all module
   * routes inside an auth boundary or a shared layout route. When omitted,
   * module routes are added at the top level.
   */
  parentRouteName?: RouteRecordName;

  /**
   * Auth (or observability) guard installed with `router.beforeEach`. Reads
   * `to.meta` — the vue-router channel modules populate via their `RouteMeta`
   * convention — to decide access. vue-router's native guard is more idiomatic
   * than either React equivalent, so the runtime just forwards it.
   */
  authGuard?: NavigationGuard;

  /**
   * Extra Vue plugins installed on the app after the modular contexts, so they
   * can depend on them. First element is installed first. The Vue analog of the
   * React runtime's `providers` array.
   */
  providers?: Plugin[];

  /**
   * Global filter applied to the fully resolved slot manifest (static + dynamic)
   * on every `recalculateSlots()` call.
   */
  slotFilter?: (slots: TSlots, deps: TSharedDependencies) => TSlots;

  /**
   * Called when a module emits an exit outside a journey host. Surfaced back on
   * {@link ApplicationManifest.onModuleExit}.
   */
  onModuleExit?: (event: ModuleExitEvent) => void;
}

/**
 * Result of the router-owning {@link import("./registry.js").ModuleRegistry.resolve}.
 *
 * Itself a Vue plugin (`app.use(manifest)` installs the modular contexts), plus
 * the router with module routes grafted and the resolved navigation / slots /
 * modules surface. The analog of the React `ApplicationManifest`, whose `App`
 * component becomes an installable plugin here because the Vue app root is the
 * user's own component rendering `<router-view>`.
 */
export interface ApplicationManifest<
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = NavigationItem,
  TExtensions extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Vue plugin install hook — the manifest is itself installable, so
   * `app.use(manifest)` wires the modular contexts (and any `providers`).
   */
  readonly install: (app: App) => void;

  /** The vue-router instance passed to `resolve()`, with module routes grafted. */
  readonly router: Router;

  /**
   * Auto-generated navigation manifest from all modules (plus any
   * plugin-contributed items). Typed by the registry's `TNavItem` generic.
   */
  readonly navigation: NavigationManifest<TNavItem>;

  /** Collected slot contributions from all modules (static base — does not include dynamic). */
  readonly slots: TSlots;

  /** Registered module summaries — use `useModules()` to access in components. */
  readonly modules: readonly ModuleEntry[];

  /** Full module descriptors keyed by id (see {@link ResolvedManifest.moduleDescriptors}). */
  readonly moduleDescriptors: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;

  /**
   * Plugin-contributed runtimes keyed by plugin name. Typed via the
   * `TExtensions` generic so well-known keys (e.g. `journeys`) surface with
   * their runtime type when the plugin is loaded.
   */
  readonly extensions: TExtensions;

  /**
   * Convenience alias — `manifest.extensions.journeys` surfaced as
   * `manifest.journeys` when the journeys plugin is loaded. `never` when the
   * plugin is absent.
   */
  readonly journeys: TExtensions extends { journeys: infer R } ? R : never;

  /** Resolved `onModuleExit` callback — echoed back for shells that host modules themselves. */
  readonly onModuleExit?: (event: ModuleExitEvent) => void;

  /** Trigger re-evaluation of dynamic slots. See {@link ResolvedManifest.recalculateSlots}. */
  readonly recalculateSlots: () => void;
}

/**
 * Options for the framework-mode {@link import("./registry.js").ModuleRegistry.resolveManifest}.
 *
 * The host owns the router, so route-structure options (`router`,
 * `parentRouteName`, `authGuard`) live on {@link ResolveOptions} instead. The
 * options honored here shape the resolved data and the `Providers` wrapper:
 * `providers` (Vue components wrapped around the context stack), `slotFilter`
 * (also decides whether `recalculateSlots` is a no-op), and `onModuleExit`
 * (echoed back on the manifest).
 */
export interface ResolveManifestOptions<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
> {
  /**
   * Vue components wrapped around the `Providers` context stack. First element
   * is outermost — e.g. `[I18nProvider, QueryProvider]` wraps as
   * `<I18nProvider><QueryProvider>…</QueryProvider></I18nProvider>`.
   */
  providers?: Component[];

  /**
   * Global filter applied to the fully resolved slot manifest (static + dynamic)
   * on every `recalculateSlots()` call. Its presence also makes
   * `recalculateSlots` a live notifier rather than a no-op.
   */
  slotFilter?: (slots: TSlots, deps: TSharedDependencies) => TSlots;

  /**
   * Called when a module emits an exit outside a journey host. The shell
   * typically uses this to close the tab, invoke navigation, or forward to
   * analytics. Surfaced back on {@link ResolvedManifest.onModuleExit}.
   */
  onModuleExit?: (event: ModuleExitEvent) => void;
}

/**
 * Result of {@link import("./registry.js").ModuleRegistry.resolveManifest} —
 * the framework-mode assembly output. Gives you a `Providers` component that
 * wraps the full context stack, the eager module `routes` the host spreads into
 * its own `createRouter`, the navigation manifest, resolved slots, module
 * entries + descriptors, plugin extensions, and the `recalculateSlots` trigger.
 * Does NOT create or own a router.
 *
 * Use this when your host owns routing (it created the vue-router instance and
 * controls the route table). For the library-owns-the-router path, use
 * {@link import("./registry.js").ModuleRegistry.resolve} instead, which grafts
 * routes via `router.addRoute()` and returns an installable manifest.
 */
export interface ResolvedManifest<
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = NavigationItem,
  TExtensions extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Context provider component — provides SharedDependencies, Navigation,
   * Slots, Modules, RecalculateSlots (and any user-supplied provider
   * components) to its default slot. Wrap it around your `<router-view>`.
   */
  readonly Providers: Component;

  /**
   * Eager module route records contributed via `createRoutes()`, for the host
   * to spread into its own `createRouter({ routes })`. Empty array when no
   * module declares routes.
   *
   * Lazy modules are not included here: grafting a lazy subtree needs a router
   * reference, which only the router-owning `resolve()` has. Register lazy
   * modules through `resolve()` if you need them wired.
   *
   * Typed `readonly` because the cached manifest is shared by reference across
   * callsites; clone (`[...manifest.routes]`) before mutating.
   */
  readonly routes: readonly RouteRecordRaw[];

  /**
   * Auto-generated navigation manifest from all modules (plus any
   * plugin-contributed items). Typed by the registry's `TNavItem` generic.
   */
  readonly navigation: NavigationManifest<TNavItem>;

  /** Collected slot contributions from all modules (static base — does not include dynamic). */
  readonly slots: TSlots;

  /** Registered module summaries — use `useModules()` to access in components. */
  readonly modules: readonly ModuleEntry[];

  /**
   * Full module descriptors keyed by id. Required by the journey/composition
   * outlets (PR-31/PR-34) to resolve `entryPoints[name].component`. The plain
   * `modules` array exposes only summary info; this map carries the
   * descriptors themselves.
   */
  readonly moduleDescriptors: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;

  /**
   * Plugin-contributed runtimes keyed by plugin name. Typed via the
   * `TExtensions` generic so well-known keys (e.g. `journeys`, once the Vue
   * journeys plugin lands in PR-30/PR-32) surface with their runtime type.
   * Plugins that aren't loaded do not appear here.
   */
  readonly extensions: TExtensions;

  /**
   * Convenience alias — `manifest.extensions.journeys` surfaced as
   * `manifest.journeys` when the journeys plugin is loaded. `never` when the
   * plugin is absent, so reading it produces a compile error instead of a
   * surprise `undefined`.
   */
  readonly journeys: TExtensions extends { journeys: infer R } ? R : never;

  /**
   * Resolved `onModuleExit` callback — echoed back for shells that host
   * modules themselves and want to forward to the configured handler.
   */
  readonly onModuleExit?: (event: ModuleExitEvent) => void;

  /**
   * Trigger re-evaluation of dynamic slots.
   *
   * Call this after a state change that affects `dynamicSlots` or `slotFilter`
   * results — for example after login, role change, or feature flag update.
   * Components consuming `useSlots()` re-render with the new values.
   *
   * No-op when no module uses `dynamicSlots` and no `slotFilter` is configured.
   */
  readonly recalculateSlots: () => void;
}
