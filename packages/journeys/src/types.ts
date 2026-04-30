// The structural helpers, step shapes, runtime-facing types, and related
// contracts now live in `@modular-react/core` so the router-runtime packages
// can describe a manifest that optionally includes a journey runtime without
// taking a hard dependency on this package. We re-export those types here to
// preserve the existing import surface for journey authors and shells.

import type {
  AbandonCtx,
  JourneyHandleRef,
  JourneyPersistence,
  JourneyStep,
  ModuleTypeMap,
  ResumeMap,
  SerializedJourney,
  StepSpec,
  TerminalCtx,
  TransitionEvent,
  TransitionMap,
  TransitionResult,
} from "@modular-react/core";

export type {
  AbandonCtx,
  ChildOutcome,
  EntryInputOf,
  EntryNamesOf,
  EntryTransitions,
  ExitCtx,
  ExitNamesOf,
  ExitOutputOf,
  InstanceId,
  InvokeSpec,
  JourneyDefinitionSummary,
  JourneyInstance,
  JourneyPersistence,
  JourneyRuntime,
  JourneyStatus,
  JourneyStep,
  JourneySystemAbortReason,
  JourneySystemAbortReasonCode,
  MaybePromise,
  ModuleTypeMap,
  ParentLink,
  PendingInvoke,
  ResumeBounceCounter,
  ResumeHandler,
  ResumeMap,
  SerializedJourney,
  StepSpec,
  TerminalCtx,
  TerminalOutcome,
  TransitionEvent,
  TransitionMap,
  TransitionResult,
} from "@modular-react/core";

// -----------------------------------------------------------------------------
// Journey definition — stays in this package (authoring shape)
// -----------------------------------------------------------------------------

export interface JourneyDefinition<
  TModules extends ModuleTypeMap,
  TState,
  TInput = void,
  TOutput = unknown,
