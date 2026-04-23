import type {
  EntryPointMap,
  ExitPointMap,
  ExitPointSchema,
  ModuleDescriptor,
  ModuleEntryPoint,
} from "@modular-react/core";

// -----------------------------------------------------------------------------
// Structural helpers — extract entry/exit vocabulary from a ModuleDescriptor
// -----------------------------------------------------------------------------

/**
 * A mapping of module id → module descriptor. Each journey declares its own
 * module type map; do **not** use a single global map across all journeys
 * (the document deliberately prescribes per-journey maps to avoid coupling
 * unrelated flows).
 */
export type ModuleTypeMap = Record<string, ModuleDescriptor<any, any, any, any>>;

/** Entry names declared by a module (string keys of its `entryPoints`). */
export type EntryNamesOf<TMod> = TMod extends { readonly entryPoints?: infer TEntries }
  ? TEntries extends EntryPointMap
    ? keyof TEntries & string
    : never
  : never;

/** Exit names declared by a module (string keys of its `exitPoints`). */
export type ExitNamesOf<TMod> = TMod extends { readonly exitPoints?: infer TExits }
  ? TExits extends ExitPointMap
    ? keyof TExits & string
    : never
  : never;

/** Input type for a specific entry name on a module. */
export type EntryInputOf<TMod, TEntry> = TMod extends { readonly entryPoints?: infer TEntries }
  ? TEntries extends EntryPointMap
    ? TEntry extends keyof TEntries
      ? TEntries[TEntry] extends ModuleEntryPoint<infer TInput>
        ? TInput
        : never
      : never
    : never
  : never;

/** Output type for a specific exit name on a module. `void` when none. */
export type ExitOutputOf<TMod, TExit> = TMod extends { readonly exitPoints?: infer TExits }
  ? TExits extends ExitPointMap
    ? TExit extends keyof TExits
      ? TExits[TExit] extends ExitPointSchema<infer TOutput>
        ? TOutput
        : void
      : void
    : void
  : void;

// -----------------------------------------------------------------------------
// Step + transition shapes
// -----------------------------------------------------------------------------

/**
 * Discriminated union of every valid "next step" across the journey's
 * module map. Narrowing on `module` + `entry` picks the correct `input`
 * type; that's how `StepSpec` enforces input correctness per transition.
 */
export type StepSpec<TModules extends ModuleTypeMap> = {
  [M in keyof TModules & string]: {
    [E in EntryNamesOf<TModules[M]> & string]: {
      readonly module: M;
      readonly entry: E;
      readonly input: EntryInputOf<TModules[M], E>;
    };
  }[EntryNamesOf<TModules[M]> & string];
}[keyof TModules & string];

/** Snapshot of a single step in a journey's history / current position. */
export interface JourneyStep {
  readonly moduleId: string;
  readonly entry: string;
  readonly input: unknown;
}

/** Context passed to a transition handler. */
export interface ExitCtx<TState, TOutput, TEntryInput> {
  readonly state: TState;
  readonly input: TEntryInput;
  readonly output: TOutput;
}

/**
 * Result of a transition handler. Exactly one of `next` / `complete` /
 * `abort` is present. `state` is optional — if omitted, the incoming state
 * is preserved.
 */
export type TransitionResult<TModules extends ModuleTypeMap, TState> =
  | { readonly next: StepSpec<TModules>; readonly state?: TState }
  | { readonly complete: unknown; readonly state?: TState }
  | { readonly abort: unknown; readonly state?: TState };

/**
 * Per-entry transitions for a single module. `allowBack` enables `goBack`
 * into the previous step from this entry; must agree with the target
 * entry's own `allowBack` declaration (checked at resolveManifest time).
 */
export type EntryTransitions<
  TModules extends ModuleTypeMap,
  TState,
  TMod,
  TEntry,
> = {
  readonly [X in ExitNamesOf<TMod>]?: (
    ctx: ExitCtx<TState, ExitOutputOf<TMod, X>, EntryInputOf<TMod, TEntry>>,
  ) => TransitionResult<TModules, TState>;
} & {
  readonly allowBack?: boolean;
};

/** Map of module id → entry name → exit transitions. */
export type TransitionMap<TModules extends ModuleTypeMap, TState> = {
  readonly [M in keyof TModules]?: {
    readonly [E in EntryNamesOf<TModules[M]>]?: EntryTransitions<
      TModules,
      TState,
      TModules[M],
      E
    >;
  };
};

// -----------------------------------------------------------------------------
// Observation hook payloads
// -----------------------------------------------------------------------------

export interface TransitionEvent<
  TModules extends ModuleTypeMap = ModuleTypeMap,
  TState = unknown,
