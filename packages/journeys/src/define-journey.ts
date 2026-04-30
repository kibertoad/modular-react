import type { JourneyDefinition, ModuleTypeMap } from "./types.js";

/**
 * Declare a journey with full type inference on entry/exit contracts,
 * transitions, and the journey's private state.
 *
 * **Why the empty parens?** TypeScript can't partially infer generics: if
 * `defineJourney` took `<TModules, TState, TInput, TOutput>` in a single
 * call, you'd either have to spell all four — losing the ability to infer
 * `TInput` from `initialState`'s parameter — or spell none, losing the
 * ability to narrow `TModules` / `TState`. The two-call shape splits the
 * generics so `TModules` + `TState` (+ optional `TOutput`) are explicit
 * (first call) while `TInput` is inferred from the definition object
 * (second call).
 *
 * ```ts
 * defineJourney<OnboardingModules, OnboardingState>()({ ... });
 * defineJourney<OnboardingModules, OnboardingState, { token: string }>()({
 *   id: "customer-onboarding",
 *   version: "1.0.0",
 *   initialState: (input: { customerId: string }) => ({ ... }),
 *   start: (state) => ({ module: "profile", entry: "review", input: { customerId: state.customerId } }),
 *   transitions: {
 *     billing: {
 *       collect: {
 *         done: ({ output }) => ({ complete: { token: output.token } }),
 *         //                                  ^ checked against { token: string }
 *       },
 *     },
 *   },
 * });
 * ```
 *
 * Zero runtime cost — the definition is returned unchanged.
 */
export const defineJourney =
  // `TOutput = unknown` keeps existing two-generic call sites compiling —
  // `complete: { ...arbitrary }` assigns to `unknown`. New journeys that
  // want their terminal payload type-checked (and surfaced to a parent's
  // resume handler) explicitly pass it as the third generic.
  <TModules extends ModuleTypeMap, TState, TOutput = unknown>() =>
  // `TInput = void` matters: when `initialState` takes no parameter
  // there is no inferable position for TInput, and without a default TS
  // falls back to `unknown`. That silently disables the rest-tuple
  // ergonomics on `runtime.start(handle)` and `simulateJourney(journey)`
  // — callers would still have to pass `undefined`. Defaulting to `void`
  // keeps "no input" journeys truly zero-arg.
  <TInput = void>(definition: JourneyDefinition<TModules, TState, TInput, TOutput>) =>
    definition;
