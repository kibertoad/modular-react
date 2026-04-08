import { createStore } from "zustand";
import type { StoreApi } from "zustand";

/**
 * Creates a zustand store pre-populated with the given state.
 * Useful for testing modules with mocked shared dependencies.
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
export function createMockStore<T>(initialState: T): StoreApi<T> {
  return createStore<T>()(() => initialState);
}
