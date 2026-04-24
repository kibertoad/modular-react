import type { JourneyPersistence } from "./types.js";

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
