import type { JourneyHandleRef } from "@modular-react/core";
import type { JourneyDefinition, ModuleTypeMap } from "./types.js";

/**
 * Lightweight token a journey exports so modules and shells can open it
 * with a typed `input` without pulling in the journey's runtime code.
 * Structurally identical to `JourneyHandleRef` in `@modular-react/core` —
 * re-exported here so authors have a single canonical name to import.
 *
 * The `__input` field is phantom: it never holds a value at runtime, it
 * only carries the input type for the `start(handle, input)` overload.
 */
export type JourneyHandle<TId extends string = string, TInput = unknown> = JourneyHandleRef<
  TId,
  TInput
>;

/**
 * Build a handle from a journey definition. Runtime identity is just
 * `{ id: def.id }`; the returned object is typed so callers get
 * `input`-checking through the `start` overload.
 */
export function defineJourneyHandle<TModules extends ModuleTypeMap, TState, TInput>(
  def: JourneyDefinition<TModules, TState, TInput>,
): JourneyHandle<string, TInput> {
  return { id: def.id };
}
