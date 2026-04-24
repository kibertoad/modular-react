import type { JourneyDefinition, ModuleTypeMap } from "./types.js";

/**
 * Declare a journey with full type inference on entry/exit contracts,
 * transitions, and the journey's private state.
 *
 * **Why the empty parens?** TypeScript can't partially infer generics: if
 * `defineJourney` took `<TModules, TState, TInput>` in a single call, you'd
 * either have to spell all three — losing the ability to infer `TInput`
 * from `initialState`'s parameter — or spell none, losing the ability to
 * narrow `TModules` / `TState`. The two-call shape splits the generics
 * so `TModules` + `TState` are explicit (first call) while `TInput` is
 * inferred from the definition object (second call).
 *
 * ```ts
 * defineJourney<OnboardingModules, OnboardingState>()({
 *   id: "customer-onboarding",
 *   version: "1.0.0",
 *   initialState: (input: { customerId: string }) => ({ ... }),
 *   // TInput is inferred as { customerId: string } here
 *   start: (state) => ({ module: "profile", entry: "review", input: { customerId: state.customerId } }),
 *   transitions: { ... },
 * });
 * ```
 *
 * Zero runtime cost — the definition is returned unchanged.
 */
export const defineJourney =
  <TModules extends ModuleTypeMap, TState>() =>
  // `TInput = void` matters: when `initialState` takes no parameter
  // there is no inferable position for TInput, and without a default TS
  // falls back to `unknown`. That silently disables the rest-tuple
  // ergonomics on `runtime.start(handle)` and `simulateJourney(journey)`
  // — callers would still have to pass `undefined`. Defaulting to `void`
  // keeps "no input" journeys truly zero-arg.
  <TInput = void>(definition: JourneyDefinition<TModules, TState, TInput>) =>
    definition;
