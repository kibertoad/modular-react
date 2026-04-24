import type { JourneyPersistence, SerializedJourney } from "./types.js";

/**
 * Identity helper that ties a persistence adapter's `keyFor` input to a
 * journey's `TInput` so callers get compile-time checking on per-customer /
 * per-session keys. Zero runtime cost — the adapter is returned as-is.
 *
 * The return type preserves both `TInput` and `TState`, so shells calling
 * `persistence.keyFor({ input })` *outside* the runtime (e.g. to probe
 * storage before opening a journey tab) still see the journey's typed
 * input shape — no `input: unknown` erasure at the boundary.
 *
 * ```ts
 * interface CustomerInput { customerId: string }
 *
 * const journeyPersistence = defineJourneyPersistence<CustomerInput, MyState>({
 *   keyFor: ({ input }) => `journey:${input.customerId}:onboarding`,
 *   load:   (k) => backend.load(k),
 *   save:   (k, b) => backend.save(k, b),
 *   remove: (k) => backend.remove(k),
 * });
 *
 * // Outside the runtime — `input` is typed as CustomerInput:
 * const key = journeyPersistence.keyFor({
 *   journeyId: "onboarding",
 *   input: { customerId: "C-1" },
 * });
 * ```
 */
export function defineJourneyPersistence<TInput, TState>(
  adapter: JourneyPersistence<TState, TInput>,
): JourneyPersistence<TState, TInput> {
  return adapter;
}

/**
 * @deprecated Alias kept for source compatibility. Use
 * {@link JourneyPersistence} directly — it now carries a `TInput` generic.
 */
export type TypedJourneyPersistenceAdapter<TInput, TState> = JourneyPersistence<TState, TInput>;

// ---------------------------------------------------------------------------
// Web Storage adapter (localStorage / sessionStorage)
// ---------------------------------------------------------------------------

export interface WebStoragePersistenceOptions<TInput> {
  /**
   * Compute the persistence key from the journey id and starting input.
   * Must be deterministic — `runtime.start()` probes this key to find an
   * existing instance and achieve idempotency.
   */
  readonly keyFor: (ctx: { journeyId: string; input: TInput }) => string;
  /**
   * The `Storage` instance to read from and write to. Accepts either a
   * direct reference or a lazy getter; the getter is invoked on every
   * call, which keeps SSR safe (the default returns `null` when
   * `localStorage` is not defined on the global).
   *
   * Defaults to `globalThis.localStorage` (or `null` under SSR). Pass
   * `sessionStorage` for tab-scoped persistence, or any `Storage`-shaped
   * stub for custom backends.
   */
  readonly storage?: Storage | null | (() => Storage | null);
}

/**
 * `JourneyPersistence` backed by the Web Storage API
 * (`localStorage` / `sessionStorage`). Covers the 80% case: a few KB of
 * JSON per journey-per-customer, read on mount, written on every transition.
 *
 * SSR-safe — when `storage` resolves to `null` (server rendering, private
 * modes where storage is disabled) all four methods no-op and `load`
 * returns `null`, so the runtime mints a fresh instance as it would
 * without persistence configured.
 *
 * Corrupt entries (invalid JSON) are removed lazily on `load` so a single
 * bad write doesn't block future loads for the same key.
 *
 * ```ts
 * export const journeyPersistence = createWebStoragePersistence<
 *   OnboardingInput,
 *   OnboardingState
 * >({
 *   keyFor: ({ journeyId, input }) =>
 *     `journey:${input.customerId}:${journeyId}`,
 * });
 *
 * // Tab-scoped, cleared when the tab closes:
 * const sessionScoped = createWebStoragePersistence<MyInput, MyState>({
 *   keyFor: ({ journeyId, input }) => `s:${input.id}:${journeyId}`,
 *   storage: typeof sessionStorage !== "undefined" ? sessionStorage : null,
 * });
 * ```
 *
 * **Limits.** `localStorage` is synchronous and capped at ~5 MB per origin.
 * Writes throw `QuotaExceededError` when full; the error bubbles so the
 * app can surface it. If a journey holds large state or offline-first
 * matters, write a custom adapter against IndexedDB.
 */
