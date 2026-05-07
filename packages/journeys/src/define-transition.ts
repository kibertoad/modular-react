import type {
  EntryInputOf,
  EntryNamesOf,
  ExitCtx,
  InvokeSpec,
  ModuleTypeMap,
  TransitionResult,
} from "@modular-react/core";

/**
 * Sentinel value declaring a non-`next` outcome on a wrapped transition
 * handler. Mixed into the `targets:` array alongside `{ module, entry }`
 * step refs so a single declaration captures every branch the handler
 * may take.
 *
 *   - `"complete"` — handler may return `{ complete: ... }` (terminates).
 *   - `"abort"` — handler may return `{ abort: ... }` (terminates with abort).
 *   - `"invoke"` — handler may return `{ invoke: { handle, input, resume } }`
 *     (suspends the parent, runs a child journey). The specific handle is
 *     not type-narrowed here — the journey definition's `invokes` field
 *     remains the closed-set declaration the runtime cycle / undeclared-
 *     child guards check against.
 */
export type TerminalSentinel = "complete" | "abort" | "invoke";

/**
 * Reference to one possible outcome of a transition handler. Used by
 * {@link defineTransition} to declare every branch the handler may take;
 * the host's auto-preloader reads the `{ module, entry }` entries to warm
 * chunks for next-step candidates from the current step, and the catalog
 * harvester reads the sentinels to derive `aborts` / `completes` flags
 * without an AST walk over the handler body.
 *
 * The `{ module, entry }` shape mirrors the `next:` field handlers return —
 * a step ref is just `StepSpec` without the runtime-computed `input` —
 * so authors don't flip between two notations for the same idea.
 *
 * When `TModules` is bound (via the curried `defineTransition<TModules>()`
 * binder), `module` narrows to `keyof TModules` and `entry` narrows to that
 * module's `entryPoints` keys.
 */
export type StepRef<TModules extends ModuleTypeMap> =
  | {
      [M in keyof TModules & string]: {
        [E in EntryNamesOf<TModules[M]> & string]: {
          readonly module: M;
          readonly entry: E;
        };
      }[EntryNamesOf<TModules[M]> & string];
    }[keyof TModules & string]
  | TerminalSentinel;

/**
 * Type predicate that splits a `StepRef` into its step-ref vs sentinel arms.
 * Object refs land in the `next:` arm; sentinels gate the terminal arms.
 */
type StepObjectRef = { readonly module: string; readonly entry: string };

/**
 * Build the `next.{ module, entry, input }` shape for one declared step ref.
 * Distributes over a union of refs so multiple targets produce a union of
 * step specs under a single `next:` key (rather than separate `{ next: A }`
 * vs `{ next: B }` arms — the latter would reject conditional handler
 * returns like `next: cond ? planRef : billingRef`).
 */
type StepSpecFromRef<TModules extends ModuleTypeMap, TRef> = TRef extends {
  readonly module: infer M;
  readonly entry: infer E;
}
  ? M extends keyof TModules & string
    ? E extends EntryNamesOf<TModules[M]> & string
      ? {
          readonly module: M;
          readonly entry: E;
          readonly input: EntryInputOf<TModules[M], E>;
        }
      : never
    : never
  : never;

/**
 * Narrow the handler return type to only the arms whose targets are declared.
 * - `{ module, entry }` in targets → `next:` arm allowed (with `input` typed
 *   against the chosen entry). Multiple refs collapse into one `next:` key
 *   whose value is the union of step specs.
 * - `"complete"` in targets → `complete:` arm allowed.
 * - `"abort"` in targets → `abort:` arm allowed.
 * - `"invoke"` in targets → `invoke:` arm allowed.
 *
 * Declaring an arm in targets but never returning it is fine (over-declaring
 * is conservative for preload). Returning an arm that wasn't declared is a
 * compile error — the wrapped handler can't drift past the declaration.
 */
type NarrowedTransitionResult<
  TModules extends ModuleTypeMap,
  TState,
  TOutput,
  TTargets extends readonly StepRef<TModules>[],
> =
  | (Extract<TTargets[number], StepObjectRef> extends never
      ? never
      : {
          readonly next: StepSpecFromRef<TModules, Extract<TTargets[number], StepObjectRef>>;
          readonly state?: TState;
        })
  | (Extract<TTargets[number], "complete"> extends never
      ? never
      : { readonly complete: TOutput; readonly state?: TState })
  | (Extract<TTargets[number], "abort"> extends never
      ? never
      : { readonly abort: unknown; readonly state?: TState })
  | (Extract<TTargets[number], "invoke"> extends never
      ? never
      : { readonly invoke: InvokeSpec<unknown, unknown>; readonly state?: TState });

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
  TTargets extends readonly (StepObjectRef | TerminalSentinel)[],
> = THandler & { readonly targets: TTargets };

interface DefineTransitionSpec<
  THandler extends (ctx: any) => any,
  TTargets extends readonly (StepObjectRef | TerminalSentinel)[],
> {
  readonly targets: TTargets;
  readonly handle: THandler;
}

function attach<
  THandler extends (ctx: any) => any,
  TTargets extends readonly (StepObjectRef | TerminalSentinel)[],
