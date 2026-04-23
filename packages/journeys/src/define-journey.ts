import type { JourneyDefinition, ModuleTypeMap } from "./types.js";

/**
 * Declare a journey with full type inference on entry/exit contracts,
 * transitions, and the journey's private state.
 *
 * The call is curried so that `TInput` can be inferred from `initialState`'s
 * parameter while `TModules` and `TState` are supplied explicitly:
 *
 * ```ts
 * defineJourney<OnboardingModules, OnboardingState>()({
 *   id: "customer-onboarding",
 *   version: "1.0.0",
 *   initialState: (input: { customerId: string }) => ({ ... }),
 *   // TInput is inferred as { customerId: string }
 *   start: (state) => ({ module: "profile", entry: "review", input: { customerId: state.customerId } }),
 *   transitions: { ... },
 * });
 * ```
 *
 * Zero runtime cost — the definition is returned unchanged.
 */
export const defineJourney =
  <TModules extends ModuleTypeMap, TState>() =>
  <TInput>(definition: JourneyDefinition<TModules, TState, TInput>) =>
    definition;
