import type { Store } from "./store.js";
import type { ModuleDescriptor, NavigationItem, ReactiveService, SlotMap, SlotMapOf } from "./types.js";

/**
 * Configuration for creating a registry.
 *
 * Three dependency buckets:
 * - **stores** — Store instances (reactive, supports selectors). Works with zustand StoreApi or the built-in createStore.
 * - **services** — plain objects (non-reactive, static references)
 * - **reactiveServices** — external sources with subscribe/getSnapshot (reactive via useSyncExternalStore)
 */
export interface RegistryConfig<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
> {
  /** Reactive stores — state you own and mutate. Accepts zustand StoreApi or @modular-react/core createStore. */
  stores?: {
    [K in keyof TSharedDependencies]?: Store<TSharedDependencies[K]>;
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

/**
 * Build a flat deps snapshot from a RegistryConfig.
 * For stores, reads current state via getState().
 * For reactive services, reads current snapshot via getSnapshot().
 * Services are passed through directly.
 */
export function buildDepsSnapshot<TSharedDependencies extends Record<string, any>>(
  config: RegistryConfig<TSharedDependencies, any>,
): TSharedDependencies {
  const deps: Record<string, unknown> = {};

  if (config.stores) {
    for (const [key, store] of Object.entries(config.stores)) {
      if (store) {
        deps[key] = (store as Store<unknown>).getState();
      }
    }
  }
  if (config.services) {
    for (const [key, service] of Object.entries(config.services)) {
      if (service !== undefined) deps[key] = service;
    }
  }
  if (config.reactiveServices) {
    for (const [key, rs] of Object.entries(config.reactiveServices)) {
      if (rs) {
        deps[key] = (rs as ReactiveService<unknown>).getSnapshot();
      }
    }
  }

  return deps as TSharedDependencies;
}

/**
 * Run onRegister lifecycle hooks for all modules, wrapping errors
 * with the module ID for easier debugging.
 */
export function runLifecycleHooks<TSharedDependencies extends Record<string, any>>(
  modules: readonly ModuleDescriptor<TSharedDependencies>[],
  deps: TSharedDependencies,
): void {
  for (const mod of modules) {
    try {
      mod.lifecycle?.onRegister?.(deps);
    } catch (err) {
      throw new Error(
        `[@modular-react/core] Module "${mod.id}" lifecycle.onRegister() failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }
}
