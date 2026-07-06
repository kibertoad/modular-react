import type { Ref } from "vue";
import { createStore, type Store } from "@modular-frontend/core";
import { storeRef } from "./store-ref.js";

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
   * Vue composable — subscribe to a scoped store's full state.
   * Creates the scope if it doesn't exist. Returns a reactive `Ref`.
   */
  useScoped(scopeId: string): Ref<TState>;

  /**
   * Vue composable — subscribe to a scoped store with a selector.
   * The returned `Ref` only changes when the selected value changes.
   * Creates the scope if it doesn't exist.
   */
  useScoped<U>(scopeId: string, selector: (state: TState) => U): Ref<U>;
}

/**
 * Creates a scoped store — a Map<string, Store<TState>> with lazy creation.
 * Each scope gets its own independent store instance, initialized on first access.
 *
 * Works with @modular-frontend/core's built-in store — no zustand required.
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
 * // Imperative (outside components):
 * const store = tabState.getOrCreate('interaction-1')
 * store.setState({ activeTabId: 'billing' })
 *
 * // In component <script setup>:
 * const state = tabState.useScoped(interactionId)          // Ref<TabState>
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

  function useScoped(scopeId: string): Ref<TState>;
  function useScoped<U>(scopeId: string, selector: (state: TState) => U): Ref<U>;
  function useScoped(scopeId: string, selector?: (state: TState) => unknown): Ref<unknown> {
    const store = getOrCreate(scopeId);
    return selector ? storeRef(store, selector) : storeRef(store);
  }

  return { getOrCreate, has, remove, clear, useScoped };
}
