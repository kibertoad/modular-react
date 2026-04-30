/**
 * Journey contract types — the type surfaces that describe "what a journey
 * runtime looks like to a consumer." Hoisted to core so runtime packages
 * (e.g. `@react-router-modules/runtime`) can describe a manifest shape that
 * optionally carries a journey runtime without taking a hard dependency on
 * `@modular-react/journeys`.
 *
 * Implementation (the runtime factory, outlet, validators, persistence
 * helpers) stays in `@modular-react/journeys`.
 */

import type {
  EntryPointMap,
  ExitPointMap,
  ExitPointSchema,
  ModuleDescriptor,
  ModuleEntryPoint,
} from "./types.js";

// -----------------------------------------------------------------------------
// Structural helpers — extract entry/exit vocabulary from a ModuleDescriptor
// -----------------------------------------------------------------------------

/**
 * A mapping of module id → module descriptor. Each journey declares its own
 * module type map; do **not** use a single global map across all journeys
 * (per-journey maps avoid coupling unrelated flows).
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
 * Outcome surfaced to a parent journey's named resume handler when a child
 * journey terminates. Mirrors the closed shape the parent could have observed
 * by subscribing to the child directly — `completed` carries the child's
 * `TerminalPayload` (typed end-to-end via the child handle's `TOutput`),
 * `aborted` carries the child's abort reason. `TOutput` defaults to
 * `unknown` so resume handlers that don't know (or care) about a typed
 * payload still compile.
 */
export type ChildOutcome<TOutput = unknown> =
  | { readonly status: "completed"; readonly payload: TOutput }
  | { readonly status: "aborted"; readonly reason: unknown };

/**
 * Names a child journey to invoke and the resume handler that fires when it
 * terminates. The resume name is a string — closures don't round-trip
 * through persistence, so resume identity is reified by name and looked up
 * on the parent's current step (`transitions[mod][entry].resumes[name]`).
 *
 * Generic over the child handle's `TOutput` so a typed handle threads the
 * child's terminal payload type into the parent's resume handler signature
 * without any cast at the call site.
 */
export interface InvokeSpec<TInput = unknown, TOutput = unknown> {
  readonly handle: JourneyHandleRef<string, TInput, TOutput>;
  readonly input: TInput;
  /**
   * Names a resume handler declared on the parent's *current* step's
   * transitions (i.e. `transitions[currentMod][currentEntry].resumes[name]`).
   * Looked up at child terminal time. The phantom `TOutput` flows from the
   * handle into that resume handler's `outcome` parameter.
   */
  readonly resume: string;
}

/**
 * Result of a transition handler. Exactly one of `next` / `complete` /
 * `abort` / `invoke` is present. `state` is optional — if omitted, the
 * incoming state is preserved.
 *
 * `TOutput` is the journey's *own* terminal payload type (narrows the
 * `complete` arm). `invoke.handle` carries the *child* journey's TInput /
 * TOutput independently — a parent's resume handler is type-checked against
 * the child handle's TOutput, not the parent's.
 *
 * **Type-checking `invoke.input`.** The union arm declares
 * `InvokeSpec<unknown, unknown>` so the discriminator works for any handle,
 * but a bare `{ invoke: { handle, input, resume } }` literal won't link
 * `input` to the handle's `TInput`. Use the `invoke()` builder from
 * `@modular-react/journeys` (re-exported via `defineJourney`'s helpers) to
 * get end-to-end type-checking on `input`. The runtime accepts both forms.
 */
export type TransitionResult<TModules extends ModuleTypeMap, TState, TOutput = unknown> =
  | { readonly next: StepSpec<TModules>; readonly state?: TState }
  | { readonly complete: TOutput; readonly state?: TState }
  | { readonly abort: unknown; readonly state?: TState }
  | {
      readonly invoke: InvokeSpec<unknown, unknown>;
      readonly state?: TState;
    };

/**
 * Resume handler — fired when a child journey `invoke`d from a parent step
 * terminates. Pure synchronous functions returning a `TransitionResult`,
 * exactly like exit handlers. They receive the parent's current `state`,
 * the original `input` of the parent's step, and the child's `outcome`
 * (a `ChildOutcome<TChildOutput>` discriminated union — the parent always
 * sees abort outcomes and decides how to react).
 *
 * `TOutput` is the *parent* journey's terminal payload (so a resume can
 * `return { complete: ... }` typed correctly); `TChildOutput` is the
 * *child* journey's terminal payload (the type behind `outcome.payload`).
 */
export type ResumeHandler<
  TModules extends ModuleTypeMap,
  TState,
  TEntryInput,
  TOutput = unknown,
  TChildOutput = unknown,
