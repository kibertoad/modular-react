import { computed, DestroyRef, inject, signal, type Signal } from "@angular/core";
import type { ReactiveService, Store } from "@modular-frontend/core";
import {
  type InjectionContextOptions,
  runInContext,
  splitSelectorOptions,
} from "./injection-context.js";

/**
 * Shared bridge for any "subscribe + read snapshot" source: seed a `signal`
 * with the current value, push a fresh read on every change, and tear the
 * subscription down on `DestroyRef.onDestroy` (the injector that owns this
 * call is destroyed — component/environment teardown). Both {@link storeSignal}
 * and {@link reactiveServiceSignal} are thin wrappers over this, keeping the
 * leak-sensitive subscribe/teardown in one place.
 *
 * The base `signal` always holds the full snapshot; a selector is layered as a
 * `computed` so its `Object.is` output equality gives selector equality for
 * free — re-selecting the same value from an unrelated update does not wake
 * dependents. Runs inside an injection context (the caller's field initializer,
 * or `runInContext`'s wrapper), so `inject(DestroyRef)` resolves.
 */
function subscribeSignal<T>(
  read: () => T,
  subscribe: (onChange: () => void) => () => void,
  selector: ((state: T) => unknown) | undefined,
): Signal<unknown> {
  const state = signal(read());
  const unsubscribe = subscribe(() => {
    state.set(read());
  });
  inject(DestroyRef).onDestroy(unsubscribe);
  return selector ? computed(() => selector(state())) : state.asReadonly();
}

/**
 * Bridges an external, framework-neutral `Store<T>` into Angular's reactivity
 * as a read-only `Signal`.
 *
 * Mirrors what `useSyncExternalStore` does for React and `storeRef` does for
 * Vue: the signal holds the current snapshot and the store's `subscribe`
 * callback pushes new snapshots into it. The subscription is torn down when the
 * owning injector is destroyed, so there is no listener leak.
 *
 * Must run in an injection context, or be given an explicit `{ injector }`;
 * `assertInInjectionContext` reports the NG0203-style early error otherwise.
 *
 * @example
 * // In a component field initializer:
 * readonly user = storeSignal(this.authStore, (s) => s.user)
 * // Outside an injection context (event handler), pass an injector:
 * const user = storeSignal(authStore, { injector: this.injector })
 */
export function storeSignal<T>(store: Store<T>, options?: InjectionContextOptions): Signal<T>;
export function storeSignal<T, U>(
  store: Store<T>,
  selector: (state: T) => U,
  options?: InjectionContextOptions,
): Signal<U>;
export function storeSignal<T>(
  store: Store<T>,
  selectorOrOptions?: ((state: T) => unknown) | InjectionContextOptions,
  maybeOptions?: InjectionContextOptions,
): Signal<unknown> {
  const { selector, options } = splitSelectorOptions<T>(selectorOrOptions, maybeOptions);
  return runInContext(options, storeSignal, () =>
    subscribeSignal(() => store.getState(), store.subscribe, selector),
  );
}

/**
 * Same bridge as {@link storeSignal}, but for a `ReactiveService<T>` — a
 * subscribe + `getSnapshot` source (call adapter, presence, websocket).
 * `getSnapshot` must return a stable reference when nothing changed, exactly as
 * the React `useReactiveService` hook requires.
 */
export function reactiveServiceSignal<T>(
  rs: ReactiveService<T>,
  options?: InjectionContextOptions,
): Signal<T>;
export function reactiveServiceSignal<T, U>(
  rs: ReactiveService<T>,
  selector: (state: T) => U,
  options?: InjectionContextOptions,
): Signal<U>;
export function reactiveServiceSignal<T>(
  rs: ReactiveService<T>,
  selectorOrOptions?: ((state: T) => unknown) | InjectionContextOptions,
  maybeOptions?: InjectionContextOptions,
): Signal<unknown> {
  const { selector, options } = splitSelectorOptions<T>(selectorOrOptions, maybeOptions);
  return runInContext(options, reactiveServiceSignal, () =>
    subscribeSignal(() => rs.getSnapshot(), rs.subscribe, selector),
  );
}