> {
  readonly journeyId: string;
  readonly instanceId: InstanceId;
  readonly from: JourneyStep | null;
  readonly to: JourneyStep | null;
  readonly exit: string | null;
  readonly state: TState;
  readonly history: readonly JourneyStep[];
}

export interface AbandonCtx<
  _TModules extends ModuleTypeMap = ModuleTypeMap,
  TState = unknown,
> {
  readonly journeyId: string;
  readonly instanceId: InstanceId;
  readonly step: JourneyStep | null;
  readonly state: TState;
  readonly reason: unknown;
}

export interface TerminalCtx<TState = unknown> {
  readonly journeyId: string;
  readonly instanceId: InstanceId;
  readonly state: TState;
  readonly history: readonly JourneyStep[];
}

// -----------------------------------------------------------------------------
// Journey definition
// -----------------------------------------------------------------------------

export interface JourneyDefinition<
  TModules extends ModuleTypeMap,
  TState,
  TInput = void,
> {
  readonly id: string;
  readonly version: string;
  readonly meta?: Readonly<Record<string, unknown>>;

  readonly initialState: (input: TInput) => TState;
  readonly start: (state: TState, input: TInput) => StepSpec<TModules>;

  readonly transitions: TransitionMap<TModules, TState>;

  readonly onTransition?: (ev: TransitionEvent<TModules, TState>) => void;
  readonly onAbandon?: (
    ctx: AbandonCtx<TModules, TState>,
  ) => TransitionResult<TModules, TState>;
  readonly onComplete?: (ctx: TerminalCtx<TState>, result: unknown) => void;
  readonly onAbort?: (ctx: TerminalCtx<TState>, reason: unknown) => void;
  readonly onHydrate?: (
    blob: SerializedJourney<TState>,
  ) => SerializedJourney<TState>;
}

/** Erased shape used by the registry — `any` on the generics lets the
 *  registry store definitions from different journeys side-by-side. */
export type AnyJourneyDefinition = JourneyDefinition<ModuleTypeMap, any, any>;

// -----------------------------------------------------------------------------
// Runtime-facing types
// -----------------------------------------------------------------------------

export type InstanceId = string;

export type JourneyStatus = "loading" | "active" | "completed" | "aborted";

export interface JourneyInstance<TState = unknown> {
  readonly id: InstanceId;
  readonly journeyId: string;
  readonly status: JourneyStatus;
  readonly step: JourneyStep | null;
  readonly history: readonly JourneyStep[];
  readonly state: TState;
  readonly startedAt: string;
  readonly updatedAt: string;
  serialize(): SerializedJourney<TState>;
}

export interface SerializedJourney<TState = unknown> {
  readonly definitionId: string;
  readonly version: string;
  readonly instanceId: string;
  readonly status: "active" | "completed" | "aborted";
  readonly step: JourneyStep | null;
  readonly history: readonly JourneyStep[];
  readonly rollbackSnapshots?: readonly TState[];
  readonly state: TState;
  readonly startedAt: string;
  readonly updatedAt: string;
}

export interface JourneyDefinitionSummary {
  readonly id: string;
  readonly version: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export type MaybePromise<T> = T | Promise<T>;

export interface JourneyPersistence<TState = unknown> {
  keyFor: (ctx: {
    journeyId: string;
    input: unknown;
    instanceId: string;
  }) => string;
  load: (key: string) => MaybePromise<SerializedJourney<TState> | null>;
  save: (key: string, blob: SerializedJourney<TState>) => MaybePromise<void>;
  remove: (key: string) => MaybePromise<void>;
}

export interface JourneyRegisterOptions<TState = unknown> {
  onTransition?: (ev: TransitionEvent) => void;
  persistence?: JourneyPersistence<TState>;
}

/** Internal registration record — definition + options kept together. */
export interface RegisteredJourney<TState = unknown> {
  readonly definition: AnyJourneyDefinition;
  readonly options: JourneyRegisterOptions<TState> | undefined;
}

export interface JourneyRuntime {
  start<TInput>(journeyId: string, input: TInput): InstanceId;
  hydrate<TState>(
    journeyId: string,
    blob: SerializedJourney<TState>,
  ): InstanceId;
  getInstance(id: InstanceId): JourneyInstance | null;
  listInstances(): readonly InstanceId[];
  listDefinitions(): readonly JourneyDefinitionSummary[];
  /** Subscribe to changes for one instance. Returns unsubscribe. */
  subscribe(id: InstanceId, listener: () => void): () => void;
  /**
   * Force-terminate an instance. Fires `onAbandon` if still active; no-op if
   * the instance is already terminal or unknown.
   */
  end(id: InstanceId, reason?: unknown): void;
}
