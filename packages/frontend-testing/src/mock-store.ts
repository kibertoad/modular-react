import { createStore } from "@modular-frontend/core";
import type { Store } from "@modular-frontend/core";

/**
 * Creates a store pre-populated with the given state.
 * Convenience alias for `createStore(initialState)` with a
 * test-oriented name.
 *
 * Works as a drop-in replacement for zustand's `createStore` in tests.
 * The returned `Store<T>` is compatible with `resolveModule()` and with
 * whichever UI-framework binding's shared-state factory and render helper
 * the test uses (`createSharedHooks`/`createSharedComposables`, etc.).
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
