import type { JourneyPersistence, MaybePromise, SerializedJourney } from "./types.js";

/**
 * Input shape passed to a typed persistence adapter — same payload as
 * {@link JourneyPersistence.keyFor} but strongly typed against the journey's
 * `TInput`. Use with {@link defineJourneyPersistence} to avoid the `as` cast
 * that every adapter otherwise needs on its `keyFor` argument.
 */
export interface TypedJourneyPersistenceAdapter<TInput, TState> {
  keyFor: (ctx: { journeyId: string; input: TInput }) => string;
  load: (key: string) => MaybePromise<SerializedJourney<TState> | null>;
  save: (key: string, blob: SerializedJourney<TState>) => MaybePromise<void>;
  remove: (key: string) => MaybePromise<void>;
}

/**
 * Identity helper that ties a persistence adapter's `keyFor` input to a
 * journey's `TInput` so callers get compile-time checking on per-customer /
 * per-session keys. Zero runtime cost — the adapter is returned as-is.
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
 * ```
 */
export function defineJourneyPersistence<TInput, TState>(
  adapter: TypedJourneyPersistenceAdapter<TInput, TState>,
): JourneyPersistence<TState> {
  return adapter as unknown as JourneyPersistence<TState>;
}
