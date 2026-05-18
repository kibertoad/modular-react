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
 *     handle. The composition outlet caches the minted journey instance
 *     id per ZoneRenderer keyed on `(handle.id, structural hash of input)`
 *     so a state change that produces the same resolution does not
 *     re-mint. Pass `instanceId` explicitly if you want caller-owned
 *     journey lifetime (the outlet then skips the cache and uses your id
 *     directly).
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
 *   - `preload` — controls whether THIS zone's currently-resolved
 *     module-entry is prefetched at idle time after the outlet mounts.
 *     Defaults to `"lazy"` (no extra prefetch — the chunk loads when
 *     the panel first renders). Pass `"eager"` to warm the entry's
 *     chunk during browser idle so the first paint of the zone is
 *     synchronous. Only meaningful for lazy entries; eager entries
 *     are already resolved.
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
 * lifetime. Symmetric with `ModuleLifecycle` from core:
 *
 *   - `onMount` runs once when the instance transitions to `"active"` —
 *     synchronously inside `runtime.start()` for memory-only compositions,
 *     and after the persistence `load()` resolves for persistence-backed
 *     ones. It can fire before any outlet has attached.
 *   - `onUnmount` runs once when the instance is disposed — either by
 *     an explicit `runtime.end(id)` or by the last outlet detaching
 *     (after a disposal microtask that survives StrictMode mount cycles).
 *
 * Both hooks receive the current state and the runtime's `deps` snapshot.
 * Throws in either hook are caught and routed to `options.onError` with
 * `phase: "lifecycle"`.
 */
export interface CompositionLifecycle<TState> {
  onMount?(state: TState, deps: Readonly<Record<string, unknown>>): void;
  onUnmount?(state: TState, deps: Readonly<Record<string, unknown>>): void;
}

/**
 * Per-zone error boundary policy:
 *
 *   - `retry` — bump the per-zone retry counter (capped by the outlet's
 *     `retryLimit`) and remount the boundary. On exhaustion, falls
 *     through to `fallback`.
 *   - `fallback` — keep the boundary's fallback UI rendered.
 *   - `ignore` — render `null` in place of the zone. Useful for a panel
 *     that's optional UI sugar (e.g. a recommendation strip) whose
 *     failure shouldn't show any error chrome to the user.
 */
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

  readonly lifecycle?: CompositionLifecycle<TState>;

  /**
   * Per-zone error boundary fallback policy. See
   * {@link CompositionZoneErrorPolicy} for the three options. Defaults
   * to `"fallback"` when omitted.
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

  /**
   * Definition-level migration hook. Runs over a loaded blob whenever
   * its `version` does not match `definition.version`. Returning a
   * migrated blob lets the runtime continue; throwing — or returning a
   * value the runtime can't reconcile — surfaces as a
   * {@link CompositionHydrationError}. Mirrors `JourneyDefinition.onHydrate`.
   */
  readonly onHydrate?: (
    blob: SerializedComposition<unknown>,
  ) => SerializedComposition<TState>;
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
   * Layered on top of the definition-level `lifecycle.onMount` — fires
   * exactly once when the instance transitions to `"active"` (after the
   * persistence load resolves, or immediately for memory-only
   * compositions). Useful for shell telemetry that doesn't belong in
   * composition-author code.
   */
  onMount?: (ctx: {
    readonly compositionId: string;
    readonly instanceId: CompositionInstanceId;
    readonly state: TState;
  }) => void;
  /**
   * Layered on top of the definition-level `lifecycle.onUnmount` — fires
   * exactly once at disposal. Receives the final state.
   */
  onUnmount?: (ctx: {
    readonly compositionId: string;
    readonly instanceId: CompositionInstanceId;
    readonly state: TState;
  }) => void;
  /**
   * Registration-level migration hook. Runs AFTER the definition's own
   * `onHydrate` — shells can layer environment-specific upgrades on top
   * of the composition author's. Same contract: produce a blob whose
   * `version` matches the active definition, or throw.
   */
  onHydrate?: (
    blob: SerializedComposition<unknown>,
  ) => SerializedComposition<TState>;
  /**
   * Debounce window (in milliseconds) between persistence writes for
   * this composition. When set, `dispatch` mutations within the window
   * coalesce into a single trailing-edge save. Defaults to `0` —
   * every mutation triggers a save (matching {@link JourneyPersistence}'s
   * semantics).
   *
   * High-frequency interactions (drag, controlled inputs) should set
   * this to ~150ms; durability-critical state should leave it at 0.
   * Disposal always flushes any pending save before clearing the blob.
   */
  saveDebounceMs?: number;
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
   *
   * Behavior across statuses:
   *   - `"loading"` — the updater is buffered and replayed in arrival
   *     order once the persistence load resolves and the instance flips
   *     to `"active"`. Callers do not lose writes issued right after
   *     `start()`.
   *   - `"active"` — applied synchronously to the underlying store.
   *   - `"disposed"` — silently dropped.
   */
  dispatch<TState>(
    id: CompositionInstanceId,
    updater: Partial<TState> | ((prev: TState) => Partial<TState> | TState),
  ): void;
  /**
   * Tear down an instance. Cancels any pending debounced save, fires
   * `lifecycle.onUnmount` and the registration-level `onUnmount`, fires
   * `onDispose(ctx)`, unsubscribes the store, removes the persisted blob
   * (successor-aware — if another instance already claimed the same
   * persistence key, the remove is suppressed), notifies subscribers one
   * last time with `status: "disposed"`, then deletes the record.
   * Idempotent — calling on an already-disposed instance is a no-op.
   *
   * Callers usually do not invoke this directly; the outlet disposes
   * automatically when it unmounts and no other listeners remain.
   * Reach for `end()` for programmatic teardown (e.g. a Cmd-K palette
   * killing a stale instance, or test cleanup).
   */
  end(id: CompositionInstanceId, ctx?: { readonly reason: unknown }): void;
}

// Re-export the journey persistence type so callers who want a shared
// backend can satisfy both contracts from a single adapter shape.
export type { JourneyPersistence };
