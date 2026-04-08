import { createContext, useContext, useSyncExternalStore } from "react";
import { useStore as useZustandStore } from "zustand";
import type { StoreApi } from "zustand";
import type { ReactiveService } from "./types.js";

/**
 * Internal context that holds the resolved shared dependencies.
 * The registry's App component provides this at the root.
 */

interface SharedDependenciesContextValue {
  stores: Record<string, StoreApi<unknown>>;
  services: Record<string, unknown>;
  reactiveServices: Record<string, ReactiveService<unknown>>;
}

export const SharedDependenciesContext = createContext<SharedDependenciesContextValue | null>(null);

function useSharedDependencies(): SharedDependenciesContextValue {
  const ctx = useContext(SharedDependenciesContext);
  if (!ctx) {
    throw new Error(
      "[@tanstack-react-modules/core] useStore/useService/useReactiveService must be used within a <ReactiveApp />. " +
        "Make sure your component is rendered inside the App returned by registry.resolve().",
    );
  }
  return ctx;
}

function allKeys(ctx: SharedDependenciesContextValue): string {
  const keys = [
    ...Object.keys(ctx.stores),
    ...Object.keys(ctx.services),
    ...Object.keys(ctx.reactiveServices),
  ];
  return keys.join(", ") || "(none)";
}

function suggestHook(key: string, ctx: SharedDependenciesContextValue): string | null {
  if (ctx.stores[key]) return `Use useStore('${key}') instead.`;
  if (ctx.services[key]) return `Use useService('${key}') instead.`;
  if (ctx.reactiveServices[key]) return `Use useReactiveService('${key}') instead.`;
  return null;
}

/**
 * Creates typed hooks for accessing shared dependencies.
 * Call this once in your app-shared package, then use the returned hooks everywhere.
 *
 * @example
 * // In @myorg/app-shared:
 * import { createSharedHooks } from '@tanstack-react-modules/core'
 * import type { AppDependencies } from '@myorg/app-shared'
 *
 * export const { useStore, useService, useReactiveService, useOptional } = createSharedHooks<AppDependencies>()
 *
 * // In any module component:
 * const user = useStore('auth', (s) => s.user)        // zustand store → reactive
 * const api = useService('httpClient')                  // plain service → static
 * const call = useReactiveService('call')               // external source → reactive
 * const analytics = useOptional('analytics')            // any bucket, null if missing
 */
export function createSharedHooks<TSharedDependencies extends Record<string, any>>() {
  function useStore<K extends keyof TSharedDependencies & string>(key: K): TSharedDependencies[K];
  function useStore<K extends keyof TSharedDependencies & string, U>(
    key: K,
    selector: (state: TSharedDependencies[K]) => U,
  ): U;
  function useStore<K extends keyof TSharedDependencies & string>(
    key: K,
    selector?: (state: any) => unknown,
  ): unknown {
    const ctx = useSharedDependencies();
    const store = ctx.stores[key];
    if (!store) {
      const hint = suggestHook(key, ctx);
      if (hint) {
        throw new Error(`[@tanstack-react-modules/core] "${key}" is not a store. ${hint}`);
      }
      throw new Error(
        `[@tanstack-react-modules/core] "${key}" is not registered. ` +
          `Available dependencies: ${allKeys(ctx)}`,
      );
    }

    if (selector) {
      return useZustandStore(store, selector);
    }
    return useZustandStore(store);
  }

  function useService<K extends keyof TSharedDependencies & string>(
    key: K,
  ): TSharedDependencies[K] {
    const ctx = useSharedDependencies();
    const service = ctx.services[key];
    if (!service) {
      const hint = suggestHook(key, ctx);
      if (hint) {
        throw new Error(`[@tanstack-react-modules/core] "${key}" is not a service. ${hint}`);
      }
      throw new Error(
        `[@tanstack-react-modules/core] "${key}" is not registered. ` +
          `Available dependencies: ${allKeys(ctx)}`,
      );
    }
    return service as TSharedDependencies[K];
  }

  /**
   * Access a reactive external source (call adapter, presence, websocket).
   * Uses React's useSyncExternalStore internally — the component re-renders
   * when the source's snapshot changes.
   *
   * @example
   * const { state, caller } = useReactiveService('call')
   * const callState = useReactiveService('call', (s) => s.state)
   */
  function useReactiveService<K extends keyof TSharedDependencies & string>(
    key: K,
  ): TSharedDependencies[K];
  function useReactiveService<K extends keyof TSharedDependencies & string, U>(
    key: K,
    selector: (state: TSharedDependencies[K]) => U,
  ): U;
  function useReactiveService<K extends keyof TSharedDependencies & string>(
    key: K,
    selector?: (state: any) => unknown,
  ): unknown {
    const ctx = useSharedDependencies();
    const rs = ctx.reactiveServices[key];
    if (!rs) {
      const hint = suggestHook(key, ctx);
      if (hint) {
        throw new Error(
          `[@tanstack-react-modules/core] "${key}" is not a reactive service. ${hint}`,
        );
      }
      throw new Error(
        `[@tanstack-react-modules/core] "${key}" is not registered. ` +
          `Available dependencies: ${allKeys(ctx)}`,
      );
    }

    const getSnapshot = selector ? () => selector(rs.getSnapshot()) : rs.getSnapshot;

    return useSyncExternalStore(rs.subscribe, getSnapshot);
  }

  /**
   * Returns the dependency value if registered (from any bucket),
   * or null if not registered. Use for optional dependencies that the module can
   * function without.
   *
   * @example
   * const analytics = useOptional('analytics')
   * analytics?.track('journey_started')
   */
  function useOptional<K extends keyof TSharedDependencies & string>(
    key: K,
  ): TSharedDependencies[K] | null {
    const { stores, services, reactiveServices } = useSharedDependencies();

    const store = stores[key];
    if (store) {
      return useZustandStore(store) as TSharedDependencies[K];
    }

    const rs = reactiveServices[key];
    if (rs) {
      return useSyncExternalStore(rs.subscribe, rs.getSnapshot) as TSharedDependencies[K];
    }

    const service = services[key];
    if (service) {
      return service as TSharedDependencies[K];
    }

    return null;
  }

  return { useStore, useService, useReactiveService, useOptional };
}
