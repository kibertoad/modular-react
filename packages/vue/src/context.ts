import { inject, provide, shallowRef, type InjectionKey, type Ref } from "vue";
import type { ReactiveService, Store } from "@modular-frontend/core";
import { reactiveServiceRef, storeRef } from "./store-ref.js";

/**
 * The resolved shared dependencies, split into the three buckets the runtime
 * separates them into at `registry.resolve()` time. Mirrors the React
 * binding's `SharedDependenciesContextValue`; the runtime plugin (PR-22)
 * provides it at the app root.
 */
export interface SharedDependenciesContextValue {
  stores: Record<string, Store<unknown>>;
  services: Record<string, unknown>;
  reactiveServices: Record<string, ReactiveService<unknown>>;
}

/** Injection key holding the resolved shared dependencies. */
export const sharedDependenciesKey: InjectionKey<SharedDependenciesContextValue> = Symbol(
  "modular-vue.sharedDependencies",
);

/**
 * Provide the shared dependencies to descendant components. Call from the
 * `setup()` of a component that owns the modular app root (or install it via
 * the runtime plugin). Analog of rendering `<SharedDependenciesContext value=…>`.
 */
export function provideSharedDependencies(value: SharedDependenciesContextValue): void {
  provide(sharedDependenciesKey, value);
}

function useSharedDependencies(): SharedDependenciesContextValue {
  const ctx = inject(sharedDependenciesKey, null);
  if (!ctx) {
    throw new Error(
      "[@modular-vue/vue] useStore/useService/useReactiveService must be used within a modular app. " +
        "Make sure your component is mounted under the app that provideSharedDependencies() (or the runtime plugin) installs.",
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

function suggestComposable(key: string, ctx: SharedDependenciesContextValue): string | null {
  if (ctx.stores[key]) return `Use useStore('${key}') instead.`;
  if (ctx.services[key]) return `Use useService('${key}') instead.`;
  if (ctx.reactiveServices[key]) return `Use useReactiveService('${key}') instead.`;
  return null;
}

/**
 * Creates typed composables for accessing shared dependencies.
 * Call this once in your app-shared package, then use the returned composables
 * everywhere. Analog of the React binding's `createSharedHooks`.
 *
 * Works with both zustand stores and @modular-frontend/core's built-in
 * `createStore` — any object implementing the `Store<T>` interface is supported.
 *
 * Reactive accessors (`useStore`, `useReactiveService`, `useOptional`) return a
 * `Ref`, tracked in templates and `computed`/`watch` like any other ref. Plain
 * services are static, so `useService` returns the value directly.
 *
 * @example
 * // In @myorg/app-shared:
 * import { createSharedComposables } from '@modular-vue/vue'
 * import type { AppDependencies } from '@myorg/app-shared'
 *
 * export const { useStore, useService, useReactiveService, useOptional } =
 *   createSharedComposables<AppDependencies>()
 *
 * // In any module component's <script setup>:
 * const user = useStore('auth', (s) => s.user)   // Ref → reactive
 * const api = useService('httpClient')            // plain service → static
 * const call = useReactiveService('call')         // external source → Ref
 * const analytics = useOptional('analytics')      // Ref, .value null if missing
 */
export function createSharedComposables<TSharedDependencies extends Record<string, any>>() {
  function useStore<K extends keyof TSharedDependencies & string>(
    key: K,
  ): Ref<TSharedDependencies[K]>;
  function useStore<K extends keyof TSharedDependencies & string, U>(
    key: K,
    selector: (state: TSharedDependencies[K]) => U,
  ): Ref<U>;
  function useStore<K extends keyof TSharedDependencies & string>(
    key: K,
    selector?: (state: any) => unknown,
  ): Ref<unknown> {
    const ctx = useSharedDependencies();
    const store = ctx.stores[key];
    if (!store) {
      const hint = suggestComposable(key, ctx);
      if (hint) {
        throw new Error(`[@modular-vue/vue] "${key}" is not a store. ${hint}`);
      }
      throw new Error(
        `[@modular-vue/vue] "${key}" is not registered. Available dependencies: ${allKeys(ctx)}`,
      );
    }
    return selector ? storeRef(store, selector) : storeRef(store);
  }

  function useService<K extends keyof TSharedDependencies & string>(
    key: K,
  ): TSharedDependencies[K] {
    const ctx = useSharedDependencies();
    const service = ctx.services[key];
    if (!service) {
      const hint = suggestComposable(key, ctx);
      if (hint) {
        throw new Error(`[@modular-vue/vue] "${key}" is not a service. ${hint}`);
      }
      throw new Error(
        `[@modular-vue/vue] "${key}" is not registered. Available dependencies: ${allKeys(ctx)}`,
      );
    }
    return service as TSharedDependencies[K];
  }

  /**
   * Access a reactive external source (call adapter, presence, websocket).
   * Returns a `Ref` that updates when the source's snapshot changes.
   *
   * @example
   * const call = useReactiveService('call')
   * const callState = useReactiveService('call', (s) => s.state)
   */
  function useReactiveService<K extends keyof TSharedDependencies & string>(
    key: K,
  ): Ref<TSharedDependencies[K]>;
  function useReactiveService<K extends keyof TSharedDependencies & string, U>(
    key: K,
    selector: (state: TSharedDependencies[K]) => U,
  ): Ref<U>;
  function useReactiveService<K extends keyof TSharedDependencies & string>(
    key: K,
    selector?: (state: any) => unknown,
  ): Ref<unknown> {
    const ctx = useSharedDependencies();
    const rs = ctx.reactiveServices[key];
    if (!rs) {
      const hint = suggestComposable(key, ctx);
      if (hint) {
        throw new Error(`[@modular-vue/vue] "${key}" is not a reactive service. ${hint}`);
      }
      throw new Error(
        `[@modular-vue/vue] "${key}" is not registered. Available dependencies: ${allKeys(ctx)}`,
      );
    }
    return selector ? reactiveServiceRef(rs, selector) : reactiveServiceRef(rs);
  }

  /**
   * Returns a `Ref` to the dependency value if registered (from any bucket),
   * or a `Ref` whose value is `null` if not registered. Use for optional
   * dependencies the module can function without.
   *
   * The ref stays reactive for stores and reactive services; plain services
   * and the missing case are static values wrapped in a ref for a uniform API.
   *
   * @example
   * const analytics = useOptional('analytics')
   * analytics.value?.track('journey_started')
   */
  function useOptional<K extends keyof TSharedDependencies & string>(
    key: K,
  ): Ref<TSharedDependencies[K] | null> {
    const { stores, services, reactiveServices } = useSharedDependencies();

    const store = stores[key] as Store<unknown> | undefined;
    if (store) {
      return storeRef(store) as Ref<TSharedDependencies[K] | null>;
    }

    const rs = reactiveServices[key] as ReactiveService<unknown> | undefined;
    if (rs) {
      return reactiveServiceRef(rs) as Ref<TSharedDependencies[K] | null>;
    }

    const service = services[key];
    const value = (service ?? null) as TSharedDependencies[K] | null;
    // Plain services (and the missing case) are static — wrap the value in a
    // ref so callers always read `.value`, no subscription needed.
    return shallowRef(value);
  }

  return { useStore, useService, useReactiveService, useOptional };
}
