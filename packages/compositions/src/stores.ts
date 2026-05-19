import type { ReadableStore, WritableStore } from "@modular-react/core";
import type { CompositionInstanceId, CompositionRuntime } from "./types.js";

/**
 * Author-facing store factory exposed on {@link ZoneSelectorCtx.stores}.
 * Returns store objects that are **stable per `(instance, key)`** —
 * calling `stores.readable("selection", ...)` twice in the same
 * selector run, or across selector re-runs for the same instance,
 * returns the same store reference. That stability lets panels treat
 * the store as a long-lived dependency injected via `input` and use it
 * with `React.useSyncExternalStore` without re-subscribing on every
 * re-render.
 *
 * The stores subscribe to the composition's per-instance store
 * (`runtime.subscribe(instanceId, ...)`) but filter listener fan-out to
 * **slice-level changes** — subscribers only fire when the slice value
 * produced by `get(state)` actually differs (`Object.is`) from the
 * previous snapshot.
 */
export interface ZoneStores<TState> {
  /**
   * Get-or-create a read-only store projecting a slice of composition
   * state. Stable per `(instance, key)`.
   */
  readable<TSlice>(key: string, get: (state: TState) => TSlice): ReadableStore<TSlice>;
  /**
   * Get-or-create a writable store projecting a slice of composition
   * state. `set` translates a slice value into a state-updater that the
   * composition's runtime applies via `dispatch`.
   */
  writable<TSlice>(
    key: string,
    opts: {
      readonly get: (state: TState) => TSlice;
      readonly set: (
        value: TSlice,
      ) => Partial<TState> | ((prev: TState) => Partial<TState> | TState);
    },
  ): WritableStore<TSlice>;
}

interface CacheEntry {
  readonly store: ReadableStore<unknown> | WritableStore<unknown>;
}

/**
 * Build a {@link ZoneStores} bound to a specific composition instance.
 * Caches per-key stores so repeated `readable("foo", ...)` /
 * `writable("foo", ...)` calls return the same object.
 *
 * Designed to be constructed **once per `(runtime, instanceId)`** —
 * typically via `useMemo` in the outlet's render path. The cache lives
 * for the outlet mount's lifetime; when the instance disposes and the
 * outlet unmounts, the cache (and its store-internal listener
 * registrations) are dropped.
 */
export function createZoneStores<TState>(
  runtime: CompositionRuntime,
  instanceId: CompositionInstanceId,
): ZoneStores<TState> {
  const cache = new Map<string, CacheEntry>();

  function buildReadable<TSlice>(
    key: string,
    get: (state: TState) => TSlice,
  ): ReadableStore<TSlice> {
    const existing = cache.get(key);
    if (existing) return existing.store as ReadableStore<TSlice>;

    // One shared per-store snapshot and one runtime subscription that
    // fans out to all panel-side listeners. Maintaining the cache
    // *inside* each `subscribe` call (rather than per-subscriber) is
    // required for correctness — otherwise the first subscriber's
    // change-detection would advance the cache and silently skip the
    // others, and `getSnapshot` would return whatever the last
    // listener happened to see.
    let cachedSlice: TSlice;
    let initialized = false;
    const listeners = new Set<() => void>();
    let runtimeUnsub: (() => void) | null = null;

    const project = (): TSlice => {
      const instance = runtime.getInstance(instanceId);
      // `instance` can briefly be null during teardown — return
      // `undefined` rather than throw. React's
      // `useSyncExternalStore` handles transient nulls on unmount.
      const state = (instance?.state ?? undefined) as TState | undefined;
      return state === undefined ? (undefined as unknown as TSlice) : get(state);
    };

    const ensureRuntimeSub = (): void => {
      if (runtimeUnsub) return;
      if (!initialized) {
        cachedSlice = project();
        initialized = true;
      }
      runtimeUnsub = runtime.subscribe(instanceId, () => {
        const next = project();
        if (!Object.is(next, cachedSlice)) {
          cachedSlice = next;
          for (const l of listeners) l();
        }
      });
    };

    const store: ReadableStore<TSlice> = {
      // Re-project on every call so reads always reflect the current
      // state, even when no subscriber is wired up (e.g. before
      // `ensureRuntimeSub` has primed the cache). The Object.is gate
      // keeps the cached reference stable across calls when the
      // projection didn't change — the contract React's
      // `useSyncExternalStore` enforces.
      getSnapshot: () => {
        const next = project();
        if (!initialized || !Object.is(next, cachedSlice)) {
          cachedSlice = next;
          initialized = true;
        }
        return cachedSlice;
      },
      subscribe: (listener) => {
        ensureRuntimeSub();
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0 && runtimeUnsub) {
            runtimeUnsub();
            runtimeUnsub = null;
          }
        };
      },
    };

    cache.set(key, { store: store as ReadableStore<unknown> });
    return store;
  }

  return {
    readable: buildReadable,
    writable: <TSlice>(
      key: string,
      opts: {
        readonly get: (state: TState) => TSlice;
        readonly set: (
          value: TSlice,
        ) => Partial<TState> | ((prev: TState) => Partial<TState> | TState);
      },
    ): WritableStore<TSlice> => {
      const existing = cache.get(key);
      if (existing && "set" in existing.store) {
        return existing.store as WritableStore<TSlice>;
      }
      // Build the readable view first (or reuse the cached one), then
      // attach `set` and upgrade the cache entry so subsequent
      // `readable(key)` calls also see the writable form.
      const readable = buildReadable(key, opts.get);
      const writable: WritableStore<TSlice> = {
        getSnapshot: readable.getSnapshot,
        subscribe: readable.subscribe,
        set: (value) => {
          runtime.dispatch(instanceId, opts.set(value) as never);
        },
      };
      cache.set(key, { store: writable as WritableStore<unknown> });
      return writable;
    },
  };
}

/**
 * No-op {@link ZoneStores} for the outlet's preload paths. Preload
 * inspects `module`/`entry` on the selector's return value; it never
 * subscribes or dispatches through stores baked into `input`, so a
 * stub that returns inert stores is correct (and avoids closing over
 * a real runtime + instance handle on a path that doesn't need them).
 */
export const noopZoneStores: ZoneStores<unknown> = {
  readable: () => ({
    getSnapshot: () => undefined as never,
    subscribe: () => () => {},
  }),
  writable: () => ({
    getSnapshot: () => undefined as never,
    subscribe: () => () => {},
    set: () => {},
  }),
};