> {
  readonly id: string;
  readonly version: string;
  readonly meta?: Readonly<Record<string, unknown>>;

  readonly initialState: (input: TInput) => TState;
  readonly start: (state: TState, input: TInput) => StepSpec<TModules>;

  readonly transitions: TransitionMap<TModules, TState, TOutput>;

  /**
   * Resume handlers fired when a child journey `invoke`d from a parent
   * step terminates. Keyed by `[moduleId][entryName][resumeName]` — the
   * runtime looks up `resumes[currentMod][currentEntry][invokeSpec.resume]`
   * at child terminal time and applies the result as the parent's next
   * transition. Optional — journeys that never invoke can omit it.
   */
  readonly resumes?: ResumeMap<TModules, TState, TOutput>;

  /**
   * Closed set of journey handles this journey may invoke from any of its
   * transitions (or from a resume that returns `{ invoke }`). Strongly
   * recommended for any journey that uses `invoke`:
   *
   * 1. **Static cycle detection.** When every journey in a registration
   *    declares `invokes`, the registry runs a graph-level cycle check
   *    at validation time and rejects the registration with a path like
   *    `cycle detected: A → B → A` — far easier to diagnose than the
   *    runtime `invoke-cycle` abort.
   * 2. **Runtime arrival check.** At invoke time the runtime verifies
   *    that the dispatched handle id appears in `invokes`; an unexpected
   *    handle aborts the parent with reason `invoke-undeclared-child`,
   *    catching dynamic dispatch bugs (a transition that branches on
   *    `output` and lands on a handle the author never intended).
   *
   * Omit only when the call set is genuinely dynamic (e.g. a host that
   * receives child handles from a slot contribution at runtime). The
   * runtime cycle / depth / bounce guards still apply in that case;
   * they just no longer have a static graph to cross-check against.
   *
   * Self-loops (a journey listing its own handle) are reported as a
   * cycle — by construction they would also blow the call-stack guard
   * at runtime.
   */
  readonly invokes?: ReadonlyArray<JourneyHandleRef<string, any, any>>;

  /**
   * Expected module version ranges, keyed by `module.id`. The journeys
   * plugin checks each entry at registry resolve time against the
   * actually-registered module's `version` field; any incompatibility
   * fails assembly with a {@link JourneyValidationError} listing every
   * mismatch at once.
   *
   * **Why declare this even though the journey already references modules
   * by id in `transitions`?** A journey that mixes in a module from another
   * team is implicitly coupled to that module's exit-name and input-shape
   * contract. The id-and-shape match holds today, but a backwards-
   * incompatible bump on the other side ("we renamed the `success` exit
   * to `done`") would otherwise only surface at runtime when the journey
   * actually navigates to that step. Adding a compat declaration moves
   * that failure to startup so an incompatible deployment refuses to come
   * up at all, instead of breaking a single user mid-flow.
   *
   * The range syntax is the npm-style subset documented on
   * `@modular-react/journeys/semver` — caret/tilde/x-range/comparators/AND
   * /OR/hyphen. Pre-release tags and build metadata are not supported.
   * Module ids that aren't registered are reported with a dedicated
   * "module not registered" issue (so a typo on the journey side is
   * distinguishable from a version mismatch).
   *
   * Optional. A journey that omits this field opts out of compatibility
   * enforcement entirely; the existing structural validators
   * (`transitions` referencing real modules / entries / exits) still run.
   *
   * @example
   * ```ts
   * defineJourney<OnboardingModules, OnboardingState>()({
   *   id: "onboarding",
   *   version: "1.0.0",
   *   moduleCompat: {
   *     profile: "^1.0.0",
   *     billing: "^2.0.0 || ^3.0.0",
   *     plan: ">=1.5.0 <2.0.0",
   *   },
   *   // ...
   * });
   * ```
   */
  readonly moduleCompat?: Readonly<Record<string, string>>;

  readonly onTransition?: (ev: TransitionEvent<TModules, TState>) => void;
  readonly onAbandon?: (
    ctx: AbandonCtx<TModules, TState>,
  ) => TransitionResult<TModules, TState, TOutput>;
  readonly onComplete?: (ctx: TerminalCtx<TState>, result: TOutput) => void;
  readonly onAbort?: (ctx: TerminalCtx<TState>, reason: unknown) => void;
  readonly onHydrate?: (blob: SerializedJourney<TState>) => SerializedJourney<TState>;
}

/** Erased shape used by the registry — `any` on every generic lets the
 *  registry store definitions from different journeys side-by-side.
 *  Tightening to `unknown` breaks variance: `initialState: (input: TInput)
 *  => TState` for a specific journey is not assignable to
 *  `(input: unknown) => unknown` because function parameters are
 *  contravariant, so the registry would reject any concrete definition.
 *
 *  TModules is also `any` (rather than `ModuleTypeMap`) so the structural
 *  variance check on `ResumeMap`/`TransitionMap` does not strictly require
 *  the wide form to carry every specific module key — `any` short-circuits
 *  the property-by-property check and admits any concrete TModules. */
export type AnyJourneyDefinition = JourneyDefinition<any, any, any, any>;

// -----------------------------------------------------------------------------
// Registration options + internal record — stay in this package
// -----------------------------------------------------------------------------

/**
 * Nav contribution attached to a `registerJourney` call. The journeys plugin
 * collects these at manifest time and emits them as navigation items tagged
 * with an `action.kind = "journey-start"` so the shell's navbar dispatcher
 * can start the journey instead of following a URL.
 *
 * `TInput` is the journey's input type — `buildInput` produces that shape
 * from whatever context the dispatcher passes at click time. Keeping the
 * context loosely typed (`unknown`) matches how the journeys plugin surfaces
 * contributions to the framework; apps that want to narrow the context can
 * provide a typed `buildNavItem` adapter (see
 * {@link JourneysPluginOptions}.`buildNavItem`).
 */