> = (ctx: {
  readonly state: TState;
  readonly input: TEntryInput;
  readonly outcome: ChildOutcome<TChildOutput>;
}) => TransitionResult<TModules, TState, TOutput>;

/**
 * Per-entry transitions for a single module. `allowBack` enables `goBack`
 * into the previous step from this entry; must agree with the target
 * entry's own `allowBack` declaration (checked at resolveManifest time).
 *
 * Authors should not pass `TOutput` explicitly — `TransitionMap` and
 * `JourneyDefinition` thread it through so a handler's `complete` return
 * narrows to the journey's declared terminal payload.
 *
 * Resume handlers (continuation points fired when a child journey
 * `invoke`d from this step terminates) live in a sibling map at the
 * `JourneyDefinition` level (`resumes[mod][entry][name]`), not inline on
 * this intersection. Nesting an index-signature value here causes
 * TypeScript to collapse the intersection's variance and break
 * assignability to the registry's wide `AnyJourneyDefinition` form —
 * keeping the resume map separate avoids that footgun and reads cleanly.
 */
export type EntryTransitions<
  TModules extends ModuleTypeMap,
  TState,
  TMod,
  TEntry,
  TOutput = unknown,
> = {
  readonly [X in ExitNamesOf<TMod>]?: (
    ctx: ExitCtx<TState, ExitOutputOf<TMod, X>, EntryInputOf<TMod, TEntry>>,
  ) => TransitionResult<TModules, TState, TOutput>;
} & {
  readonly allowBack?: boolean;
};

/** Map of module id → entry name → exit transitions. */
export type TransitionMap<TModules extends ModuleTypeMap, TState, TOutput = unknown> = {
  readonly [M in keyof TModules]?: {
    readonly [E in EntryNamesOf<TModules[M]>]?: EntryTransitions<
      TModules,
      TState,
      TModules[M],
      E,
      TOutput
    >;
  };
};

/**
 * Resume map — sibling of `TransitionMap` keyed identically by
 * `[moduleId][entryName]`, with each leaf an object of named resume
 * handlers. A transition handler's `{ invoke: { ..., resume: "<name>" } }`
 * resolves to a key under this map at the parent's *current* step's
 * `[moduleId][entryName]` slot.
 *
 * Kept separate from `TransitionMap` because nesting an index-signature
 * value inside `EntryTransitions`' intersection collapses TypeScript's
 * mapped-type variance — see the doc on `EntryTransitions`. The structural
 * cost is duplicating the `[moduleId][entryName]` path; the conceptual
 * benefit is that resume names live in their own keyspace and never
 * collide with exit names.
 */
export type ResumeMap<TModules extends ModuleTypeMap, TState, TOutput = unknown> = {
  readonly [M in keyof TModules]?: {
    readonly [E in EntryNamesOf<TModules[M]>]?: {
      readonly [resumeName: string]: ResumeHandler<
        TModules,
        TState,
        EntryInputOf<TModules[M], E>,
        TOutput,
        any
      >;
    };
  };
};

// -----------------------------------------------------------------------------
// Observation hook payloads
// -----------------------------------------------------------------------------

export interface TransitionEvent<
  _TModules extends ModuleTypeMap = ModuleTypeMap,
  TState = unknown,
> {
  readonly journeyId: string;
  readonly instanceId: InstanceId;
  readonly from: JourneyStep | null;
  readonly to: JourneyStep | null;
  readonly exit: string | null;
  readonly state: TState;
  readonly history: readonly JourneyStep[];
  /**
   * Discriminator on the *kind* of hop this event represents. Lets
   * telemetry consumers filter to top-level step transitions and skip
   * the (often noisy) invoke / resume bookkeeping events.
   *
   * - `"step"` — ordinary `{ next | complete | abort }` transition. The
   *   default for events fired today.
   * - `"invoke"` — the parent has just started a child journey. `from`
   *   and `to` are equal (the parent's step doesn't change). `child` is
   *   populated.
   * - `"resume"` — the parent's named resume handler has just been
   *   applied with the child's outcome. The actual transition the
   *   handler returned is reflected in `from` / `to` / `exit`. `outcome`
   *   is populated.
   */
  readonly kind: "step" | "invoke" | "resume";
  /**
   * Set on `kind === "invoke"` events — identifies the child journey that
   * was just started.
   */
  readonly child?: { readonly instanceId: InstanceId; readonly journeyId: string };
  /**
   * Set on `kind === "resume"` events — the child outcome that fed into
   * the parent's resume handler.
   */
  readonly outcome?: ChildOutcome<unknown>;
  /**
   * Set on `kind === "resume"` events — the resume handler name that was
   * fired.
   */
  readonly resume?: string;
}

