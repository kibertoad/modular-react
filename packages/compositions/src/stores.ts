import { isDevEnv } from "@modular-react/core";
import type { ReadableStore, WritableStore } from "@modular-react/core";
import type { CompositionInstanceId, CompositionRuntime } from "./types.js";

/**
 * Author-facing store factory exposed on {@link CompositionZoneSelectorCtx.stores}.
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
export interface CompositionZoneStores<TState> {
  /**
   * Get-or-create a read-only store projecting a slice of composition
   * state. Stable per `(instance, key)`.
   */
  readable<TSlice>(key: string, get: (state: TState) => TSlice): ReadableStore<TSlice>;
  /**
   * Get-or-create a writable store projecting a slice of composition
   * state. `set` translates a slice value into a state-updater that the
   * composition's runtime applies via `dispatch`.
   *
   * **First-writer-wins.** The `get` and `set` closures from the *first*
   * `writable(key, …)` call for a given key are the ones the returned
   * store closes over for its entire lifetime. Subsequent calls with the
   * same key return the same store object and the new closures are
   * dropped; in dev they're invoked as behavioural drift probes that
   * warn once per key on disagreement. This is what makes the store
   * reference stable across selector re-runs (panels using
   * `useSyncExternalStore` would otherwise re-subscribe on every render).
   * Selectors should keep `get`/`set` pure functions of `state`/`value`
   * and not close over per-render data.
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
  /**
   * The first `get` projection registered under this key. Selectors
   * pass fresh inline closures on every run (the expected pattern),
   * so we don't compare identity — we keep the original and, in
   * dev, probe it against later projections for behavioural drift
   * (see {@link probeDrift}).
   */
  readonly firstGet: (state: unknown) => unknown;
  /** First `set` updater, present iff this entry was upgraded to writable. */
  firstSet?: (value: unknown) => unknown;
  /** Dev-only latch — emit each drift warning at most once per key. */
  warnedGetDrift?: boolean;
  warnedSetDrift?: boolean;
}

/**
 * Build a {@link CompositionZoneStores} bound to a specific composition instance.
 * Caches per-key stores so repeated `readable("foo", ...)` /
 * `writable("foo", ...)` calls return the same object.
 *
 * Designed to be constructed **once per `(runtime, instanceId)`** —
 * typically via `useMemo` in the outlet's render path. The cache lives
 * for the outlet mount's lifetime; when the instance disposes and the
 * outlet unmounts, the cache (and its store-internal listener
 * registrations) are dropped.
 */
export function createCompositionZoneStores<TState>(
  runtime: CompositionRuntime,
  instanceId: CompositionInstanceId,
): CompositionZoneStores<TState> {
  const cache = new Map<string, CacheEntry>();
  const dev = isDevEnv();

  // Sample one current state read for the drift probes below. Pulled
  // through a helper so callers don't have to deal with the
  // mid-disposal `null`.
  const sampleState = (): TState | undefined => {
    const instance = runtime.getInstance(instanceId);
    return (instance?.state ?? undefined) as TState | undefined;
  };

  /**
   * Dev-only check: invoke the cached projection AND the new one against
   * the live state. If they disagree, warn once per key. Catches the
   * "first-writer-wins" footgun where a selector silently changes its
   * projection logic across re-runs (e.g. a `get` whose body depends
   * on a varying closure variable) and the cache keeps serving the
   * original. Identity comparison would fire on every render under
   * normal inline-closure usage, so we compare behaviour instead.
   */
  const probeGetDrift = (entry: CacheEntry, key: string, get: (state: TState) => unknown): void => {
    if (!dev || entry.warnedGetDrift) return;
    const state = sampleState();
    if (state === undefined) return;
    try {
      const cachedValue = entry.firstGet(state);
      const newValue = get(state);
      if (!Object.is(cachedValue, newValue)) {
        entry.warnedGetDrift = true;
        console.warn(
          `[@modular-react/compositions] zoneStores key "${key}": ` +
            `subsequent \`get\` projection returned a different value than the cached one. ` +
            `The cache keeps the first projection — use a different key if you intended a new projection.`,
        );
      }
    } catch {
      // Projection threw — silently skip. The store's normal read path
      // would have surfaced this already.
    }
  };

  const probeSetDrift = (
    entry: CacheEntry,
    key: string,
    set: (value: unknown) => unknown,
  ): void => {
    if (!dev || entry.warnedSetDrift || !entry.firstSet) return;
    const state = sampleState();
    if (state === undefined) return;
    let probeValue: unknown;
    try {
      probeValue = entry.firstGet(state);
    } catch {
      return;
    }
    try {
      const cachedUpdater = entry.firstSet(probeValue);
      const newUpdater = set(probeValue);
      // The shape returned by `set` is either a partial object or an
      // updater function. We compare via `JSON.stringify` of the
      // partial form (functions stringify to undefined, in which case
      // we fall back to identity). The check is best-effort — a
      // false negative is fine, a false positive on legitimately
      // equivalent updaters would be misleading.
      const cachedSerialized =
        typeof cachedUpdater === "function" ? undefined : safeStringify(cachedUpdater);
      const newSerialized =
        typeof newUpdater === "function" ? undefined : safeStringify(newUpdater);
      if (
        cachedSerialized !== undefined &&
        newSerialized !== undefined &&
        cachedSerialized !== newSerialized
      ) {
        entry.warnedSetDrift = true;
        console.warn(
          `[@modular-react/compositions] zoneStores key "${key}": ` +
            `subsequent \`set\` produced a different state update than the cached one. ` +
            `The cache keeps the first \`set\` — use a different key if you intended new write semantics.`,
        );
      }
    } catch {
      // ignore
    }
  };

  function buildReadable<TSlice>(
    key: string,
    get: (state: TState) => TSlice,
  ): ReadableStore<TSlice> {
    const existing = cache.get(key);
    if (existing) {
      probeGetDrift(existing, key, get as (state: TState) => unknown);
      return existing.store as ReadableStore<TSlice>;
    }

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

    cache.set(key, {
      store: store as ReadableStore<unknown>,
      firstGet: get as (state: unknown) => unknown,
    });
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
        probeGetDrift(existing, key, opts.get as (state: TState) => unknown);
        probeSetDrift(existing, key, opts.set as (value: unknown) => unknown);
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
      const upgraded: CacheEntry = {
        store: writable as WritableStore<unknown>,
        firstGet: opts.get as (state: unknown) => unknown,
        firstSet: opts.set as (value: unknown) => unknown,
      };
      cache.set(key, upgraded);
      return writable;
    },
  };
}

/** JSON.stringify wrapper that swallows cycles and non-serializable nodes. */
function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/**
 * No-op {@link CompositionZoneStores} for the outlet's preload paths. Preload
 * inspects `module`/`entry` on the selector's return value; it never
 * subscribes or dispatches through stores baked into `input`, so a
 * stub that returns inert stores is correct (and avoids closing over
 * a real runtime + instance handle on a path that doesn't need them).
 */
export const noopCompositionZoneStores: CompositionZoneStores<unknown> = {
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
