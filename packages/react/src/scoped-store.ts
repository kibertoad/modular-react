import { useSyncExternalStore } from "react";
import { createStore } from "@modular-react/core";
import type { Store } from "@modular-react/core";

export interface ScopedStore<TState> {
  /**
   * Get the store for a scope, creating it with the initializer if it doesn't exist.
   * Returns the raw Store — call getState(), setState(), subscribe() directly.
   */
  getOrCreate(scopeId: string): Store<TState>;

  /**
   * Check whether a scope exists (was previously created).
   */
  has(scopeId: string): boolean;

  /**
   * Remove a scope's store, freeing its state.
   * No-op if the scope doesn't exist.
   */
  remove(scopeId: string): void;

  /**
   * Remove all scoped stores.
   */
  clear(): void;

  /**
   * React hook — subscribe to a scoped store's full state.
   * Creates the scope if it doesn't exist.
   */
  useScoped(scopeId: string): TState;

  /**
   * React hook — subscribe to a scoped store with a selector.
   * Only re-renders when the selected value changes.
   * Creates the scope if it doesn't exist.
   */
  useScoped<U>(scopeId: string, selector: (state: TState) => U): U;
}

/**
 * Creates a scoped store — a Map<string, Store<TState>> with lazy creation.
 * Each scope gets its own independent store instance, initialized on first access.
 *
 * Works with @modular-react/core's built-in store — no zustand required.
 *
 * Use this for per-entity state: per-interaction tabs, per-conversation messages,
 * per-workspace scratchpads, etc.
 *
 * @param initializer - Function that returns the initial state for a new scope.
 *                      Called once per scope, when the scope is first accessed.
 *
 * @example
 * const tabState = createScopedStore<TabState>(() => ({
 *   tabs: [createDirectoryTab()],
 *   activeTabId: 'directory',
 * }))
 *
 * // Imperative (outside React):
 * const store = tabState.getOrCreate('interaction-1')
 * store.setState({ activeTabId: 'billing' })
 *
 * // In React components:
 * const { tabs, activeTabId } = tabState.useScoped(interactionId)
 * const tabs = tabState.useScoped(interactionId, s => s.tabs)
 *
 * // Cleanup when interaction ends:
 * tabState.remove('interaction-1')
 */
export function createScopedStore<TState>(initializer: () => TState): ScopedStore<TState> {
  const scopes = new Map<string, Store<TState>>();

  function getOrCreate(scopeId: string): Store<TState> {
    let store = scopes.get(scopeId);
    if (!store) {
      store = createStore<TState>(initializer);
      scopes.set(scopeId, store);
    }
    return store;
  }

  function has(scopeId: string): boolean {
    return scopes.has(scopeId);
  }

  function remove(scopeId: string): void {
    scopes.delete(scopeId);
  }

  function clear(): void {
    scopes.clear();
  }

  function useScoped(scopeId: string): TState;
  function useScoped<U>(scopeId: string, selector: (state: TState) => U): U;
  function useScoped(scopeId: string, selector?: (state: any) => any): any {
    const store = getOrCreate(scopeId);
    const getSnapshot = selector
      ? () => selector(store.getState())
      : () => store.getState();
    return useSyncExternalStore(store.subscribe, getSnapshot);
  }

  return { getOrCreate, has, remove, clear, useScoped };
}