>(spec: DefineTransitionSpec<THandler, TTargets>): AnnotatedTransitionHandler<THandler, TTargets> {
  const handler = spec.handle as AnnotatedTransitionHandler<THandler, TTargets>;
  // Reusing the same function reference across two `defineTransition` calls
  // would crash on the second `Object.defineProperty` with a cryptic
  // `TypeError: Cannot redefine property: targets` (we set the property
  // non-configurable so frozen targets can't be silently replaced). Detect
  // the reuse explicitly and surface an actionable message instead.
  if (Object.getOwnPropertyDescriptor(handler, "targets") !== undefined) {
    throw new TypeError(
      "[@modular-react/journeys] defineTransition: the same handler function was passed to defineTransition twice. " +
        "Each transition needs its own handler — pass an inline arrow / function literal per `defineTransition({ ... })` call.",
    );
  }
  // Non-enumerable so structural iteration (Object.entries on the transitions
  // map, JSON serialization of journey snapshots) does not surface this field;
  // the preloader reads it via direct property access.
  Object.defineProperty(handler, "targets", {
    value: Object.freeze(
      spec.targets.map((t) => (typeof t === "string" ? t : Object.freeze({ ...t }))),
    ) as TTargets,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return handler;
}

/**
 * Curried binder used by {@link defineTransition} to thread the journey's
 * `TModules` / `TState` / `TOutput` into the handler's contextual return
 * type — `next.module` / `next.entry` and the choice of arms (`next` vs
 * `complete` vs `abort` vs `invoke`) check against the bound generics
 * instead of widening to plain `string` / accepting any arm.
 */
export interface TypedTransitionBinder<TModules extends ModuleTypeMap, TState, TOutput> {
  <
    const TTargets extends readonly StepRef<TModules>[],
    TEntryInput = unknown,
    TExitOutput = unknown,
  >(spec: {
    readonly targets: TTargets;
    readonly handle: (
      ctx: ExitCtx<TState, TExitOutput, TEntryInput>,
    ) => NarrowedTransitionResult<TModules, TState, TOutput, TTargets>;
  }): AnnotatedTransitionHandler<
    (ctx: ExitCtx<TState, TExitOutput, TEntryInput>) => TransitionResult<TModules, TState, TOutput>,
    TTargets
  >;
}

/**
 * Wrap a transition handler with a static declaration of every outcome it may
 * take. Two effects:
 *
 *   1. **Runtime — preload precision.** `<JourneyOutlet>`'s default
 *      `preload="precise"` mode reads `targets` and warms exactly those
 *      entries' chunks during idle time, so navigating Next finds the
 *      chunk already cached. Bare-function handlers contribute nothing
 *      to precise mode (they fall back to `preload="aggressive"` if set).
 *      Sentinel targets (`"complete"`, `"abort"`, `"invoke"`) carry no
 *      chunk to preload — they are skipped.
 *
 *   2. **Type-level — the handler's return is constrained to the declared
 *      arms.** Declaring `targets: [{ module: "plan", entry: "choose" }]`
 *      means the handler may only return `{ next: ... }`; declaring
 *      `targets: ["abort"]` means only `{ abort: ... }`; mixing both
 *      allows either. Returning an undeclared arm is a compile error.
 *
 * **`targets` is mandatory.** A wrapped handler must enumerate every
 * outcome it may take. If you don't want a declaration, use a bare
 * function — the runtime invocation path is identical, and bare handlers
 * sit out of precise-mode preload.
 *
 * Two call shapes:
 *
 * ```ts
 * // Curried (recommended): bind the journey's generics once, get full
 * // contextual typing on every wrapped handler. Naming convention mirrors
 * // `selectModule` (a descriptive verb for the binder, not an
 * // abbreviation — `tx` reads as "transaction" in most codebases).
 * const transition = defineTransition<OnboardingModules, OnboardingState>();
 *
 * profileComplete: transition({
 *   targets: [{ module: "plan", entry: "choose" }],
 *   handle: ({ output, state }) => ({
 *     state: { ...state, hint: output.hint },
 *     next: { module: "plan", entry: "choose", input: ... },
 *   }),
 * }),
 *
 * // Mix step refs with sentinels for handlers that branch between
 * // next and a terminal arm:
 * checkout: transition({
 *   targets: [{ module: "plan", entry: "choose" }, "abort"],
 *   handle: ({ output }) =>
 *     output.kind === "ok"
 *       ? { next: { module: "plan", entry: "choose", input: ... } }
 *       : { abort: { reason: "user-cancelled" } },
 * }),
 *
 * // Bare: zero-config, no contextual narrowing. Targets accept any
 * // `{ module: string; entry: string } | "complete" | "abort" | "invoke"`;
 * // useful for one-off handlers or for journeys whose return literals
 * // are already typed by an outer annotation.
 * cancelled: defineTransition({
 *   targets: ["abort"],
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
  const TTargets extends readonly (StepObjectRef | TerminalSentinel)[],
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
 * Each target must be either a `{ module, entry }` string-pair or one of
 * the recognized sentinel strings.
 */
export function isAnnotatedTransition(
  value: unknown,
): value is AnnotatedTransitionHandler<
  (ctx: any) => any,
  readonly (StepObjectRef | TerminalSentinel)[]
> {
  if (typeof value !== "function") return false;
  const targets = (value as { targets?: unknown }).targets;
  if (!Array.isArray(targets)) return false;
  return targets.every(
    (t) =>
      isTerminalSentinel(t) ||
      (typeof t === "object" &&
        t !== null &&
        typeof (t as { module?: unknown }).module === "string" &&
        typeof (t as { entry?: unknown }).entry === "string"),
  );
}

const TERMINAL_SENTINELS = new Set<TerminalSentinel>(["complete", "abort", "invoke"]);

/**
 * Narrow a value to one of the recognized {@link TerminalSentinel} strings.
 * Exposed for hosts that introspect a wrapped handler's targets and want to
 * separate step refs from terminal arms without a string-equality dance.
 */
export function isTerminalSentinel(value: unknown): value is TerminalSentinel {
  return typeof value === "string" && TERMINAL_SENTINELS.has(value as TerminalSentinel);
}
