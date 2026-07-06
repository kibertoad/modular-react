import type { Signal } from "@angular/core";
import { createStore, type Store } from "@modular-frontend/core";
import {
  type InjectionContextOptions,
  runInContext,
  splitSelectorOptions,
} from "./injection-context.js";
import { storeSignal } from "./store-signal.js";

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
   * Angular accessor — subscribe to a scoped store's full state.
   * Creates the scope if it doesn't exist. Returns a reactive `Signal`.
   * Runs in an injection context or takes an explicit `{ injector }`.
   */
  injectScoped(scopeId: string, options?: InjectionContextOptions): Signal<TState>;

  /**
   * Angular accessor — subscribe to a scoped store with a selector.
   * The returned `Signal` only changes when the selected value changes.
   * Creates the scope if it doesn't exist.
   */
  injectScoped<U>(
    scopeId: string,
    selector: (state: TState) => U,
    options?: InjectionContextOptions,
  ): Signal<U>;
}

/**
 * Creates a scoped store — a Map<string, Store<TState>> with lazy creation.
 * Each scope gets its own independent store instance, initialized on first access.
 *
 * Works with @modular-frontend/core's built-in store — no zustand required.
 *
 * Use this for per-entity state: per-interaction tabs, per-conversation messages,
 * per-workspace scratchpads, etc. Analog of the React/Vue `createScopedStore`
 * (the `useScoped` composable becomes the `injectScoped` accessor).
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
 * // In a component field initializer:
 * readonly state = tabState.injectScoped(this.interactionId)          // Signal<TabState>
 * readonly tabs = tabState.injectScoped(this.interactionId, s => s.tabs)
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

  function injectScoped(scopeId: string, options?: InjectionContextOptions): Signal<TState>;
  function injectScoped<U>(
    scopeId: string,
    selector: (state: TState) => U,
    options?: InjectionContextOptions,
  ): Signal<U>;
  function injectScoped(
    scopeId: string,
    selectorOrOptions?: ((state: TState) => unknown) | InjectionContextOptions,
    maybeOptions?: InjectionContextOptions,
  ): Signal<unknown> {
    const { selector, options } = splitSelectorOptions<TState>(selectorOrOptions, maybeOptions);
    // Guard the injection context up front so a call that ultimately fails the
    // NG0203 check does not create and leak a scope as a side effect. The inner
    // `storeSignal` re-enters the same context (nested `runInContext` is safe).
    return runInContext(options, injectScoped, () => {
      const store = getOrCreate(scopeId);
      return selector ? storeSignal(store, selector, options) : storeSignal(store, options);
    });
  }

  return { getOrCreate, has, remove, clear, injectScoped };
}
