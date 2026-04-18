import type { StoreApi } from "zustand";
import type { Router } from "@tanstack/react-router";
import type { NavigationItem, ReactiveService, SlotMap, SlotMapOf } from "@modular-react/core";

// Re-export shared runtime types from @modular-react/core
export type { NavigationGroup, NavigationManifest, ModuleEntry } from "@modular-react/core";

/**
 * Configuration for creating a registry.
 *
 * Three dependency buckets:
 * - **stores** — zustand StoreApi instances (reactive, supports selectors)
 * - **services** — plain objects (non-reactive, static references)
 * - **reactiveServices** — external sources with subscribe/getSnapshot (reactive via useSyncExternalStore)
 */
export interface RegistryConfig<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
> {
  /** Zustand stores — state you own and mutate */
  stores?: {
    [K in keyof TSharedDependencies]?: StoreApi<TSharedDependencies[K]>;
  };

  /** Plain services — static utilities (http client, auth, workspace actions) */
  services?: {
    [K in keyof TSharedDependencies]?: TSharedDependencies[K];
  };

  /** Reactive external sources — things you subscribe to but don't control (call adapters, presence, websockets) */
  reactiveServices?: {
    [K in keyof TSharedDependencies]?: ReactiveService<TSharedDependencies[K]>;
  };

  /**
   * Default slot values. Every key defined here is guaranteed to exist
   * in the resolved slots manifest, even if no module contributes to it.
   * Module contributions are appended to these defaults.
   */
  slots?: { [K in keyof TSlots]?: TSlots[K] };
}

export interface ApplicationManifest<
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItem = NavigationItem,
> {
  /** The root React component with all providers wired */
  readonly App: React.ComponentType;
  /** The TanStack Router instance */
  readonly router: Router<any, any, any>;
  /**
   * Auto-generated navigation manifest from all modules. Typed by the
   * registry's `TNavItem` generic — if you call
   * `createRegistry<AppDeps, AppSlots, AppNavItem>()`, every item here
   * carries the typed labels / dynamic-href context / meta you declared.
   */
  readonly navigation: import("@modular-react/core").NavigationManifest<TNavItem>;
  /** Collected slot contributions from all modules (static base — does not include dynamic) */
  readonly slots: TSlots;
  /** Registered module summaries — use useModules() to access in components */
  readonly modules: readonly import("@modular-react/core").ModuleEntry[];

  /**
   * Trigger re-evaluation of dynamic slots.
   *
   * Call this after a state change that affects `dynamicSlots` or `slotFilter`
   * results — for example after login, role change, or feature flag update.
   * Components consuming `useSlots()` will re-render with the new values.
   *
   * **No-op when no module uses `dynamicSlots` and no `slotFilter` is
   * configured.** Subscribing a store to this when nothing in the registry
   * is dynamic is harmless but pointless — wire the subscription only when
   * there's actually a dynamic contribution to recompute.
   */
  readonly recalculateSlots: () => void;
}

/**
 * Options for {@link ModuleRegistry.resolveManifest}.
 *
 * Framework-mode integrations (TanStack Router file-based mode with
 * `@tanstack/router-plugin`, or TanStack Start) consume `resolveManifest()`
 * — the host owns the router and the route tree, so route-structure options
 * accepted by `resolve()` (`rootComponent`, `indexComponent`,
 * `notFoundComponent`, `authenticatedRoute`, `shellRoutes`, `rootRoute`,
 * `beforeLoad`) are not available here. Declare those shapes in your
 * `__root.tsx` and route files instead.
 */
export interface ResolveManifestOptions<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
> {
  /**
   * Additional React providers to wrap around the app tree.
   * First element is outermost — e.g. `[I18nProvider, QueryClientProvider]`
   * wraps as `<I18nProvider><QueryClientProvider>...</QueryClientProvider></I18nProvider>`.
   */
  providers?: React.ComponentType<{ children: React.ReactNode }>[];

  /**
   * Global filter applied to the fully resolved slot manifest (static + dynamic)
   * on every `recalculateSlots()` call.
   */
  slotFilter?: (slots: TSlots, deps: TSharedDependencies) => TSlots;
}

/**
 * Result of {@link ModuleRegistry.resolveManifest} — the framework-mode
 * assembly output. Gives you the context provider stack, the navigation
 * manifest, resolved slots, module entries, and a recalculate signal. Does
 * NOT create or own a router.
 *
 * Use this when your host owns routing — e.g. TanStack Router file-based
 * mode with `@tanstack/router-plugin` (generated `routeTree.gen.ts`) or
 * TanStack Start, where the host calls `createRouter({ routeTree })` and
 * the framework owns route discovery and type generation.
 *
 * Typical usage:
 *
 * ```ts
 * // registry.ts
 * export const registry = createRegistry({...})
 * registry.register(portalModule)
 * export const manifest = registry.resolveManifest({ providers: [I18nProvider] })
 *
 * // routes/__root.tsx
 * import { manifest } from '../registry'
 * export const Route = createRootRoute({
 *   component: () => (
 *     <manifest.Providers>
 *       <Outlet />
 *     </manifest.Providers>
 *   ),
 * })
 * ```
 *
 * ## No `routes` field
 *
 * Unlike the React Router counterpart, the TanStack resolved manifest does
 * not include a `routes` array. TanStack module `createRoutes(parentRoute)`
 * produces an `AnyRoute` whose parent is bound at construction time — it
 * cannot be spread into a host's already-composed file-based tree. In
 * framework mode, put module route files on disk alongside other routes and
 * let the plugin compose them. Modules continue to contribute navigation,
 * slots, zones, and lifecycle hooks as usual.
 *
 * If a module declares `createRoutes` and the host calls `resolveManifest()`,
 * the declaration is silently ignored — modules can be written once and
 * work under either `resolve()` (library-owned router) or `resolveManifest()`
 * (host-owned router) depending on how the app consumes them.
 *
 * ## Lazy modules are not supported in framework mode
 *
 * {@link ModuleRegistry.registerLazy} produces a catch-all route under a
 * parent — there is no parent in framework mode (the host owns composition),
 * so a registry that has any lazy modules registered will throw on
 * `resolveManifest()`. Either register the module eagerly (the load-time
 * benefit is minimal once Vite code-splitting is in play), or switch to
 * `resolve()` for the library-owned router path.
 */
export interface ResolvedManifest<
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItem = NavigationItem,
> {
  /**
   * Context provider component — wraps children with SharedDependencies,
   * Navigation, Slots, Modules, RecalculateSlots, and any user-supplied
   * providers. Place around `<Outlet />` in your `__root.tsx` layout.
   */
  readonly Providers: React.ComponentType<{ children: React.ReactNode }>;

  /**
   * Auto-generated navigation manifest from all modules. Typed by the
   * registry's `TNavItem` generic.
   */
  readonly navigation: import("@modular-react/core").NavigationManifest<TNavItem>;

  /** Collected slot contributions from all modules (static base — does not include dynamic) */
  readonly slots: TSlots;

  /** Registered module summaries — use useModules() to access in components */
  readonly modules: readonly import("@modular-react/core").ModuleEntry[];

  /**
   * Trigger re-evaluation of dynamic slots. See {@link ApplicationManifest.recalculateSlots}.
   */
  readonly recalculateSlots: () => void;
}
