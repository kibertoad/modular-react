import type { EntryNamesOf, ExitCtx, ModuleTypeMap, TransitionResult } from "@modular-react/core";

/**
 * Reference to a single entry point in the journey's module map. Used by
 * {@link defineTransition} to declare which entries a transition can advance
 * into; the host's auto-preloader reads these refs to warm chunks for the
 * exact next-step candidates from the current step.
 *
 * Same `{ module, entry }` shape as the `next:` field handlers return —
 * `StepRef` is just `StepSpec` without the runtime-computed `input`. Sharing
 * the structure avoids forcing authors to flip between an object (in `next:`)
 * and a slash-string (in `targets:`) for the same idea.
 *
 * When `TModules` is bound (via the curried `defineTransition<TModules>()`
 * binder), `module` narrows to `keyof TModules` and `entry` narrows to that
 * module's `entryPoints` keys — IDE autocomplete + typo-checking for free.
 */
export type StepRef<TModules extends ModuleTypeMap> = {
  [M in keyof TModules & string]: {
    [E in EntryNamesOf<TModules[M]> & string]: {
      readonly module: M;
      readonly entry: E;
    };
  }[EntryNamesOf<TModules[M]> & string];
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
  TTargets extends readonly { readonly module: string; readonly entry: string }[],
> = THandler & { readonly targets: TTargets };

interface DefineTransitionSpec<
  THandler extends (ctx: any) => any,
  TTargets extends readonly { readonly module: string; readonly entry: string }[],
> {
  readonly targets: TTargets;
  readonly handle: THandler;
}

function attach<
  THandler extends (ctx: any) => any,
  TTargets extends readonly { readonly module: string; readonly entry: string }[],
>(spec: DefineTransitionSpec<THandler, TTargets>): AnnotatedTransitionHandler<THandler, TTargets> {
  const handler = spec.handle as AnnotatedTransitionHandler<THandler, TTargets>;
  // Non-enumerable so structural iteration (Object.entries on the transitions
  // map, JSON serialization of journey snapshots) does not surface this field;
  // the preloader reads it via direct property access.
  Object.defineProperty(handler, "targets", {
    value: Object.freeze(spec.targets.map((t) => Object.freeze({ ...t }))) as TTargets,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return handler;
}

/**
 * Curried binder used by {@link defineTransition} to thread the journey's
 * `TModules` / `TState` / `TOutput` into the handler's contextual return
 * type — `next.module` and `next.entry` then check against the bound module
 * map's literal keys instead of widening to plain `string`.
 */
export interface TypedTransitionBinder<TModules extends ModuleTypeMap, TState, TOutput> {
  <
    TEntryInput = unknown,
    TExitOutput = unknown,
    const TTargets extends readonly StepRef<TModules>[] = readonly StepRef<TModules>[],
  >(spec: {
    readonly targets: TTargets;
    readonly handle: (
      ctx: ExitCtx<TState, TExitOutput, TEntryInput>,
    ) => TransitionResult<TModules, TState, TOutput>;
  }): AnnotatedTransitionHandler<
    (ctx: ExitCtx<TState, TExitOutput, TEntryInput>) => TransitionResult<TModules, TState, TOutput>,
    TTargets
  >;
}

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
 *   2. **Type-level — autocomplete on `targets` + narrowed handler return.**
 *      When the journey's `TModules` (and optionally `TState` / `TOutput`)
 *      is bound through the curried form `defineTransition<TModules, TState>()`,
 *      `targets` is constrained to `{ module: keyof TModules; entry: ... }`
 *      pairs and the handler's return type contextually narrows so
 *      `next.module` is checked against `keyof TModules` (not `string`).
 *
 * Two call shapes:
 *
 * ```ts
 * // Curried (recommended): bind the journey's generics once, get full
 * // contextual typing on every wrapped handler. Naming convention mirrors
 * // `selectModule` (a descriptive verb for the binder, not an
 * // abbreviation — `tx` reads as "transaction" in most codebases).
 * const transition = defineTransition<OnboardingModules, OnboardingState>();
 * profileComplete: transition({
 *   targets: [{ module: "plan", entry: "choose" }],
 *   handle: ({ output, state }) => ({
 *     state: { ...state, hint: output.hint },
 *     next: { module: "plan", entry: "choose", input: ... },
 *   }),
 * }),
 *
 * // Bare: zero-config, no contextual narrowing. Targets accept any
 * // `{ module: string; entry: string }` pair; useful for one-off handlers
 * // or for journeys whose return literals are already typed by an outer
 * // annotation.
 * cancelled: defineTransition({
 *   targets: [],
 *   handle: () => ({ abort: { reason: "user-cancelled" } }),
 * }),
 * ```
 */
export function defineTransition<
  TModules extends ModuleTypeMap,
  TState = unknown,
  TOutput = unknown,
>(): TypedTransitionBinder<TModules, TState, TOutput>;
export function defineTransition<
  THandler extends (ctx: any) => any,
  const TTargets extends readonly { readonly module: string; readonly entry: string }[],
>(spec: DefineTransitionSpec<THandler, TTargets>): AnnotatedTransitionHandler<THandler, TTargets>;
export function defineTransition(specOrNothing?: DefineTransitionSpec<any, any>): unknown {
  if (specOrNothing === undefined) {
    // Curried form — return the binder. The binder reuses `attach` so the
    // metadata-stamping logic stays in one place.
    return ((spec: DefineTransitionSpec<any, any>) => attach(spec)) as TypedTransitionBinder<
      ModuleTypeMap,
      unknown,
      unknown
    >;
  }
  return attach(specOrNothing);
}

/**
 * Narrow a value to the annotated form. Used by the auto-preloader to read
 * `targets` from a handler without trusting structural lookups on `unknown`.
 */
export function isAnnotatedTransition(
  value: unknown,
): value is AnnotatedTransitionHandler<
  (ctx: any) => any,
  readonly { readonly module: string; readonly entry: string }[]
> {
  if (typeof value !== "function") return false;
  const targets = (value as { targets?: unknown }).targets;
  if (!Array.isArray(targets)) return false;
  return targets.every(
    (t) =>
      typeof t === "object" &&
      t !== null &&
      typeof (t as { module?: unknown }).module === "string" &&
      typeof (t as { entry?: unknown }).entry === "string",
  );
}
