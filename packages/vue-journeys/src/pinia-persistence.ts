import type { SerializedJourney, SyncJourneyPersistence } from "@modular-frontend/journeys-engine";

/**
 * The minimal structural slice of a Pinia store this adapter needs: read the
 * reactive `$state` and mutate it through `$patch`. A real Pinia store (option
 * or setup) satisfies this, but the shape is intentionally structural so this
 * package takes **no** `pinia` dependency — the caller brings their own store.
 *
 * This is the load-bearing design choice behind decision D3
 * (`docs/vue-support-tracker.md`): "do not take a Pinia dependency in runtime
 * packages". The adapter is a thin bridge over a store the consumer already
 * owns, not a reason for every `@modular-vue/journeys` consumer to pull Pinia.
 */
export interface PiniaJourneyPersistenceStore {
  /** The store's reactive state object (`store.$state`). */
  readonly $state: Record<string, unknown>;
  /** Apply a mutation to `$state` (`store.$patch((s) => { … })`). */
  $patch(mutator: (state: Record<string, unknown>) => void): void;
}

export interface PiniaJourneyPersistenceOptions<TInput> {
  /**
   * Compute the persistence key from the journey id and starting input.
   * Must be deterministic — `runtime.start()` probes this key to find an
   * existing instance and achieve start-means-resume idempotency.
   */
  readonly keyFor: (ctx: { journeyId: string; input: TInput }) => string;
  /**
   * The Pinia store that owns the serialized-journey record, or a lazy getter
   * returning it (or `null`). The getter is invoked on every call, mirroring
   * `createWebStoragePersistence`'s `storage` option — pass a getter when the
   * store is created inside a Pinia scope resolved after this adapter is
   * constructed, or `null` to force the no-op (server / no-store) path.
   */
  readonly store: PiniaJourneyPersistenceStore | (() => PiniaJourneyPersistenceStore | null);
  /**
   * Property on the store's `$state` that holds the
   * `Record<string, SerializedJourney<TState>>` map. Defaults to `"journeys"`.
   * The property is created on first `save` if absent.
   */
  readonly stateKey?: string;
  /**
   * When true (default), stored blobs are deep-cloned on both `save` and
   * `load`, so `load` returns a plain object detached from the store: callers
   * mutating it cannot corrupt the reactive state, and a mutated source blob
   * cannot corrupt what was persisted. The clone is a structural JSON round-trip
   * (`JSON.parse(JSON.stringify(...))`), which matches the `SerializedJourney`
   * contract the engine persists — plain JSON — but, like any storage adapter,
   * drops `undefined` fields and cannot carry `Date` / `Map` / `Set`. Journey
   * blobs are already JSON by construction, so this only bites if a custom
   * persistence layer routes non-serializable state through here.
   *
   * When false, the clone is skipped. Note Pinia still wraps stored state in a
   * reactive proxy, so `load` never returns the exact reference passed to
   * `save`; instead it returns the **live** store entry (mutations to it are
   * visible on the next `load` and to Pinia devtools). Use only when you have
   * verified nobody mutates the loaded blob out from under the store.
   */
  readonly clone?: boolean;
}

/**
 * `JourneyPersistence` backed by a Pinia store — the Vue-ecosystem analog of
 * `createWebStoragePersistence`, keeping journey state inside the app's
 * existing Pinia store tree instead of a parallel storage mechanism.
 *
 * Because the record lives in Pinia, in-flight journeys participate in the
 * app's Pinia devtools / timeline, and a single `store.$reset()` (or clearing
 * the record) drops every persisted journey through one path the app already
 * owns.
 *
 * Semantics match the stock adapters exactly: `keyFor` derives the key,
 * `load` returns the stored blob (or `null`), `save` writes it, `remove`
 * deletes it — so `runtime.start()` resumes an in-flight instance for the same
 * `keyFor(input)` rather than minting a fresh one.
 *
 * Pure-client-safe like the web-storage adapter: pass `store` as a getter that
 * returns `null` under SSR and all four methods no-op, so the runtime mints a
 * fresh instance server-side.
 *
 * ```ts
 * // A tiny store whose only job is to hold serialized journeys.
 * const useJourneyStore = defineStore("journeys", {
 *   state: () => ({ journeys: {} as Record<string, SerializedJourney<WizardState>> }),
 * });
 *
 * export const wizardPersistence = createPiniaJourneyPersistence<{ frameId: string }, WizardState>({
 *   keyFor: ({ journeyId, input }) => `journey:${input.frameId}:${journeyId}`,
 *   store: () => useJourneyStore(),
 * });
 * ```
 */
export function createPiniaJourneyPersistence<TInput, TState>(
  options: PiniaJourneyPersistenceOptions<TInput>,
): SyncJourneyPersistence<TState, TInput> {
  const { keyFor } = options;
  const stateKey = options.stateKey ?? "journeys";
  const shouldClone = options.clone !== false;

  const copy = (blob: SerializedJourney<TState>): SerializedJourney<TState> =>
    shouldClone ? (JSON.parse(JSON.stringify(blob)) as SerializedJourney<TState>) : blob;

  const resolve = (): PiniaJourneyPersistenceStore | null => {
    const s = typeof options.store === "function" ? options.store() : options.store;
    return s ?? null;
  };

  const readRecord = (
    s: PiniaJourneyPersistenceStore,
  ): Record<string, SerializedJourney<TState>> | undefined => {
    const rec = s.$state[stateKey];
    return rec && typeof rec === "object"
      ? (rec as Record<string, SerializedJourney<TState>>)
      : undefined;
  };

  return {
    keyFor,
    load: (key) => {
      const s = resolve();
      if (!s) return null;
      const blob = readRecord(s)?.[key];
      return blob ? copy(blob) : null;
    },
    save: (key, blob) => {
      const s = resolve();
      if (!s) return;
      const stored = copy(blob);
      s.$patch((state) => {
        const existing = state[stateKey];
        const rec = (
          existing && typeof existing === "object" ? existing : (state[stateKey] = {})
        ) as Record<string, SerializedJourney<TState>>;
        rec[key] = stored;
      });
    },
    remove: (key) => {
      const s = resolve();
      if (!s) return;
      s.$patch((state) => {
        const rec = state[stateKey] as Record<string, SerializedJourney<TState>> | undefined;
        if (rec) delete rec[key];
      });
    },
  };
}