export function createWebStoragePersistence<TInput, TState>(
  options: WebStoragePersistenceOptions<TInput>,
): JourneyPersistence<TState, TInput> {
  const { keyFor, storage } = options;

  const resolve = (): Storage | null => {
    if (typeof storage === "function") return storage();
    if (storage !== undefined) return storage;
    return typeof localStorage !== "undefined" ? localStorage : null;
  };

  return {
    keyFor,
    load: (key) => {
      const s = resolve();
      if (!s) return null;
      const raw = s.getItem(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as SerializedJourney<TState>;
      } catch {
        // Don't let a single bad write wedge future loads for this key.
        s.removeItem(key);
        return null;
      }
    },
    save: (key, blob) => {
      const s = resolve();
      if (!s) return;
      s.setItem(key, JSON.stringify(blob));
    },
    remove: (key) => {
      const s = resolve();
      if (!s) return;
      s.removeItem(key);
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory adapter
// ---------------------------------------------------------------------------

export interface MemoryPersistenceOptions<TInput, TState> {
  /** Same contract as `WebStoragePersistenceOptions.keyFor`. */
  readonly keyFor: (ctx: { journeyId: string; input: TInput }) => string;
  /**
   * Optional seed entries. Handy for tests that want the runtime to find a
   * pre-persisted journey on first `start()` without walking through the
   * flow to produce the blob.
   */
  readonly initial?: Iterable<readonly [string, SerializedJourney<TState>]>;
  /**
   * When true (default), stored blobs are deep-cloned on both `save` and
   * `load` so callers mutating the returned object can't corrupt the
   * backing store. Set to `false` to skip the clone in hot test loops
   * where you've verified nobody mutates the blob.
   */
  readonly clone?: boolean;
}

/**
 * `JourneyPersistence` augmented with test-only inspection helpers
 * (`size`, `entries`, `clear`). The core four methods satisfy
 * `JourneyPersistence<TState, TInput>` so the value can be passed to
 * `registerJourney({ persistence })` directly.
 */
export interface MemoryPersistence<TInput, TState> extends JourneyPersistence<TState, TInput> {
  /** Number of entries currently stored. */
  readonly size: () => number;
  /** Snapshot of all `[key, blob]` pairs. Each blob is cloned if cloning is enabled. */
  readonly entries: () => ReadonlyArray<readonly [string, SerializedJourney<TState>]>;
  /** Drop all entries. */
  readonly clear: () => void;
}

/**
 * Map-backed `JourneyPersistence` for tests and SSR. Gives tests a
 * canonical isolated store (no bleed between cases, no `localStorage`
 * mocking) and keeps the runtime's persistence code paths exercised.
 *
 * On SSR, it's a safe "persistence is configured but nothing survives
 * the request" mode — every start mints a fresh instance, and save /
 * remove are no-ops from the client's perspective.
 *
 * ```ts
 * const store = createMemoryPersistence<MyInput, MyState>({
 *   keyFor: ({ journeyId, input }) => `${journeyId}:${input.id}`,
 * });
 *
 * const runtime = createJourneyRuntime(
 *   [{ definition: myJourney, options: { persistence: store } }],
 *   { modules },
 * );
 *
 * // Tests can assert directly against the store:
 * expect(store.size()).toBe(1);
 * ```
 */
export function createMemoryPersistence<TInput, TState>(
  options: MemoryPersistenceOptions<TInput, TState>,
): MemoryPersistence<TInput, TState> {
  const store = new Map<string, SerializedJourney<TState>>(options.initial);
  const shouldClone = options.clone !== false;

  const copy = (blob: SerializedJourney<TState>): SerializedJourney<TState> =>
    shouldClone ? (JSON.parse(JSON.stringify(blob)) as SerializedJourney<TState>) : blob;

  return {
    keyFor: options.keyFor,
    load: (key) => {
      const blob = store.get(key);
      return blob ? copy(blob) : null;
    },
    save: (key, blob) => {
      store.set(key, copy(blob));
    },
    remove: (key) => {
      store.delete(key);
    },
    size: () => store.size,
    entries: () => Array.from(store, ([k, v]) => [k, copy(v)] as const),
    clear: () => {
      store.clear();
    },
  };
}
