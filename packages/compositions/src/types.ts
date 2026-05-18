import type {
  CatalogMeta,
  ExitContract,
  JourneyHandleRef,
  JourneyPersistence,
  MaybePromise,
  ModuleTypeMap,
  SerializedJourney,
} from "@modular-react/core";

/** Opaque id minted by the composition runtime. Prefixed `ci_` to disambiguate from `ji_`. */
export type CompositionInstanceId = string;

/** Status of a composition instance over its lifetime. */
export type CompositionStatus = "loading" | "active" | "disposed";

// ---------------------------------------------------------------------------
// Zone resolution — what a selector returns
// ---------------------------------------------------------------------------

/**
 * The discriminated union a zone's selector returns on every state change.
 * Three arms:
 *
 *   - `module-entry`: render the named module's entry point. The runtime
 *     looks the entry up in the registry-supplied module map and feeds
 *     `input` into the component via `ModuleEntryProps.input`.
 *   - `journey`: mount a `<JourneyOutlet>` for the referenced journey
 *     handle. The composition runtime lazily mints a child journey
 *     instance keyed on `(handle.id, input)` unless `instanceId` is
 *     supplied (caller-owned journey lifetime).
 *   - `empty`: render the zone's `fallback` (or nothing).
 *
 * `TModules` keeps `module` constrained to ids that participate in the
 * composition's typed module map, so a typo or a module that isn't
 * registered fails at compile time.
 */
export type ZoneResolution<TModules extends ModuleTypeMap = ModuleTypeMap> =
  | {
      readonly kind: "module-entry";
      readonly module: keyof TModules & string;
      readonly entry: string;
      readonly input?: unknown;
    }
  | {
      readonly kind: "journey";
      readonly handle: JourneyHandleRef<string, any, any>;
      readonly input?: unknown;
      readonly instanceId?: CompositionInstanceId;
    }
  | { readonly kind: "empty" };

/**
 * Snapshot of the runtime context passed to every zone selector. `state`
 * is the composition's current state; `deps` is the shared-dependency
 * snapshot captured from the registry at resolve time.
 *
 * Selectors are pure functions — they MUST NOT mutate `state` or fire
 * side effects. The runtime re-runs them on every state change.
 */
export interface ZoneSelectorCtx<TState> {
  readonly state: TState;
  readonly deps: Readonly<Record<string, unknown>>;
}

/** Pure projection of composition state into a zone resolution. */
export type ZoneSelector<TModules extends ModuleTypeMap, TState> = (
  ctx: ZoneSelectorCtx<TState>,
) => ZoneResolution<TModules>;

/**
 * Author-facing zone descriptor. The author registers `select` (mandatory)
 * plus optional safety / UX trimmings:
 *
 *   - `contract` — declares that every panel resolved into this zone must
 *     declare a matching `ExitContract` on its exit points. Checked at
 *     registry resolve time by `validateCompositionContracts` for every
 *     reachable `module-entry` resolution.
 *   - `fallback` — rendered when the selector returns `"empty"`.
 *   - `preload` — controls whether sibling-zone entries are prefetched at
 *     idle time. Defaults to `"lazy"`; pass `"eager"` to warm all
 *     candidates up-front (only meaningful for lazy entries).
 */
export interface ZoneDescriptor<
  TModules extends ModuleTypeMap,
  TState,
  TContract = unknown,
> {
  readonly select: ZoneSelector<TModules, TState>;
  readonly contract?: ExitContract<TContract>;
  readonly fallback?: React.ComponentType;
  readonly preload?: "lazy" | "eager";
}

/** Map of zone names to descriptors. Author-facing input to `defineComposition`. */
export type ZoneMap<TModules extends ModuleTypeMap, TState> = Readonly<
  Record<string, ZoneDescriptor<TModules, TState, any>>
>;

// ---------------------------------------------------------------------------
// Composition definition
// ---------------------------------------------------------------------------

/**
 * Lifecycle hooks fired by the composition runtime around an instance's
 * lifetime. Symmetric with `ModuleLifecycle` from core — `onMount` runs
 * once when the first outlet attaches; `onUnmount` runs when the last
 * outlet detaches and the disposal microtask fires.
 */
export interface CompositionLifecycle<TState> {
  onMount?(state: TState, deps: Readonly<Record<string, unknown>>): void;
  onUnmount?(state: TState, deps: Readonly<Record<string, unknown>>): void;
}

/** Per-zone error boundary policy — mirrors `JourneyStepErrorPolicy`. */
export type CompositionZoneErrorPolicy = "retry" | "fallback" | "ignore";