export interface AbandonCtx<_TModules extends ModuleTypeMap = ModuleTypeMap, TState = unknown> {
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
  /** Payload from the terminal transition; undefined until the journey ends. */
  readonly terminalPayload?: unknown;
  readonly startedAt: string;
  readonly updatedAt: string;
  /**
   * Instance id of the child journey currently in flight from this
   * instance's invoking step, or `null` when no invoke is pending. The
   * `<JourneyOutlet>` follows this chain by default to render the active
   * leaf; shells that want layered presentations can read it directly.
   */
  readonly activeChildId: InstanceId | null;
  /**
   * Parent link — set on a child instance to identify the parent that
   * invoked it and the named resume the runtime will fire on the parent
   * when this instance terminates. `null` for root instances and for
   * instances started via `runtime.start()` outside a parent transition.
   */
  readonly parent: { readonly instanceId: InstanceId; readonly resumeName: string } | null;
  serialize(): SerializedJourney<TState>;
}

/**
 * Persisted parent-side link to a child journey that is in flight from
 * this instance's current step. Survives a reload — on hydrate, the
 * runtime relinks the parent to the child via `childInstanceId` (in
 * memory) or `childPersistenceKey` (loaded from storage). `resumeName`
 * names the entry in `JourneyDefinition.resumes[mod][entry]` that fires
 * when the child terminates.
 */
export interface PendingInvoke {
  readonly childJourneyId: string;
  readonly childInstanceId: InstanceId;
  readonly childPersistenceKey: string | null;
  readonly resumeName: string;
}

/**
 * Persisted child-side back-pointer. Mirrors the parent's `pendingInvoke`
 * so a child blob loaded out-of-order on reload still knows which parent
 * to resume. The runtime tolerates either side being missing — see the
 * hydrate link-up pass for the recovery semantics.
 */
export interface ParentLink {
  readonly parentInstanceId: InstanceId;
  readonly resumeName: string;
}

export interface SerializedJourney<TState = unknown> {
  readonly definitionId: string;
  readonly version: string;
  readonly instanceId: string;
  readonly status: "active" | "completed" | "aborted";
  readonly step: JourneyStep | null;
  readonly history: readonly JourneyStep[];
  /**
   * Rollback snapshots indexed alongside `history`. Slots for non-rollback
   * entries serialize as `null` (JSON-safe placeholder) so the array stays
   * aligned with `history` across a round trip.
   */
  readonly rollbackSnapshots?: readonly (TState | null)[];
  /** Terminal payload from `complete` / `abort`. Present only when terminal. */
  readonly terminalPayload?: unknown;
  readonly state: TState;
  readonly startedAt: string;
  readonly updatedAt: string;
  /**
   * Set when a child journey is in flight from this instance's current
   * step. Persisted so the runtime can relink parent → child after a
   * reload. Cleared when the child resumes the parent.
   */
  readonly pendingInvoke?: PendingInvoke;
  /**
   * Set on a child instance whose parent invoked it. Mirrors the parent's
   * `pendingInvoke` so a child blob loaded out-of-order still knows
   * which parent to resume.
   */
  readonly parentLink?: ParentLink;
  /**
   * Persisted bounce counter used by the resume-bounce-limit guard. A
   * "bounce" is a resume that returns `{ invoke }` instead of advancing
   * the parent's step (`{ next | complete | abort }`); the runtime caps
   * how many can fire consecutively at the same step so a malformed
   * resume → invoke → resume → invoke loop cannot spin indefinitely.
   * Reset to `undefined` whenever the step actually advances. Persisted
   * so a reload-bounce-reload-bounce sequence cannot reset the counter
   * by round-tripping through storage.
   */
  readonly resumeBouncesAtStep?: ResumeBounceCounter;
}

/**
 * Per-step bounce counter persisted on a parent's serialized blob. The
 * runtime increments `count` each time a resume on this step returns
 * `{ invoke }` again without advancing; once it would exceed the configured
 * `maxResumeBouncesPerStep`, the parent aborts with reason
 * `resume-bounce-limit`. The counter is scoped to a `stepToken` so that a
 * legitimate forward step naturally clears stale counts even if a stale
 * blob were ever rehydrated.
 */
export interface ResumeBounceCounter {
  readonly stepToken: number;
  readonly count: number;
}

