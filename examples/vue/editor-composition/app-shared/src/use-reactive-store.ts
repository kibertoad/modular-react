import { onScopeDispose, shallowRef, type ShallowRef } from "vue";
import type { ReactiveService } from "@modular-frontend/core";

/**
 * Bridge a framework-neutral "subscribe + getSnapshot" source into Vue
 * reactivity — the Vue analog of React's `useSyncExternalStore`. A cross-team
 * composition panel receives a `WritableStore<T>` / `ReadableStore<T>` on its
 * `input` (both are `ReactiveService<T>`); it reads the value reactively with
 * this composable and writes with the store's own `set(...)`.
 *
 * `shallowRef` only notifies when the assigned value actually changes
 * (`Object.is` on the setter), so re-selecting the same value doesn't wake
 * watchers. The subscription is torn down on scope dispose (component unmount).
 *
 * The `@modular-vue/vue` binding ships an internal `reactiveServiceRef` with the
 * same shape; this example reimplements the ~5 lines rather than reaching for a
 * non-public helper, so panels stay readable in isolation.
 */
export function useReactiveStore<T>(store: ReactiveService<T>): ShallowRef<T> {
  const state = shallowRef(store.getSnapshot());
  const unsubscribe = store.subscribe(() => {
    state.value = store.getSnapshot();
  });
  onScopeDispose(unsubscribe);
  return state;
}
