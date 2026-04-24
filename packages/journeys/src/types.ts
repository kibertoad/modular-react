// The structural helpers, step shapes, runtime-facing types, and related
// contracts now live in `@modular-react/core` so the router-runtime packages
// can describe a manifest that optionally includes a journey runtime without
// taking a hard dependency on this package. We re-export those types here to
// preserve the existing import surface for journey authors and shells.

import type {
  AbandonCtx,
  JourneyPersistence,
  ModuleTypeMap,
  SerializedJourney,
  StepSpec,
  TerminalCtx,
  TransitionEvent,
  TransitionMap,
  TransitionResult,
} from "@modular-react/core";

export type {
  AbandonCtx,
  EntryInputOf,
  EntryNamesOf,
  EntryTransitions,
  ExitCtx,
  ExitNamesOf,
  ExitOutputOf,
  InstanceId,
  JourneyDefinitionSummary,
  JourneyInstance,
  JourneyPersistence,
  JourneyRuntime,
  JourneyStatus,
  JourneyStep,
  MaybePromise,
  ModuleTypeMap,
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

export interface JourneyDefinition<TModules extends ModuleTypeMap, TState, TInput = void> {
  readonly id: string;
  readonly version: string;
  readonly meta?: Readonly<Record<string, unknown>>;

  readonly initialState: (input: TInput) => TState;
  readonly start: (state: TState, input: TInput) => StepSpec<TModules>;

  readonly transitions: TransitionMap<TModules, TState>;

  readonly onTransition?: (ev: TransitionEvent<TModules, TState>) => void;
  readonly onAbandon?: (ctx: AbandonCtx<TModules, TState>) => TransitionResult<TModules, TState>;
  readonly onComplete?: (ctx: TerminalCtx<TState>, result: unknown) => void;
  readonly onAbort?: (ctx: TerminalCtx<TState>, reason: unknown) => void;
  readonly onHydrate?: (blob: SerializedJourney<TState>) => SerializedJourney<TState>;
}

/** Erased shape used by the registry — `any` on the generics lets the
 *  registry store definitions from different journeys side-by-side. */
export type AnyJourneyDefinition = JourneyDefinition<ModuleTypeMap, any, any>;

// -----------------------------------------------------------------------------
// Registration options + internal record — stay in this package
// -----------------------------------------------------------------------------

export interface JourneyRegisterOptions<TState = unknown> {
  onTransition?: (ev: TransitionEvent) => void;
  /**
   * Optional. Without it, journeys live in memory only — every
   * `runtime.start()` mints a fresh instance and nothing is written to
   * storage. Add an adapter when you want reload recovery or idempotent
   * `start` (same input → same `instanceId`).
   */
  persistence?: JourneyPersistence<TState>;
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
}

/** Internal registration record — definition + options kept together. */
export interface RegisteredJourney<TState = unknown> {
  readonly definition: AnyJourneyDefinition;
  readonly options: JourneyRegisterOptions<TState> | undefined;
}