export interface JourneyDefinitionSummary {
  readonly id: string;
  readonly version: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export type MaybePromise<T> = T | Promise<T>;

export interface JourneyPersistence<TState = unknown, TInput = unknown> {
  /**
   * Compute the persistence key from the journey id and the starting input.
   * The key must be deterministic for identical inputs — `start()` probes
   * this key to find an existing instance and achieve idempotency.
   *
   * `instanceId` is NOT part of the key contract: probing happens before
   * an id exists, and the dominant patterns (per-customer, per-session)
   * don't need it. If you need per-instance isolation, include a unique
   * discriminator in `input` rather than relying on an instance id.
   *
   * `TInput` carries through the journey's input type so shells can call
   * `persistence.keyFor({ input })` outside the runtime with full type
   * checking (defaults to `unknown` for adapters that don't care).
   */
  keyFor: (ctx: { journeyId: string; input: TInput }) => string;
  load: (key: string) => MaybePromise<SerializedJourney<TState> | null>;
  save: (key: string, blob: SerializedJourney<TState>) => MaybePromise<void>;
  remove: (key: string) => MaybePromise<void>;
}

/**
 * Terminal outcome surfaced to `JourneyOutlet.onFinished` and available on
 * `JourneyInstance.terminalPayload`. Matches the value returned by the
 * last transition (`{ complete }` or `{ abort }`). `instanceId` and
 * `journeyId` are included so analytics / tab-close hooks can correlate
 * without re-reading the outlet's props.
 *
 * Generic over `TOutput` — when a journey declares its terminal payload
 * type via the fourth generic on `defineJourney`, callers that thread the
 * journey's handle through `onFinished` see a typed `payload`. Defaults to
 * `unknown` for shells that don't bind to a specific journey.
 */
export interface TerminalOutcome<TOutput = unknown> {
  readonly status: "completed" | "aborted";
  readonly payload: TOutput;
  readonly instanceId: InstanceId;
  readonly journeyId: string;
}

/**
 * Structural shape of a journey handle — a lightweight token a journey
 * package can export so callers open journeys with typed `input` without
 * importing the journey's runtime code. Declared in core so the overload
 * on `JourneyRuntime.start` does not force core to depend on
 * `@modular-react/journeys`. The `__input` and `__output` fields are
 * phantom (never read at runtime).
 *
 * `TOutput` carries the journey's terminal payload type so a parent
 * journey's `invoke` resume handler receives a typed `outcome.payload`
 * without any cast at the call site.
 *
 * The implementation package (`@modular-react/journeys`) re-exports this
 * under the canonical name `JourneyHandle` and ships `defineJourneyHandle`
 * as the constructor.
 */
export interface JourneyHandleRef<
  TId extends string = string,
  TInput = unknown,
  TOutput = unknown,
> {
  readonly id: TId;
  readonly __input?: TInput;
  readonly __output?: TOutput;
}

export interface JourneyRuntime {
  /**
   * Handle form — type-checks `input` against the handle's phantom `TInput`.
   * When the handle's `TInput` is `void`, callers can omit the second
   * argument entirely.
   */
  start<TId extends string, TInput, TOutput>(
    handle: JourneyHandleRef<TId, TInput, TOutput>,
    ...rest: [TInput] extends [void] ? [] | [input?: TInput] : [input: TInput]
  ): InstanceId;
  /** String-id form — accepts any `input` (the handle form is preferred). */
  start<TInput>(journeyId: string, input: TInput): InstanceId;
  hydrate<TState>(journeyId: string, blob: SerializedJourney<TState>): InstanceId;
  getInstance(id: InstanceId): JourneyInstance | null;
  listInstances(): readonly InstanceId[];
  listDefinitions(): readonly JourneyDefinitionSummary[];
  /**
   * Cheap predicate for "is this journey id known to this runtime?" —
   * useful when a shell rehydrates tabs from persisted storage and wants
   * to drop unknown journeys before calling `start()` (which would throw
   * `UnknownJourneyError`). Returns `true` only for exact id matches.
   */
  isRegistered(journeyId: string): boolean;
  /** Subscribe to changes for one instance. Returns unsubscribe. */
  subscribe(id: InstanceId, listener: () => void): () => void;
  /**
   * Force-terminate an instance. Fires `onAbandon` if still active; no-op if
   * the instance is already terminal or unknown.
   */
  end(id: InstanceId, reason?: unknown): void;
  /**
   * Drop a terminal instance from the runtime. No-op for active/loading
   * instances (use `end()` first) and unknown ids. Prevents long-lived
   * shells from leaking terminal records over time.
   */
  forget(id: InstanceId): void;
  /**
   * Drop every terminal (completed / aborted) instance in one call. Returns
   * the number of records dropped. Useful hygiene for long-running shells
   * that accumulate finished journeys over a session.
   */
  forgetTerminal(): number;
}

// -----------------------------------------------------------------------------
// Status predicates
// -----------------------------------------------------------------------------

/**
 * True when the instance has reached a terminal state (`completed` or
 * `aborted`). Callers often need this disjunction; direct comparisons
 * against `status === "active"` / `"loading"` are already type-safe against
 * the `JourneyStatus` union and do not earn their own predicates.
 */
export function isTerminal(instance: JourneyInstance): boolean {
  return instance.status === "completed" || instance.status === "aborted";
}
