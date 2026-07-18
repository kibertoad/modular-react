import type { Store } from "@modular-frontend/core";

/**
 * The minimal structural slice of a Pinia store this adapter needs. A real
 * Pinia store (option or setup) satisfies it, but the shape is structural so
 * `@modular-vue/vue` takes **no** `pinia` dependency — the caller passes the
 * store they already own. This is the same principle as decision D3
 * (`docs/vue-support-tracker.md`): keep Pinia out of the runtime packages'
 * dependency graph and bridge to it structurally instead.
 */
export interface PiniaStoreLike<T extends object> {
  /** The store's reactive state (`store.$state`). Writable — assigning it replaces state. */
  $state: T;
  /** Merge a partial (or run a mutator) into `$state` (`store.$patch`). */
  $patch(partialStateOrMutator: Partial<T> | ((state: T) => void)): void;
  /**
   * Subscribe to state changes. Returns a stop function. The adapter passes
   * `{ detached: true, flush: "sync" }` so the subscription outlives any
   * component scope it is created in and fires synchronously — matching the
   * synchronous `Store<T>` contract that `getState()` reflects a `setState`
   * immediately.
   */
  $subscribe(
    callback: (mutation: unknown, state: T) => void,
    options?: { detached?: boolean; flush?: "pre" | "post" | "sync" },
  ): () => void;
}

/**
 * Present a Pinia store behind the framework-neutral `Store<T>` contract
 * (`getState` / `getInitialState` / `setState` / `subscribe`), so a Pinia store
 * can participate as a registry-owned `Store<T>` / reactive service — the same
 * DI slot a zustand or built-in `createStore` store fills — without the app
 * running a parallel state layer. This closes decision D3's deferred Store<T>
 * Pinia adapter.
 *
 * Pinia mutates its state in place, whereas `Store<T>` (and
 * `useSyncExternalStore` / `storeRef`) expect a fresh snapshot identity per
 * change so equality checks fire. The adapter reconciles the two by caching a
 * shallow-cloned snapshot and refreshing it from a synchronous `$subscribe`:
 *
 * - `getState()` returns the cached snapshot while subscribed (stable identity
 *   between changes, new identity after each change), and reads a live snapshot
 *   when nothing is subscribed (so an external Pinia mutation is never missed).
 * - `setState(partial)` merges via `$patch`; `setState(fn)` applies the updater
 *   to the current snapshot; `setState(next, true)` (or a non-object `next`)
 *   replaces `$state` wholesale — mirroring the built-in `createStore`.
 * - `subscribe(listener)` starts a single synchronous upstream `$subscribe`
 *   (reference-counted; torn down when the last listener unsubscribes) and
 *   forwards `(state, previousState)`.
 *
 * `getInitialState()` returns the snapshot captured when the adapter was
 * created — Pinia has no separate initial-state channel, so this is the
 * closest faithful equivalent (capture the adapter over a freshly created
 * store to make it meaningful).
 *
 * The snapshot is a **shallow** clone (`{ ...$state }`), matching the built-in
 * `createStore`. Top-level identity is fresh per change, so top-level selectors
 * and `Object.is` equality behave as expected; nested objects, however, are
 * shared by reference between the previous and current snapshot, so a
 * `subscribe` consumer diffing a deep path (`prev.a.b` vs `next.a.b`) sees
 * equal references even when that value changed. Select on top-level slices, or
 * keep state shallow, as with the other stores in this family.
 *
 * ```ts
 * const store = useWizardStore();               // a Pinia store
 * const adapted = createPiniaStoreAdapter(store); // satisfies Store<WizardState>
 * // adapted can now be handed to the registry's deps / reactiveServices bucket,
 * // or bridged into Vue reactivity with storeRef(adapted).
 * ```
 */
export function createPiniaStoreAdapter<T extends object>(store: PiniaStoreLike<T>): Store<T> {
  const snapshot = (): T => ({ ...store.$state });
  const initial = snapshot();
  const listeners = new Set<(state: T, previousState: T) => void>();

  let current = snapshot();
  let stop: (() => void) | null = null;

  const startUpstream = (): void => {
    if (stop) return;
    // Re-sync the cache to live state at subscription start so a mutation that
    // happened while unsubscribed is not lost from the first `getState()`.
    current = snapshot();
    stop = store.$subscribe(
      () => {
        const previousState = current;
        current = snapshot();
        for (const listener of listeners) listener(current, previousState);
      },
      { detached: true, flush: "sync" },
    );
  };

  return {
    // Cached while subscribed (identity stable between changes); live otherwise
    // so external Pinia writes are always reflected.
    getState: () => (stop ? current : snapshot()),
    getInitialState: () => initial,

    setState(partial, replace) {
      const next =
        typeof partial === "function"
          ? (partial as (state: T) => T | Partial<T>)(stop ? current : snapshot())
          : partial;

      if (replace ?? (typeof next !== "object" || next === null)) {
        store.$state = next as T;
      } else {
        store.$patch(next as Partial<T>);
      }
      // A live upstream subscription (flush: "sync") has already refreshed
      // `current` and notified listeners synchronously. With no subscribers,
      // `getState()` reads live, so there is nothing to refresh here.
    },

    subscribe(listener) {
      startUpstream();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stop) {
          stop();
          stop = null;
        }
      };
    },
  };
}