/**
 * Author-facing composition definition. Sibling primitive to
 * `JourneyDefinition` and `ModuleDescriptor`. A composition arranges
 * multiple modules into named zones on a single screen, owning its own
 * scoped store as the orchestration bus.
 *
 * Generics:
 *   - `TModules` — typed map of modules the composition may resolve into
 *     zones. Module ids in `select` return values are constrained to this map.
 *   - `TZones`   — the zone-name → descriptor map. Use `const` inference
 *     in `defineComposition` to preserve literal-string zone names.
 *   - `TState`   — the composition's scoped store shape.
 *   - `TInput`   — initialization input; threaded through persistence
 *     `keyFor` and `initialState`.
 *   - `TMeta`    — app-owned discovery metadata bag, merged onto `CatalogMeta`.
 */
export interface CompositionDefinition<
  TModules extends ModuleTypeMap,
  TZones extends ZoneMap<TModules, TState>,
  TState,
  TInput = void,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
> {
  readonly id: string;
  readonly version: string;
  readonly meta?: Readonly<CatalogMeta & TMeta>;

  readonly zones: TZones;
  readonly initialState: (input: TInput) => TState;

  /**
   * Expected module version ranges keyed by module id. Same semantics as
   * `JourneyDefinition.moduleCompat` — checked at resolve time, mismatch
   * fails assembly.
   */
  readonly moduleCompat?: { readonly [K in keyof TModules & string]?: string };

  /**
   * Closed set of journey handles any zone may host via a `"journey"`
   * resolution. Optional — when present, the resolve-time validator
   * verifies every reachable journey handle is in this list, parallel to
   * `JourneyDefinition.invokes`.
   */
  readonly invokes?: ReadonlyArray<JourneyHandleRef<string, any, any>>;

  readonly lifecycle?: CompositionLifecycle<TState>;

  /**
   * Per-zone error boundary fallback policy. Receives the throw and the
   * zone context; returns `"retry"` to bump a retry counter (capped by
   * the outlet's `retryLimit`), `"fallback"` to keep the boundary's
   * fallback UI mounted, or `"ignore"` to blank the zone.
   */
  readonly onZoneError?: (
    err: unknown,
    ctx: {
      readonly zone: keyof TZones & string;
      readonly instanceId: CompositionInstanceId;
      readonly state: TState;
    },
  ) => CompositionZoneErrorPolicy;

  /**
   * Optional hook fired when an instance reaches `disposed` status. The
   * composition has no inherent terminal — disposal is driven by the
   * outlet unmounting or the host calling `runtime.end(id)`.
   */
  readonly onDispose?: (ctx: {
    readonly compositionId: string;
    readonly instanceId: CompositionInstanceId;
    readonly state: TState;
    readonly reason: unknown;
  }) => void;
}

/**
 * Erased shape used by the registry — `any` on every generic so the
 * registry can store definitions from different compositions side-by-side.
 * Same rationale as `AnyJourneyDefinition`.
 */
export type AnyCompositionDefinition = CompositionDefinition<any, any, any, any, any>;

// ---------------------------------------------------------------------------
// Register options + internal record
// ---------------------------------------------------------------------------

export interface CompositionRegisterOptions<TState = unknown, TInput = unknown> {
  /** Persistence adapter — without it, instances live in memory only. */
  persistence?: CompositionPersistence<TState, TInput>;
  /**
   * Fires when a zone selector or panel render throws. Observation-only —
   * the outlet still applies the `onZoneError` policy. Useful for shell
   * telemetry that doesn't belong in composition authoring code.
   */
  onError?: (
    err: unknown,
    ctx: { readonly zone: string; readonly phase: "select" | "render" | "lifecycle" },
  ) => void;
  /**
   * Layered on top of the definition-level `onMount` — fires when a new
   * instance becomes active (after persistence load, before first render).
   */
  onMount?: (ctx: {
    readonly compositionId: string;
    readonly instanceId: CompositionInstanceId;
    readonly state: TState;
  }) => void;
  /** Layered on top of the definition-level `onDispose`. */
  onUnmount?: (ctx: {
    readonly compositionId: string;
    readonly instanceId: CompositionInstanceId;
    readonly state: TState;
  }) => void;
}

export interface RegisteredComposition<TState = unknown, TInput = unknown> {
  readonly definition: AnyCompositionDefinition;
  readonly options: CompositionRegisterOptions<TState, TInput> | undefined;
}

// ---------------------------------------------------------------------------
// Persistence — reuse the journey adapter shape, narrower serialized blob
// ---------------------------------------------------------------------------

