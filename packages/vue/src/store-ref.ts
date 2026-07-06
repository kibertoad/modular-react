import { onScopeDispose, shallowRef, type ShallowRef } from "vue";
import type { ReactiveService, Store } from "@modular-frontend/core";

/**
 * Shared bridge for any "subscribe + read snapshot" source: seed a
 * `shallowRef` with the current value, push a fresh read on every change, and
 * tear the subscription down on scope dispose (component unmount). Both
 * {@link storeRef} and {@link reactiveServiceRef} are thin wrappers over this;
 * keeping the leak-sensitive subscribe/teardown in one place.
 */
function subscribeRef<T>(
  read: () => T,
  subscribe: (onChange: () => void) => () => void,
): ShallowRef<T> {
  const state = shallowRef(read());
  const unsubscribe = subscribe(() => {
    state.value = read();
  });
  onScopeDispose(unsubscribe);
  return state;
}

/**
 * Bridges an external, framework-neutral `Store<T>` into Vue reactivity.
 *
 * Mirrors what `useSyncExternalStore` does for the React binding: a
 * `shallowRef` holds the current snapshot and the store's `subscribe`
 * callback pushes new snapshots into it. The subscription is torn down when
 * the surrounding effect scope is disposed (component unmount), so there is
 * no listener leak.
 *
 * `shallowRef` only notifies dependents when the assigned value actually
 * changes (`Object.is` on the ref's setter), which gives selector equality
 * for free: re-selecting the same primitive from an unrelated state update
 * does not wake watchers.
 */
export function storeRef<T>(store: Store<T>): ShallowRef<T>;
export function storeRef<T, U>(store: Store<T>, selector: (state: T) => U): ShallowRef<U>;
export function storeRef<T>(
  store: Store<T>,
  selector?: (state: T) => unknown,
): ShallowRef<unknown> {
  const read = selector ? () => selector(store.getState()) : () => store.getState();
  return subscribeRef(read, (onChange) => store.subscribe(onChange));
}

/**
 * Same bridge as {@link storeRef}, but for a `ReactiveService<T>` — a
 * subscribe + `getSnapshot` source (call adapter, presence, websocket).
 * `getSnapshot` must return a stable reference when nothing changed, exactly
 * as the React `useReactiveService` hook requires.
 */
export function reactiveServiceRef<T>(rs: ReactiveService<T>): ShallowRef<T>;
export function reactiveServiceRef<T, U>(
  rs: ReactiveService<T>,
  selector: (state: T) => U,
): ShallowRef<U>;
export function reactiveServiceRef<T>(
  rs: ReactiveService<T>,
  selector?: (state: T) => unknown,
): ShallowRef<unknown> {
  const read = selector ? () => selector(rs.getSnapshot()) : () => rs.getSnapshot();
  return subscribeRef(read, (onChange) => rs.subscribe(onChange));
}
