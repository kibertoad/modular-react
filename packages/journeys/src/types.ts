// The structural helpers, step shapes, runtime-facing types, and related
// contracts now live in `@modular-react/core` so the router-runtime packages
// can describe a manifest that optionally includes a journey runtime without
// taking a hard dependency on this package. We re-export those types here to
// preserve the existing import surface for journey authors and shells.

import type {
  AbandonCtx,
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
  MaybePromise,
  ModuleTypeMap,
  ParentLink,
  PendingInvoke,
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
   * Fires when a step component throws or a transition handler throws for
   * an instance of this journey. Observation-only — the runtime still
   * aborts / retries according to the outlet's `onStepError` policy.
   */
  onError?: (err: unknown, ctx: { step: JourneyStep | null }) => void;
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
}

/** Internal registration record — definition + options kept together. */
export interface RegisteredJourney<TState = unknown, TInput = unknown> {
  readonly definition: AnyJourneyDefinition;
  readonly options: JourneyRegisterOptions<TState, TInput> | undefined;
}
