import type { CompositionPersistence, SerializedComposition } from "./types.js";

/**
 * Narrowed variant of {@link CompositionPersistence} whose methods are
 * guaranteed synchronous. Stock adapters return this shape so direct
 * `.load(key)` callers don't need to discriminate sync vs async.
 *
 * Structurally assignable to `CompositionPersistence<TState, TInput>`, so
 * the value can still be passed to `registerComposition({ persistence })`
 * without widening.
 */
export interface SyncCompositionPersistence<TState, TInput = unknown> {
  readonly keyFor: (ctx: { compositionId: string; input: TInput }) => string;
  readonly load: (key: string) => SerializedComposition<TState> | null;
  readonly save: (key: string, blob: SerializedComposition<TState>) => void;
  readonly remove: (key: string) => void;
}

/**
 * Identity helper that ties a persistence adapter's `keyFor` input to a
 * composition's `TInput` so callers get compile-time checking on
 * per-document / per-session keys. Zero runtime cost — the adapter is
 * returned as-is.
 */
export function defineCompositionPersistence<TInput, TState>(
  adapter: CompositionPersistence<TState, TInput>,
): CompositionPersistence<TState, TInput> {
  return adapter;
}

// ---------------------------------------------------------------------------
// Web Storage adapter (localStorage / sessionStorage)
// ---------------------------------------------------------------------------

export interface WebStorageCompositionPersistenceOptions<TInput> {
  readonly keyFor: (ctx: { compositionId: string; input: TInput }) => string;
  /**
   * The `Storage` instance to read from and write to. Accepts a direct
   * reference or a lazy getter; getters are invoked on every call so SSR
   * stays safe (the default returns `null` when `localStorage` is
   * undefined on the global).
   */
  readonly storage?: Storage | null | (() => Storage | null);
}

/**
 * `CompositionPersistence` backed by the Web Storage API. SSR-safe —
 * when `storage` resolves to `null` all four methods no-op and `load`
 * returns `null`, so the runtime mints a fresh instance.
 *
 * Corrupt entries (invalid JSON) are removed lazily on `load` so a
 * single bad write doesn't block future loads.
 *
 * `keyFor` must be **deterministic** over `{ compositionId, input }` and
 * must not close over ambient state (current user, session id) that can
 * change between calls — the runtime uses the same key both to dedupe
 * live instances (via `keyIndex`) and to address the storage backend,
 * so a non-stable key produces two records under the same logical
 * identity and silently drops persisted state on reload.
 */
export function createWebStorageCompositionPersistence<TInput, TState>(
  options: WebStorageCompositionPersistenceOptions<TInput>,
): SyncCompositionPersistence<TState, TInput> {
  const { keyFor, storage } = options;

  const resolve = (): Storage | null => {
    try {
      if (typeof storage === "function") return storage();
      if (storage !== undefined) return storage;
      return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
      return null;
    }
  };

  return {
    keyFor,
    load: (key) => {
      const s = resolve();
      if (!s) return null;
      let raw: string | null;
      try {
        raw = s.getItem(key);
      } catch {
        return null;
      }
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as SerializedComposition<TState>;
      } catch {
        try {
          s.removeItem(key);
        } catch {
          // Best-effort cleanup.
        }
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
// In-memory adapter (tests / SSR)
// ---------------------------------------------------------------------------

export interface MemoryCompositionPersistenceOptions<TInput, TState> {
  readonly keyFor: (ctx: { compositionId: string; input: TInput }) => string;
  /** Optional seed entries. */
  readonly initial?: Iterable<readonly [string, SerializedComposition<TState>]>;
  /**
   * When true (default), blobs are deep-cloned on save/load so callers
   * mutating the returned object can't corrupt the backing store.
   */
  readonly clone?: boolean;
}

export interface MemoryCompositionPersistence<TInput, TState>
  extends SyncCompositionPersistence<TState, TInput> {
  readonly size: () => number;
  readonly entries: () => ReadonlyArray<readonly [string, SerializedComposition<TState>]>;
  readonly clear: () => void;
}

/**
 * Map-backed `CompositionPersistence` for tests and SSR. Gives tests a
 * canonical isolated store (no bleed between cases) and keeps the
 * runtime's persistence code paths exercised.
 *
 * Cloning prefers `structuredClone` (which preserves `Date`, `Map`,
 * `Set`, `undefined`, typed arrays, etc.) and falls back to JSON
 * round-tripping where unavailable. The JSON path is lossy — composition
 * authors persisting any of the above through the memory adapter in tests
 * should run on a modern Node where `structuredClone` exists.
 */
const cloneBlob: <T>(value: T) => T =
  typeof structuredClone === "function"
    ? <T,>(value: T): T => structuredClone(value)
    : <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createMemoryCompositionPersistence<TInput, TState>(
  options: MemoryCompositionPersistenceOptions<TInput, TState>,
): MemoryCompositionPersistence<TInput, TState> {
  const shouldClone = options.clone !== false;
  const copy = (blob: SerializedComposition<TState>): SerializedComposition<TState> =>
    shouldClone ? cloneBlob(blob) : blob;

  const store = new Map<string, SerializedComposition<TState>>(
    options.initial ? Array.from(options.initial, ([k, v]) => [k, copy(v)] as const) : undefined,
  );

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
