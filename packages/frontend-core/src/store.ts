/**
 * Reactive store interface — matches zustand's `StoreApi<T>` exactly,
 * so zustand stores are drop-in compatible in both directions.
 *
 * Projects that don't want a zustand dependency can use the built-in
 * `createStore()` which implements the same interface.
 *
 * ## Zustand interop
 *
 * - `StoreApi<T>` is assignable to `Store<T>` and vice versa.
 * - Middleware is the only zustand feature not replicated by the
 *   built-in `createStore` — use zustand directly if you need it.
 *
 * @example With zustand (drop-in):
 * ```ts
 * import { createStore } from 'zustand/vanilla'
 * const authStore = createStore<AuthState>()((set) => ({ ... }))
 * // authStore satisfies Store<AuthState>
 * ```
 *
 * @example With built-in createStore:
 * ```ts
 * import { createStore } from '@modular-react/core'
 * const authStore = createStore<AuthState>({ user: null, token: null })
 * ```
 */
export interface Store<T> {
  /** Get current state snapshot. */
  getState(): T;

  /** Get the initial state the store was created with. */
  getInitialState(): T;

  /**
   * Update the store state.
   *
   * - **Partial object** — shallow-merged with current state (`Object.assign`)
   * - **Updater function** — receives current state, return value is merged
   * - **`replace: true`** — replaces the entire state instead of merging
   */
  setState(partial: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: boolean): void;

  /**
   * Subscribe to state changes. The listener receives the new state
   * and the previous state. Returns an unsubscribe function.
   *
   * Compatible with `useSyncExternalStore` — React passes a no-arg
   * callback which simply ignores the extra parameters.
   */
  subscribe(listener: (state: T, previousState: T) => void): () => void;
}

/**
 * Creates a lightweight reactive store — a zustand-compatible
 * alternative for projects that don't need zustand's middleware.
 *
 * The returned store implements the full `Store<T>` interface and works
 * seamlessly with `createSharedHooks()`, `createScopedStore()`,
 * and React's `useSyncExternalStore`.
 *
 * @param initialState - Initial state object, or a function that returns it.
 *
 * @example
 * ```ts
 * const counterStore = createStore({ count: 0 })
 *
 * // Read
 * counterStore.getState().count // 0
 *
 * // Update (partial merge)
 * counterStore.setState({ count: 1 })
 *
 * // Update (updater function)
 * counterStore.setState((s) => ({ count: s.count + 1 }))
 *
 * // Replace entire state
 * counterStore.setState({ count: 0 }, true)
 *
 * // Subscribe (receives new and previous state)
 * const unsub = counterStore.subscribe((state, prev) => {
 *   console.log('changed:', prev, '→', state)
 * })
 *
 * // Reset to initial
 * counterStore.setState(counterStore.getInitialState(), true)
 * ```
 */
export function createStore<T>(initialState: T | (() => T)): Store<T> {
  const initial: T =
    typeof initialState === "function" ? (initialState as () => T)() : initialState;
  let state: T = initial;
  const listeners = new Set<(state: T, previousState: T) => void>();

  return {
    getState: () => state,
    getInitialState: () => initial,

    setState(partial, replace) {
      const nextState =
        typeof partial === "function" ? (partial as (state: T) => T | Partial<T>)(state) : partial;

      // Skip if same reference (no change)
      if (Object.is(nextState, state)) return;

      const previousState = state;
      state =
        (replace ?? (typeof nextState !== "object" || nextState === null))
          ? (nextState as T)
          : (Object.assign({}, state, nextState) as T);

      for (const listener of listeners) listener(state, previousState);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
