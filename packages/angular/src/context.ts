import { InjectionToken, type Provider, signal, type Signal } from "@angular/core";
import type { ReactiveService, Store } from "@modular-frontend/core";
import {
  type InjectionContextOptions,
  injectRequired,
  runInContext,
  splitSelectorOptions,
} from "./injection-context.js";
import { reactiveServiceSignal, storeSignal } from "./store-signal.js";

/**
 * The resolved shared dependencies, split into the three buckets the runtime
 * separates them into at `registry.resolve()` time. Mirrors the React binding's
 * `SharedDependenciesContextValue`; the runtime providers (PR-A22) install it
 * at the app root via {@link provideSharedDependencies}.
 */
export interface SharedDependenciesContextValue {
  stores: Record<string, Store<unknown>>;
  services: Record<string, unknown>;
  reactiveServices: Record<string, ReactiveService<unknown>>;
}

/** Injection token holding the resolved shared dependencies. */
export const SHARED_DEPENDENCIES = new InjectionToken<SharedDependenciesContextValue>(
  "modular-angular.sharedDependencies",
);

/**
 * Provider factory that installs the shared dependencies. Add it to an
 * `ApplicationConfig` / `Injector` at the modular app root (the runtime
 * `provideModularApp` composes it). Analog of rendering
 * `<SharedDependenciesContext value=…>`.
 */
export function provideSharedDependencies(value: SharedDependenciesContextValue): Provider {
  return { provide: SHARED_DEPENDENCIES, useValue: value };
}

function requireSharedDependencies(): SharedDependenciesContextValue {
  return injectRequired(
    SHARED_DEPENDENCIES,
    "[@modular-angular/angular] injectStore/injectService/injectReactiveService must be used within a modular app. " +
      "Make sure the injector installs the providers that provideSharedDependencies() (or provideModularApp) contributes.",
  );
}

function allKeys(ctx: SharedDependenciesContextValue): string {
  const keys = [
    ...Object.keys(ctx.stores),
    ...Object.keys(ctx.services),
    ...Object.keys(ctx.reactiveServices),
  ];
  return keys.join(", ") || "(none)";
}

function suggestInjector(key: string, ctx: SharedDependenciesContextValue): string | null {
  if (Object.hasOwn(ctx.stores, key)) return `Use injectStore('${key}') instead.`;
  if (Object.hasOwn(ctx.services, key)) return `Use injectService('${key}') instead.`;
  if (Object.hasOwn(ctx.reactiveServices, key))
    return `Use injectReactiveService('${key}') instead.`;
  return null;
}

/**
 * Look up `key` in one dependency bucket, or throw a helpful error. Uses
 * `Object.hasOwn` (not a truthy check) so a legitimately falsy plain-service
 * value — `0`, `false`, `""` — is still returned rather than misreported as
 * unregistered, while a key that collides with an `Object.prototype` member
 * (`constructor`, `toString`, …) is not mistaken for a registered dependency.
 */
function requireDep<T>(
  ctx: SharedDependenciesContextValue,
  bucket: "stores" | "services" | "reactiveServices",
  label: string,
  key: string,
): T {
  const map = ctx[bucket] as Record<string, unknown>;
  if (Object.hasOwn(map, key)) {
    return map[key] as T;
  }
  const hint = suggestInjector(key, ctx);
  if (hint) {
    throw new Error(`[@modular-angular/angular] "${key}" is not a ${label}. ${hint}`);
  }
  throw new Error(
    `[@modular-angular/angular] "${key}" is not registered. Available dependencies: ${allKeys(ctx)}`,
  );
}

/**
 * Creates typed accessors for shared dependencies. Call this once in your
 * app-shared package, then use the returned accessors everywhere. Analog of the
 * React binding's `createSharedHooks` and the Vue binding's
 * `createSharedComposables`.
 *
 * Works with both zustand stores and @modular-frontend/core's built-in
 * `createStore` — any object implementing the `Store<T>` interface is supported.
 *
 * Reactive accessors (`injectStore`, `injectReactiveService`, `injectOptional`)
 * return a `Signal`, tracked in templates and `computed`/`effect` like any
 * other signal. Plain services are static, so `injectService` returns the value
 * directly. Every accessor takes an optional trailing `{ injector }` so it can
 * run outside an ambient injection context.
 *
 * @example
 * // In @myorg/app-shared:
 * import { createSharedInjectors } from '@modular-angular/angular'
 * import type { AppDependencies } from '@myorg/app-shared'
 *
 * export const { injectStore, injectService, injectReactiveService, injectOptional } =
 *   createSharedInjectors<AppDependencies>()
 *
 * // In any component field initializer:
 * readonly user = injectStore('auth', (s) => s.user) // Signal → reactive
 * readonly api = injectService('httpClient')          // plain service → static
 * readonly call = injectReactiveService('call')        // external source → Signal
 * readonly analytics = injectOptional('analytics')     // Signal, () null if missing
 */