export interface JourneyNavContribution<TInput = unknown> {
  /** Display label. Apps that type-narrow labels should reshape via `buildNavItem`. */
  readonly label: string;
  /** Icon — string identifier or React component (matches `NavigationItem.icon`). */
  readonly icon?: string | React.ComponentType<{ className?: string }>;
  /** Grouping key for the navbar, same semantics as `NavigationItem.group`. */
  readonly group?: string;
  /** Sort order within the group (lower wins). */
  readonly order?: number;
  /** If true, registered but hidden from default navbar rendering. */
  readonly hidden?: boolean;
  /** App-owned metadata, opaque to the library. */
  readonly meta?: unknown;
  /**
   * Optional factory that builds the journey's `input` at click time. The
   * shell's navbar dispatcher calls this with whatever nav context the host
   * provides (workspace id, current selection, etc.) and hands the result
   * back to `runtime.start(handle, input)`. Omit when the journey has no
   * input; pass a pure factory when it does.
   */
  readonly buildInput?: (ctx?: unknown) => TInput;
}

export interface JourneyRegisterOptions<TState = unknown, TInput = unknown> {
  /**
   * Fires after every transition. Registration-level hook runs after the
   * definition-level `onTransition`. Useful for shell telemetry that
   * doesn't belong in journey authoring code.
   */
  onTransition?: (ev: TransitionEvent) => void;
  /**
   * Fires when the journey reaches a `{ complete }` transition. Runs after
   * the definition-level `onComplete` (both fire). Use for shell-level
   * completion analytics.
   */
  onComplete?: (ctx: TerminalCtx<TState>, result: unknown) => void;
  /**
   * Fires when the journey aborts — either via a `{ abort }` transition, a
   * thrown transition handler, or `runtime.end(id)`. Runs after the
   * definition-level `onAbort`.
   */
  onAbort?: (ctx: TerminalCtx<TState>, reason: unknown) => void;
  /**
   * Overrides the definition's `onAbandon` when `runtime.end(id)` is called
   * on an active instance. When set, this handler supplies the transition
   * result (typically `{ abort }`). When absent, the definition's handler
   * is used. Use to swap out abandon behaviour for a specific deployment
   * (e.g. a tab-close workflow that completes instead of aborting).
   */
  onAbandon?: (ctx: AbandonCtx<ModuleTypeMap, TState>) => TransitionResult<ModuleTypeMap, TState>;
  /**
   * Layered on top of the definition-level `onHydrate` — runs **after** the
   * definition transforms the blob. Useful for shell-level migration of
   * fields that the journey author doesn't know about (e.g. redacting
   * environment-specific identifiers on load).
   */
  onHydrate?: (blob: SerializedJourney<TState>) => SerializedJourney<TState>;
  /**
   * Fires when a step component throws, a transition handler throws,
   * or an invoke / resume / abandon hook throws. Observation-only — the
   * runtime still aborts / retries according to the outlet's
   * `onStepError` policy. The `phase` discriminator lets telemetry
   * distinguish a component throw (`"step"`) from an invoke/resume
   * control-plane failure or a custom `onAbandon` crash.
   */
  onError?: (
    err: unknown,
    ctx: { step: JourneyStep | null; phase: "step" | "invoke" | "resume" | "abandon" },
  ) => void;
  /**
   * Optional. Without it, journeys live in memory only — every
   * `runtime.start()` mints a fresh instance and nothing is written to
   * storage. Add an adapter when you want reload recovery or idempotent
   * `start` (same input → same `instanceId`).
   *
   * Typed against both `TState` (for `load` / `save` payloads) and the
   * journey's `TInput` (for `keyFor`) — pass a typed adapter built with
   * {@link defineJourneyPersistence} to get end-to-end checking.
   */
  persistence?: JourneyPersistence<TState, TInput>;
  /**
   * Maximum number of entries to keep in `history` (and the matching
   * `rollbackSnapshots`). Oldest entries are dropped once the cap is
   * exceeded. Omit — or pass `0` or a negative number — for unbounded
   * history (the default).
   *
   * **Caveat with `allowBack`.** A cap smaller than the deepest
   * back-enabled chain will silently break `goBack` past the trim
   * point — the rollback snapshot that `goBack` would restore is among
   * the dropped entries. Treat `maxHistory` as "prune old entries that
   * no one will ever navigate back to" rather than a hard window on
   * `goBack` distance. If an app needs both back-navigation and a tight
   * cap, size the cap to at least the longest user-reachable back chain.
   */
  maxHistory?: number;
  /**
   * Optional nav contribution. When set, the journeys plugin emits a
   * navigation item for this journey so pure launchers don't need a
   * shadow module to host them. The contributed item is tagged with
   * `action: { kind: "journey-start", journeyId, buildInput }`; the
   * shell's navbar dispatcher starts the journey on click.
   *
   * Typed against the journey's `TInput` so `buildInput` returns the
   * right shape end-to-end. Apps with a narrowed `TNavItem` should also
   * pass a `buildNavItem` adapter on `journeysPlugin` to reshape the
   * default item into the app's narrowed type.
   */
  nav?: JourneyNavContribution<TInput>;
  /**
   * Cap on the depth of an in-flight invoke chain that includes this
   * journey. The depth is the number of *active* journey instances in
   * the chain — a root parent on its own is depth 1, a parent with one
   * in-flight child is depth 2, etc. When an invoke would push depth
   * beyond `maxCallStackDepth`, the parent aborts with reason
   * `invoke-stack-overflow` (the child is never started) and the
   * registration's `onError` fires with `phase: "invoke"`.
   *
   * The runtime resolves the effective limit as the **minimum** of every
   * non-undefined `maxCallStackDepth` across the active chain (ancestors
   * + the new parent + the would-be child's own setting). The most
   * restrictive journey wins, so a cautious utility journey can lower
   * the cap for any flow that includes it without coordinating with the
   * other journeys.
   *
   * Default: `16`. Set lower for journeys whose call graphs are known
   * to be shallow; raise it (carefully) only for genuinely deep
   * compositions. Setting it to `1` blocks `invoke` from this journey
   * outright.
   *
   * `0`, negative, or non-finite values are treated as "no opinion" and
   * fall through to the next journey's setting (or the library default
   * if no journey in the chain expresses an opinion). This matches the
   * `maxHistory` convention so a misconfigured `0` cannot accidentally
   * disable the guard.
   */
  maxCallStackDepth?: number;
  /**
   * Cap on consecutive resume "bounces" at the *same* parent step. A
   * bounce is a resume that returns `{ invoke }` (re-invoking a child
   * instead of advancing the parent's step). The counter increments on
   * every resume that returns `{ invoke }` and resets to zero whenever
   * the parent's step actually advances (`{ next | complete | abort }`
   * from any source). When the counter would exceed
   * `maxResumeBouncesPerStep`, the parent aborts with reason
   * `resume-bounce-limit`; the child whose terminal triggered the
   * over-the-limit bounce is *not* re-invoked.
   *
   * The counter is persisted on the parent's blob (see
   * `SerializedJourney.resumeBouncesAtStep`) so a reload-bounce sequence
   * cannot reset the budget by round-tripping through storage.
   *
   * Default: `8`. Raise it for flows that legitimately retry a sub-flow
   * many times in a row; lower it for paranoia. The check uses the
   * parent's setting only — children do not influence their parent's
   * bounce budget.
   *
   * `0`, negative, or non-finite values fall through to the library
   * default (matches `maxCallStackDepth` and `maxHistory`).
   */
  maxResumeBouncesPerStep?: number;
}

/** Internal registration record — definition + options kept together. */
export interface RegisteredJourney<TState = unknown, TInput = unknown> {
  readonly definition: AnyJourneyDefinition;
  readonly options: JourneyRegisterOptions<TState, TInput> | undefined;
}
