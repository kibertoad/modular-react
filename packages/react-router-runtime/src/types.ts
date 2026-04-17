import type { StoreApi } from "zustand";
import type { DataRouter, RouteObject } from "react-router";
import type { ReactiveService, SlotMap, SlotMapOf } from "@modular-react/core";

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

export interface ApplicationManifest<TSlots extends SlotMapOf<TSlots> = SlotMap> {
  /** The root React component with all providers wired, including `<RouterProvider />` */
  readonly App: React.ComponentType;
  /** The React Router instance — pass to <RouterProvider /> if needed */
  readonly router: DataRouter;
  /** Auto-generated navigation manifest from all modules */
  readonly navigation: import("@modular-react/core").NavigationManifest;
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
   * No-op when no module uses `dynamicSlots` and no `slotFilter` is configured.
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
export interface ResolvedManifest<TSlots extends SlotMapOf<TSlots> = SlotMap> {
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
   */
  readonly routes: RouteObject[];

  /** Auto-generated navigation manifest from all modules */
  readonly navigation: import("@modular-react/core").NavigationManifest;

  /** Collected slot contributions from all modules (static base — does not include dynamic) */
  readonly slots: TSlots;

  /** Registered module summaries — use useModules() to access in components */
  readonly modules: readonly import("@modular-react/core").ModuleEntry[];

  /**
   * Trigger re-evaluation of dynamic slots. See {@link ApplicationManifest.recalculateSlots}.
   */
  readonly recalculateSlots: () => void;
}

