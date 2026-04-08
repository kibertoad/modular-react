import type { StoreApi } from "zustand";
import type { Router } from "@tanstack/react-router";
import type {
  ReactiveService,
  SlotMap,
  SlotMapOf,
} from "@modular-react/core";

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
  /** The root React component with all providers wired */
  readonly App: React.ComponentType;
  /** The TanStack Router instance */
  readonly router: Router<any, any, any>;
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
