import type { StoreApi } from "zustand";
import type { DataRouter, RouteObject } from "react-router";
import type {
  ModuleDescriptor,
  NavigationItem,
  NavigationItemBase,
  ReactiveService,
  SlotMap,
  SlotMapOf,
} from "@modular-react/core";
import type { JourneyRuntime } from "@modular-react/journeys";

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
  TNavItem extends NavigationItemBase = NavigationItem,
> {
  /** The root React component with all providers wired, including `<RouterProvider />` */
  readonly App: React.ComponentType;
  /** The React Router instance — pass to <RouterProvider /> if needed */
  readonly router: DataRouter;
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

  /** Full module descriptors keyed by id (see {@link ResolvedManifest.moduleDescriptors}). */
  readonly moduleDescriptors: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;

  /** Journey runtime — see {@link ResolvedManifest.journeys}. */
  readonly journeys: JourneyRuntime | null;

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
 * Framework-mode integrations (React Router v7 with `@react-router/dev/vite`,
 * etc.) consume `resolveManifest()` — the host owns the router, so
 * route-structure options accepted by `resolve()` (`rootComponent`,
 * `indexComponent`, `notFoundComponent`, `authenticatedRoute`, `shellRoutes`,
 * `rootRoute`) are not available here. Declare those shapes in your
 * `routes.ts` instead.
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

  /**
   * Called when a module emits an exit outside a journey host (the default
   * `<ModuleTab>` path). The shell typically uses this to close the tab,
   * invoke navigation, or forward to analytics.
   */
  onModuleExit?: (event: {
    readonly moduleId: string;
    readonly entry: string;
    readonly exit: string;
    readonly output: unknown;
    readonly tabId?: string;
  }) => void;
}

/**
 * Result of {@link ModuleRegistry.resolveManifest} — the framework-mode
 * assembly output. Gives you the context provider stack, the navigation
 * manifest, resolved slots, module entries, and optionally any routes that
 * modules contributed via `createRoutes()`. Does NOT create or own a router.
 *
 * Use this when your host owns routing — e.g. React Router v7 framework mode
 * with `@react-router/dev/vite`, where routes live in `app/routes.ts` and the
 * Vite plugin bootstraps the router.
 *
 * Typical usage:
 *
 * ```ts
 * // registry.ts
 * export const registry = createRegistry({...})
 * registry.register(portalModule)
 * export const manifest = registry.resolveManifest({ providers: [I18nProvider] })
 *
 * // app/root.tsx
 * import { manifest } from './registry'
 * export default function Root() {
 *   return <manifest.Providers><Outlet /></manifest.Providers>
 * }
 *
 * // app/routes.ts (if modules contribute routes)
 * import { manifest } from './registry'
 * export default [...flatRoutes(), ...manifest.routes] satisfies RouteConfig
 * ```
 */
export interface ResolvedManifest<
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = NavigationItem,
> {
  /**
   * Context provider component — wraps children with SharedDependencies,
   * Navigation, Slots, Modules, RecalculateSlots, and any user-supplied
   * providers. Place around `<Outlet />` in your root layout.
   */
  readonly Providers: React.ComponentType<{ children: React.ReactNode }>;

  /**
   * Route objects contributed by modules via `createRoutes()`.
   *
   * Empty array if no module declares routes (the common case for framework
   * mode, where route shape lives in `routes.ts` and modules only contribute
   * navigation/slots/zones/lifecycle). Host decides how to consume — e.g.
   * spread into `routes.ts` default export, mount under a catch-all, etc.
   *
   * Typed `readonly RouteObject[]` because the cached manifest is shared by
   * reference across callsites (routes.ts + root.tsx). Don't push into the
   * array or mutate its entries — clone (`[...manifest.routes]`) if you
   * need a mutable list. The library doesn't `Object.freeze` at runtime;
   * the `readonly` type is the contract, matching what React Router /
   * TanStack / Redux-in-prod do for returned-structure protection.
   */
  readonly routes: readonly RouteObject[];

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
   * Full module descriptors keyed by id — required by `<JourneyOutlet>` and
   * `<ModuleTab>` to resolve `entryPoints[name].component`. The plain
   * `modules` array exposes only summary info; this map carries the
   * descriptors themselves.
   */
  readonly moduleDescriptors: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;

  /**
   * Journey runtime owning every registered journey instance. `null` when
   * no journey was registered, so apps that don't use journeys pay no
   * runtime cost beyond the package being statically linked.
   */
  readonly journeys: JourneyRuntime | null;

  /**
   * Resolved `onModuleExit` callback — surfaced for shells that wire
   * `<ModuleTab>` themselves and want to forward to the configured handler.
   */
  readonly onModuleExit?: (event: {
    readonly moduleId: string;
    readonly entry: string;
    readonly exit: string;
    readonly output: unknown;
    readonly tabId?: string;
  }) => void;

  /**
   * Trigger re-evaluation of dynamic slots. See {@link ApplicationManifest.recalculateSlots}.
   */
  readonly recalculateSlots: () => void;
}
