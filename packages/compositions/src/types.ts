import type {
  CatalogMeta,
  EntryInputOf,
  EntryNamesOf,
  ExitContract,
  JourneyHandleRef,
  ModuleTypeMap,
  RuntimeMountAdapter,
} from "@modular-react/core";

/** Opaque id minted by the composition runtime. Prefixed `ci_` to disambiguate from `ji_`. */
export type CompositionInstanceId = string;

/**
 * Status of a composition instance. Compositions are pure projections of
 * state — there is no async setup phase, so instances flip straight from
 * `"active"` (the only initial value) to `"disposed"` on teardown.
 */
export type CompositionStatus = "active" | "disposed";

// ---------------------------------------------------------------------------
// Zone resolution — what a selector returns
// ---------------------------------------------------------------------------

/**
 * Runtime form of what a zone selector returns. Three arms:
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
 * registered fails at compile time. For *strong* per-`(module, entry)`
 * input checking — i.e. selectors that fail compile when `input` doesn't
 * match the target entry's declared schema — see {@link ZoneSpec}.
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
 * Internal helper: detects `any` at the type level so {@link ZoneSpec} can
 * fall back to the loose {@link ZoneResolution} shape when no concrete
 * `TModules` is supplied. Without this gate, the mapped-type expansion
 * collapses `module-entry` to `never` (a known TS quirk with `any` in
 * mapped-key positions) and breaks the framework's own
 * `ZoneSelector<any, any>` paths.
 */
type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Strong `module-entry` arm — discriminated union over every reachable
 * `(module, entry)` pair in `TModules`, with `input` narrowed to the
 * target entry's declared schema. Falls back to the loose runtime shape
 * when `TModules` is `any` so internal generic-erased paths
 * (`ZoneSelector<any, any>` etc.) keep type-checking.
 */
type ModuleEntryArm<TModules extends ModuleTypeMap> =
  IsAny<TModules> extends true
    ? {
        readonly kind: "module-entry";
        readonly module: string;
        readonly entry: string;
        readonly input?: unknown;
      }
    : {
        [M in keyof TModules & string]: {
          [E in EntryNamesOf<TModules[M]> & string]: {
            readonly kind: "module-entry";
            readonly module: M;
            readonly entry: E;
            readonly input: EntryInputOf<TModules[M], E>;
          };
        }[EntryNamesOf<TModules[M]> & string];
      }[keyof TModules & string];

/**
 * Author-facing zone specification — strong per-`(module, entry)`
 * discriminated union for the `module-entry` arm. Mirrors
 * `StepSpec<TModules>` from `@modular-react/journeys`: narrowing on
 * `module` + `entry` picks the corresponding `input` type, so a selector
 * that returns a wrong-shaped input fails at compile time.
 *
 * Selectors authored against {@link ZoneSelector} return this form;
 * the runtime stores resolutions in the looser {@link ZoneResolution}
 * shape so internal paths don't pay per-generic mapped-type cost.
 *
 * Authors who want input type-checking must supply concrete module
 * descriptors in their `TModules` type — typically via `import type
 * editorModule from "@my-org/editor"` and a `typeof` map. With a wide
 * `TModules` (default or `any`), `ZoneSpec` falls back to the loose
 * resolution shape via the {@link ModuleEntryArm} fallback.
 */
export type ZoneSpec<TModules extends ModuleTypeMap> =
  | ModuleEntryArm<TModules>
  | {
      readonly kind: "journey";
      readonly handle: JourneyHandleRef<string, any, any>;
      readonly input?: unknown;
      readonly instanceId?: CompositionInstanceId;
    }
  | { readonly kind: "empty" };

/**
 * Snapshot of the runtime context passed to every zone selector.
 *
 *   - `state` — the composition's current state.
 *   - `deps`  — the shared-dependency snapshot captured from the registry
 *     at resolve time.
 *   - `dispatch` — bound to the active instance, stable across renders.
 *     Selectors that build *prop-driven panel inputs* use this to wire
 *     callbacks into the panel's `input` (e.g.
 *     `onSelect: (id) => dispatch({ selectedItem: id })`) so the panel
 *     module stays composition-unaware. See the package README's
 *     "Authoring patterns — Prop-driven panels vs panel hooks" section.
 *
 * Selectors are pure functions — they MUST NOT mutate `state` or fire
 * side effects. Calling `dispatch` *synchronously* from the selector
 * body is a side effect and unsupported; only place callbacks that the
 * panel may later invoke into the returned resolution's `input`.
 */
export interface ZoneSelectorCtx<TState> {
  readonly state: TState;
  readonly deps: Readonly<Record<string, unknown>>;
  readonly dispatch: (
    updater: Partial<TState> | ((prev: TState) => Partial<TState> | TState),
  ) => void;
}