/**
 * Persistence adapter for a composition instance. Structurally compatible
 * with {@link JourneyPersistence} so the same backend implementation can
 * serve both — only the blob shape narrows.
 */
export interface CompositionPersistence<TState = unknown, TInput = unknown> {
  /**
   * Compute the persistence key from the composition id and starting
   * input. MUST be deterministic — `start()` probes this key to find an
   * existing instance and achieve idempotency.
   */
  keyFor: (ctx: { compositionId: string; input: TInput }) => string;
  load: (key: string) => MaybePromise<SerializedComposition<TState> | null>;
  save: (key: string, blob: SerializedComposition<TState>) => MaybePromise<void>;
  remove: (key: string) => MaybePromise<void>;
}

/**
 * Serialized form of a composition instance. Intentionally smaller than
 * {@link SerializedJourney} — no step history, no rollback snapshots, no
 * parent/child link. Compositions are pure state projections, so resume
 * deterministically replays selectors against `state`.
 */
export interface SerializedComposition<TState = unknown> {
  readonly definitionId: string;
  readonly version: string;
  readonly instanceId: CompositionInstanceId;
  readonly status: "active";
  readonly state: TState;
  readonly startedAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Public runtime / instance surface
// ---------------------------------------------------------------------------

/**
 * Read-only snapshot of a composition instance returned by
 * `runtime.getInstance(id)`. Stable reference between mutations — the
 * runtime caches the snapshot per `revision` so `useSyncExternalStore`
 * does not see false changes.
 */
export interface CompositionInstance<TState = unknown> {
  readonly id: CompositionInstanceId;
  readonly compositionId: string;
  readonly status: CompositionStatus;
  readonly state: TState;
  readonly startedAt: string;
  readonly updatedAt: string;
}

export interface CompositionDefinitionSummary {
  readonly id: string;
  readonly version: string;
  readonly meta?: Readonly<CatalogMeta & Record<string, unknown>>;
}

/**
 * Lightweight handle a composition author can export so callers open the
 * composition with a typed `input`. Mirrors {@link JourneyHandleRef} —
 * phantom fields, identity-only at runtime.
 */
export interface CompositionHandleRef<TId extends string = string, TInput = unknown> {
  readonly id: TId;
  readonly __input?: TInput;
}

/**
 * Event emitted by a zone panel via `useCompositionEmit`. The composition
 * outlet's `onZoneEvent` callback routes these to the host. The shape is
 * intentionally minimal so panels and hosts can agree on conventions
 * (exit names, payload schemas) at the application layer.
 */
export interface CompositionZoneEvent {
  readonly kind: string;
  readonly payload?: unknown;
}

/**
 * Public composition runtime surface. Parallel to {@link JourneyRuntime} —
 * the registry exposes this as `manifest.extensions.compositions` (and
 * `manifest.compositions` if the framework wires the convenience alias).
 */
export interface CompositionRuntime {
  /** Handle form — type-checked input. */
  start<TId extends string, TInput>(
    handle: CompositionHandleRef<TId, TInput>,
    ...rest: [TInput] extends [void] ? [] | [input?: TInput] : [input: TInput]
  ): CompositionInstanceId;
  /** String-id form — accepts any `input` (the handle form is preferred). */
  start<TInput>(compositionId: string, input: TInput): CompositionInstanceId;
  getInstance(id: CompositionInstanceId): CompositionInstance | null;
  listInstances(): readonly CompositionInstanceId[];
  listDefinitions(): readonly CompositionDefinitionSummary[];
  isRegistered(compositionId: string): boolean;
  /** Subscribe to instance changes. Returns unsubscribe. */
  subscribe(id: CompositionInstanceId, listener: () => void): () => void;
  /**
   * Imperatively mutate the composition's state. Accepts either a partial
   * object (shallow-merged) or an updater function. Panels and the host
   * usually go through {@link CompositionContextValue.dispatch} via
   * `useCompositionDispatch`; this is the lower-level entry point.
   */
  dispatch<TState>(
    id: CompositionInstanceId,
    updater: Partial<TState> | ((prev: TState) => Partial<TState> | TState),
  ): void;
  /**
   * Tear down an instance. Cleans listeners, fires `onUnmount`, removes
   * persisted blob. Idempotent — calling on an already-disposed instance
   * is a no-op.
   */
  end(id: CompositionInstanceId, ctx?: { readonly reason: unknown }): void;
}

// Re-export the journey persistence type so callers who want a shared
// backend can satisfy both contracts from a single adapter shape.
export type { JourneyPersistence };
