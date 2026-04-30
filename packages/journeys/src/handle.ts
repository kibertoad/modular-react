import type { InvokeSpec, JourneyHandleRef } from "@modular-react/core";
import type { JourneyDefinition, ModuleTypeMap } from "./types.js";

/**
 * Lightweight token a journey exports so modules and shells can open it
 * with a typed `input` (and a typed `outcome.payload` when invoked from a
 * parent journey) without pulling in the journey's runtime code.
 * Structurally identical to `JourneyHandleRef` in `@modular-react/core` —
 * re-exported here so authors have a single canonical name to import.
 *
 * The `__input` and `__output` fields are phantom: they never hold values
 * at runtime, they only carry types for the `start(handle, input)`
 * overload and a parent journey's resume handler signature.
 */
export type JourneyHandle<
  TId extends string = string,
  TInput = unknown,
  TOutput = unknown,
> = JourneyHandleRef<TId, TInput, TOutput>;

/**
 * Build a handle from a journey definition. Runtime identity is just
 * `{ id: def.id }`; the returned object is typed so callers get
 * `input`-checking through the `start` overload and `outcome.payload`
 * narrowing through a parent journey's resume handler.
 */
export function defineJourneyHandle<TModules extends ModuleTypeMap, TState, TInput, TOutput>(
  def: JourneyDefinition<TModules, TState, TInput, TOutput>,
): JourneyHandle<string, TInput, TOutput> {
  return { id: def.id };
}

/**
 * Typed builder for the `{ invoke }` arm of `TransitionResult`. The union
 * arm itself declares `InvokeSpec<unknown, unknown>` — bare object literals
 * like `{ invoke: { handle, input, resume } }` therefore won't catch a
 * mismatch between `input` and the handle's `TInput`. Going through this
 * helper threads both `TInput` and `TOutput` from the handle into `input`
 * (which must be assignable) and the returned spec, so authors get
 * end-to-end checking at the call site:
 *
 * ```ts
 * confirmAge: ({ state }) =>
 *   invoke({
 *     handle: verifyIdentityHandle,    // TInput = { customerId: string }
 *     input: { customerId: state.id }, // checked against TInput
 *     resume: "afterAgeVerified",
 *   }),
 * ```
 *
 * The runtime treats the result identically to a hand-built literal — the
 * only purpose is the compile-time check.
 */
export function invoke<TInput, TOutput>(spec: {
  readonly handle: JourneyHandleRef<string, TInput, TOutput>;
  readonly input: TInput;
  readonly resume: string;
}): { readonly invoke: InvokeSpec<TInput, TOutput> } {
  return { invoke: spec };
}