/**
 * Pure projection of composition state into a zone resolution. Returns
 * {@link ZoneSpec} (strong per-`(module, entry)` typing) so wrong-shaped
 * `input` fails at compile time when `TModules` is concrete; assignable
 * to {@link ZoneResolution} for runtime storage.
 */
export type ZoneSelector<TModules extends ModuleTypeMap, TState> = (
  ctx: ZoneSelectorCtx<TState>,
) => ZoneSpec<TModules>;

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
export interface ZoneDescriptor<TModules extends ModuleTypeMap, TState, TContract = unknown> {
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
 *   - `onMount` runs once at `runtime.start()`, synchronously, before
 *     `start()` returns the new instance id. It can fire before any
 *     outlet has attached.
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
 *   - `TInput`   — initialization input threaded into `initialState`.
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

export interface CompositionRegisterOptions<TState = unknown> {
  /**
   * Fires when a zone selector or panel render throws. Observation-only —
   * the outlet still applies the `onZoneError` policy. Useful for shell
   * telemetry that doesn't belong in composition authoring code.
   *
   * Phases:
   *  - `"select"` — the zone's `select` callback threw.
   *  - `"render"` — a panel rendered into the zone threw.
   *  - `"lifecycle"` — `lifecycle.onMount` / `onUnmount` threw.
   *  - `"emit"` — the host's `onZoneEvent` callback threw.
   *  - `"notify"` — a runtime subscriber listener threw.
   *  - `"retry-exhausted"` — the host returned `policy: "retry"` from
   *    `onZoneError` but the configured `retryLimit` had already been
   *    consumed; the original render error is passed through.
   */
  onError?: (
    err: unknown,
    ctx: {
      readonly zone: string;
      readonly phase:
        | "select"
        | "render"
        | "lifecycle"
        | "emit"
        | "notify"
        | "retry-exhausted";
    },
  ) => void;
  /**
   * Layered on top of the definition-level `lifecycle.onMount` — fires
   * exactly once when the instance starts. Useful for shell telemetry
   * that doesn't belong in composition-author code.
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
}

export interface RegisteredComposition<TState = unknown> {
  readonly definition: AnyCompositionDefinition;
  readonly options: CompositionRegisterOptions<TState> | undefined;
}

// ---------------------------------------------------------------------------
// Hydration blob — for SSR / out-of-band attachment, NOT persistence.
// ---------------------------------------------------------------------------

/**
 * Serialized form of a composition instance, used solely by
 * {@link hydrateComposition} to attach a server-rendered or debug-dump
 * blob to a runtime. Compositions intentionally do NOT ship a persistence
 * adapter — their state is coordination, not flow, and applications that
 * want it durable should keep it in their own state store (URL params,
 * Redux + redux-persist, zustand-persist, etc.) and feed it into the
 * composition through `initialState(input)`.
 */
export interface SerializedComposition<TState = unknown> {
  readonly definitionId: string;
  readonly version: string;
  readonly instanceId: CompositionInstanceId;
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
   * `useCompositionDispatch`; this is the lower-level entry point. A
   * dispatch on a disposed (or unknown) instance is a silent no-op.
   */
  dispatch<TState>(
    id: CompositionInstanceId,
    updater: Partial<TState> | ((prev: TState) => Partial<TState> | TState),
  ): void;
  /**
   * Tear down an instance. Fires `lifecycle.onUnmount`, the
   * registration-level `onUnmount`, and `onDispose(ctx)`; unsubscribes
   * the store; notifies subscribers one last time with
   * `status: "disposed"`; then deletes the record. Idempotent — calling
   * on an already-disposed instance is a no-op.
   *
   * Callers usually do not invoke this directly; the outlet disposes
   * automatically when it unmounts and no other listeners remain. Reach
   * for `end()` for programmatic teardown (e.g. a Cmd-K palette killing
   * a stale instance, or test cleanup).
   */
  end(id: CompositionInstanceId, ctx?: { readonly reason: unknown }): void;

  /**
   * Register a {@link RuntimeMountAdapter} for a zone-resolution `kind`.
   * The outlet looks up the adapter when it encounters a non-module
   * resolution (e.g. `kind: "journey"`); if no adapter is registered
   * for the kind the zone renders its error fallback with a clear
   * message.
   *
   * Wire this once after the manifest resolves and before mounting the
   * `<CompositionsProvider>` — e.g.
   * `manifest.extensions.compositions.registerMountAdapter("journey",
   * createJourneyMountAdapter(manifest.extensions.journeys))`.
   * Registering twice for the same kind replaces the previous adapter.
   */
  registerMountAdapter(kind: string, adapter: RuntimeMountAdapter): void;

  /**
   * Read the adapter registered under `kind`, or `undefined` if none is
   * registered. Used internally by the outlet; exposed so tests and
   * external observers can introspect the wiring.
   */
  getMountAdapter(kind: string): RuntimeMountAdapter | undefined;
}
