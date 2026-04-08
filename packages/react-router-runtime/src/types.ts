import type { StoreApi } from "zustand";
import type { DataRouter } from "react-router";
import type {
  NavigationItem,
  ReactiveService,
  SlotMap,
  SlotMapOf,
} from "@react-router-modules/core";

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

export interface NavigationGroup {
  readonly group: string;
  readonly items: readonly NavigationItem[];
}

export interface NavigationManifest {
  /** All navigation items flat */
  readonly items: readonly NavigationItem[];
  /** Items grouped by their group key, sorted by order within each group */
  readonly groups: readonly NavigationGroup[];
  /** Ungrouped items (no group key) */
  readonly ungrouped: readonly NavigationItem[];
}

/**
 * A summary of a registered module exposed to the shell.
 * Includes the module's identity, metadata, and optional component.
 */
export interface ModuleEntry {
  /** Unique module identifier */
  readonly id: string;
  /** SemVer version string */
  readonly version: string;
  /** Catalog metadata (description, icon, category, etc.) */
  readonly meta?: Readonly<Record<string, unknown>>;
  /** A React component the shell can render outside of routes */
  readonly component?: React.ComponentType<any>;
  /** Zone components contributed when this module is active in a workspace tab */
  readonly zones?: Readonly<Record<string, React.ComponentType<any>>>;
}

export interface ApplicationManifest<TSlots extends SlotMapOf<TSlots> = SlotMap> {
  /** The root React component with all providers wired */
  readonly App: React.ComponentType;
  /** The React Router instance — pass to <RouterProvider /> if needed */
  readonly router: DataRouter;
  /** Auto-generated navigation manifest from all modules */
  readonly navigation: NavigationManifest;
  /** Collected slot contributions from all modules (static base — does not include dynamic) */
  readonly slots: TSlots;
  /** Registered module summaries — use useModules() to access in components */
  readonly modules: readonly ModuleEntry[];

  /**
   * Trigger re-evaluation of dynamic slots.
   *
   * Call this after a state change that affects `dynamicSlots` or `slotFilter`
   * results — for example after login, role change, or feature flag update.
   * Components consuming `useSlots()` will re-render with the new values.
   *
   * No-op when no module uses `dynamicSlots` and no `slotFilter` is configured.
   *
   * @example
   * ```ts
   * const { App, recalculateSlots } = registry.resolve({ ... })
   *
   * // After login completes:
   * await authStore.getState().login(credentials)
   * recalculateSlots()
   * ```
   */
  readonly recalculateSlots: () => void;
}
