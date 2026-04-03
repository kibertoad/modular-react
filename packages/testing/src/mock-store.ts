import { createStore } from "@modular-react/core";
import type { Store } from "@modular-react/core";

/**
 * Creates a store pre-populated with the given state.
 * Convenience alias for `createStore(initialState)` with a
 * test-oriented name.
 *
 * Works as a drop-in replacement for zustand's `createStore` in tests —
 * the returned `Store<T>` is compatible with `createSharedHooks()`,
 * `renderModule()`, and `resolveModule()`.
 *
 * @example
 * const authStore = createMockStore<AuthStore>({
 *   user: { id: '1', name: 'Test User' },
 *   token: 'mock-token',
 *   isAuthenticated: true,
 *   login: async () => {},
 *   logout: () => {},
 * })
 */
export function createMockStore<T>(initialState: T): Store<T> {
  return createStore<T>(initialState);
}
