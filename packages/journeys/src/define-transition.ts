import type { EntryNamesOf, ModuleTypeMap } from "@modular-react/core";

/**
 * `"moduleId/entryName"` reference into the journey's module map. Used by
 * {@link defineTransition} to declare which entries a transition can advance
 * into; the host's auto-preloader reads these refs to warm chunks for the
 * exact next-step candidates from the current step.
 *
 * When `TModules` is bound (via the `defineTransition`'s first generic), this
 * narrows to the union of literal `${moduleId}/${entryName}` strings the
 * journey actually exposes — IDE autocomplete + typo-checking for free. When
 * left at the default `ModuleTypeMap`, it widens to `${string}/${string}`.
 */
export type StepRef<TModules extends ModuleTypeMap> = {
  [M in keyof TModules & string]: `${M}/${EntryNamesOf<TModules[M]> & string}`;
}[keyof TModules & string];

/**
 * A transition handler with declared `targets` metadata attached. Functionally
 * identical to the bare handler the journey runtime expects — the call
 * signature is preserved verbatim, so the value drops directly into a
 * `transitions[mod][entry][exit]` slot. The host's preloader walks
 * `Object.values(perEntry)` and reads each handler's `.targets` to schedule
 * speculative imports.
 */
export type AnnotatedTransitionHandler<
  THandler extends (ctx: any) => any,
  TTargets extends readonly string[],
> = THandler & { readonly targets: TTargets };

/**
 * Wrap a transition handler with a static declaration of which entry points
 * it may advance into. Two effects:
 *
 *   1. **Runtime — preload precision.** `<JourneyOutlet>`'s default
 *      `preload="precise"` mode reads `targets` and warms exactly those
 *      entries' chunks during idle time, so navigating Next finds the
 *      chunk already cached. Bare-function handlers contribute nothing
 *      to precise mode (they fall back to `preload="aggressive"` if set).
 *
 *   2. **Type-level — autocomplete on `targets`.** When the journey's
 *      `TModules` is bound through the first generic, `targets` is
 *      constrained to the union of `"moduleId/entryName"` literals the
 *      journey exposes. The handler signature itself is forwarded
 *      unchanged, so the existing `TransitionMap` slot type-checks the
 *      assignment normally — `defineTransition` is invisible to the
 *      runtime's call site at `runtime.ts:1338-1359`.
 *
 * @example
 * ```ts
 * profileComplete: defineTransition({
 *   targets: ["plan/choose", "billing/collect"],
 *   handle: ({ output, state }) => ({
 *     next:
 *       output.hint === "cheap"
 *         ? { module: "plan", entry: "choose", input: { customerId: state.customerId, hint: output.hint } }
 *         : { module: "billing", entry: "collect", input: { customerId: state.customerId, amount: 0 } },
 *   }),
 * }),
 * ```
 */
export function defineTransition<
  TModules extends ModuleTypeMap = ModuleTypeMap,
  THandler extends (ctx: any) => any = (ctx: any) => any,
  const TTargets extends readonly StepRef<TModules>[] = readonly StepRef<TModules>[],
>(spec: {
  readonly targets: TTargets;
  readonly handle: THandler;
}): AnnotatedTransitionHandler<THandler, TTargets> {
  const handler = spec.handle as AnnotatedTransitionHandler<THandler, TTargets>;
  // Non-enumerable so structural iteration (Object.entries on the transitions
  // map, JSON serialization of journey snapshots) does not surface this field;
  // the preloader reads it via direct property access.
  Object.defineProperty(handler, "targets", {
    value: Object.freeze([...spec.targets]) as TTargets,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return handler;
}

/**
 * Narrow a value to the annotated form. Used by the auto-preloader to read
 * `targets` from a handler without trusting structural lookups on `unknown`.
 */
export function isAnnotatedTransition(
  value: unknown,
): value is AnnotatedTransitionHandler<(ctx: any) => any, readonly string[]> {
  if (typeof value !== "function") return false;
  const targets = (value as { targets?: unknown }).targets;
  return Array.isArray(targets) && targets.every((t) => typeof t === "string");
}