export function createSharedInjectors<TSharedDependencies extends Record<string, any>>() {
  function injectStore<K extends keyof TSharedDependencies & string>(
    key: K,
    options?: InjectionContextOptions,
  ): Signal<TSharedDependencies[K]>;
  function injectStore<K extends keyof TSharedDependencies & string, U>(
    key: K,
    selector: (state: TSharedDependencies[K]) => U,
    options?: InjectionContextOptions,
  ): Signal<U>;
  function injectStore<K extends keyof TSharedDependencies & string>(
    key: K,
    selectorOrOptions?: ((state: any) => unknown) | InjectionContextOptions,
    maybeOptions?: InjectionContextOptions,
  ): Signal<unknown> {
    const { selector, options } = splitSelectorOptions(selectorOrOptions, maybeOptions);
    return runInContext(options, injectStore, () => {
      const store = requireDep<Store<unknown>>(requireSharedDependencies(), "stores", "store", key);
      return selector ? storeSignal(store, selector) : storeSignal(store);
    });
  }

  function injectService<K extends keyof TSharedDependencies & string>(
    key: K,
    options?: InjectionContextOptions,
  ): TSharedDependencies[K] {
    return runInContext(options, injectService, () =>
      requireDep<TSharedDependencies[K]>(requireSharedDependencies(), "services", "service", key),
    );
  }

  /**
   * Access a reactive external source (call adapter, presence, websocket).
   * Returns a `Signal` that updates when the source's snapshot changes.
   *
   * @example
   * readonly call = injectReactiveService('call')
   * readonly callState = injectReactiveService('call', (s) => s.state)
   */
  function injectReactiveService<K extends keyof TSharedDependencies & string>(
    key: K,
    options?: InjectionContextOptions,
  ): Signal<TSharedDependencies[K]>;
  function injectReactiveService<K extends keyof TSharedDependencies & string, U>(
    key: K,
    selector: (state: TSharedDependencies[K]) => U,
    options?: InjectionContextOptions,
  ): Signal<U>;
  function injectReactiveService<K extends keyof TSharedDependencies & string>(
    key: K,
    selectorOrOptions?: ((state: any) => unknown) | InjectionContextOptions,
    maybeOptions?: InjectionContextOptions,
  ): Signal<unknown> {
    const { selector, options } = splitSelectorOptions(selectorOrOptions, maybeOptions);
    return runInContext(options, injectReactiveService, () => {
      const rs = requireDep<ReactiveService<unknown>>(
        requireSharedDependencies(),
        "reactiveServices",
        "reactive service",
        key,
      );
      return selector ? reactiveServiceSignal(rs, selector) : reactiveServiceSignal(rs);
    });
  }

  /**
   * Returns a `Signal` to the dependency value if registered (from any bucket),
   * or a `Signal` whose value is `null` if not registered. Use for optional
   * dependencies the module can function without.
   *
   * The signal stays reactive for stores and reactive services; plain services
   * and the missing case are static values wrapped in a signal for a uniform API.
   *
   * @example
   * readonly analytics = injectOptional('analytics')
   * this.analytics()?.track('journey_started')
   */
  function injectOptional<K extends keyof TSharedDependencies & string>(
    key: K,
    options?: InjectionContextOptions,
  ): Signal<TSharedDependencies[K] | null> {
    return runInContext(options, injectOptional, () => {
      const { stores, services, reactiveServices } = requireSharedDependencies();

      // `Object.hasOwn` (not a truthy check) so a key colliding with an
      // `Object.prototype` member is not mistaken for a registered dependency.
      if (Object.hasOwn(stores, key)) {
        return storeSignal(stores[key] as Store<unknown>) as Signal<TSharedDependencies[K] | null>;
      }

      if (Object.hasOwn(reactiveServices, key)) {
        return reactiveServiceSignal(reactiveServices[key] as ReactiveService<unknown>) as Signal<
          TSharedDependencies[K] | null
        >;
      }

      // Plain services (and the missing case) are static — wrap the value in a
      // signal so callers always read `()`, no subscription needed.
      const value = (Object.hasOwn(services, key) ? services[key] : null) as
        | TSharedDependencies[K]
        | null;
      return signal(value).asReadonly();
    });
  }

  return { injectStore, injectService, injectReactiveService, injectOptional };
}
