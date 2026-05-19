import { createStore, isDevEnv } from "@modular-react/core";
import type { ModuleDescriptor, RuntimeMountAdapter, Store } from "@modular-react/core";
import type {
  CompositionDefinitionSummary,
  CompositionHandleRef,
  CompositionInstance,
  CompositionInstanceId,
  CompositionRuntime,
  CompositionStatus,
  RegisteredComposition,
  SerializedComposition,
} from "./types.js";
import {
  CompositionHydrationError,
  UnknownCompositionError,
  validateCompositionContracts,
} from "./validation.js";

/**
 * Per-instance internal record. Trimmed analog of journeys'
 * `InstanceRecord` — no step history, no rollback, no parent/child link,
 * and (since compositions don't ship a persistence adapter) no save
 * pipeline. Resume = re-run selectors against the in-memory state.
 */
export interface CompositionInstanceRecord<TState = unknown> {
  id: CompositionInstanceId;
  compositionId: string;
  status: CompositionStatus;
  state: TState;
  /** Underlying reactive store. setState merges or replaces just like zustand. */
  store: Store<TState>;
  startedAt: string;
  updatedAt: string;
  /** Monotonic counter — bumped on observable changes, used to memoize the public snapshot. */
  revision: number;
  cachedSnapshot: { revision: number; instance: CompositionInstance } | null;
  /** Outlet attachment count; disposal trigger when this drops to 0. */
  outletRefCount: number;
  listeners: Set<() => void>;
  /**
   * Hydration holds — incremented for each `hydrateComposition` call,
   * decremented by the returned `release()` function. A hydrated
   * instance is a deliberate seed (typically an SSR blob the caller
   * wants to survive across navigation between outlet mounts) so it
   * does NOT auto-dispose when the last outlet detaches. The
   * `start()` path leaves this at 0 — those instances are owned by
   * whoever mounts the outlet.
   */
  hydrationHolds: number;
  /** Per-zone consecutive retry counter, used by the outlet's retryLimit gate. */
  zoneRetryCounts: Map<string, number>;
  /** `lifecycle.onMount` has fired for this instance — gate so it only runs once. */
  mountFired: boolean;
  unmountFired: boolean;
  /**
   * Disposal is in flight: status still reads `"active"` (so unmount
   * hooks can observe a still-live instance) but no new state mutations
   * should land. Dispatches that arrive between the start of
   * `endInstance` and the final status flip are ignored so an
   * `onDispose` or `onUnmount` hook that calls `dispatch` doesn't
   * corrupt the terminal snapshot or fan out to listeners that have
   * already moved on. Cleared back to false implicitly when the record
   * is deleted from the instances map.
   */
  disposing: boolean;
  /** Subscription to the store's `subscribe` — kept so we can detach on disposal. */
  storeUnsubscribe: () => void;
}

export interface CompositionRuntimeOptions {
  readonly debug?: boolean;
  readonly modules?: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  /**
   * Opaque shared-dependency bag threaded verbatim to lifecycle hooks
   * and zone selectors. Originates from the plugin factory's `deps`
   * option (or whatever a direct caller passes here) — not from
   * `PluginResolveCtx`. The runtime never inspects its contents.
   */
  readonly deps?: Readonly<Record<string, unknown>>;
}

/**
 * Module-private accessor for runtime internals (record map, registered
 * map, module map). Kept off the public `CompositionRuntime` surface so
 * `Object.keys(runtime)` and autocomplete stay clean.
 */
export interface CompositionRuntimeInternals {
  readonly __getRecord: (id: CompositionInstanceId) => CompositionInstanceRecord | undefined;
  readonly __getRegistered: (compositionId: string) => RegisteredComposition | undefined;
  readonly __moduleMap: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  readonly __deps: Readonly<Record<string, unknown>>;
  readonly __attach: (id: CompositionInstanceId) => void;
  readonly __detach: (id: CompositionInstanceId) => void;
  readonly __consumeRetry: (id: CompositionInstanceId, zone: string, cap: number) => boolean;
  readonly __resetRetry: (id: CompositionInstanceId, zone: string) => void;
  readonly __fireOnError: (
    id: CompositionInstanceId,
    err: unknown,
    ctx: {
      zone: string | undefined;
      phase: "select" | "render" | "lifecycle" | "emit" | "notify" | "retry-exhausted";
    },
  ) => void;
  /**
   * Direct-hydration escape hatch used by `hydrateComposition`. Bypasses
   * `start()` (and therefore `initialState`) so out-of-band blobs (SSR
   * dumps, debug snapshots) can be attached without going through the
   * input-driven init path. Bumps `hydrationHolds` to 1 — the caller
   * decrements via {@link CompositionRuntimeInternals.__releaseHydrationHold}.
   */
  readonly __hydrate: (
    reg: RegisteredComposition,
    blob: SerializedComposition<unknown>,
  ) => CompositionInstanceId;
  /**
   * Decrement the hydration hold count for `id` and re-run the disposal
   * gate. No-op on an unknown / already-disposed id.
   */
  readonly __releaseHydrationHold: (id: CompositionInstanceId) => void;
}

const INTERNALS = new WeakMap<CompositionRuntime, CompositionRuntimeInternals>();

export function getInternals(runtime: CompositionRuntime): CompositionRuntimeInternals {
  const internals = INTERNALS.get(runtime);
  if (!internals) {
    throw new Error(
      "[@modular-react/compositions] Runtime is missing internals — was it created with createCompositionRuntime()?",
    );
  }
  return internals;
}

/**
 * Construct a composition runtime bound to a set of registered
 * compositions. Called once at registry resolve time; the runtime is
 * owned by the manifest and exposed as `manifest.extensions.compositions`.
 *
 * Passing an empty `registered` array yields a no-op runtime: every
 * public method is safe to call, and `start()` throws
 * `UnknownCompositionError` — matching the "not registered" failure mode.
 *
 * Throws synchronously if two `RegisteredComposition` entries share the
 * same `definition.id`. The plugin's `validate(...)` step usually catches
 * this earlier with a richer error; the runtime guards as a last line of
 * defense for tests / direct callers.
 */
export function createCompositionRuntime(
  registered: readonly RegisteredComposition[],
  options: CompositionRuntimeOptions = {},
): CompositionRuntime {
  const debug = options.debug ?? isDevEnv();
  const moduleMap = options.modules ?? {};
  const deps = options.deps ?? {};

  // Duplicate-id guard. `validateCompositionContracts` below also
  // catches duplicates with a richer error, so the plugin path
  // surfaces them at registry-validate time. This block is the last
  // line of defense for direct callers (tests, library wrappers,
  // hydration plumbing) who skip the plugin and might otherwise
  // silently overwrite a definition.
  const definitions = new Map<string, RegisteredComposition>();
  for (const reg of registered) {
    if (definitions.has(reg.definition.id)) {
      throw new Error(
        `[@modular-react/compositions] Composition "${reg.definition.id}" is registered more than once. ` +
          `Pass a single RegisteredComposition per id to createCompositionRuntime().`,
      );
    }
    definitions.set(reg.definition.id, reg);
  }

  // Cross-reference contract / moduleCompat validation. The plugin path
  // calls this earlier (so the error fires during registry validation,
  // before any React mounts), but direct callers — tests, library
  // wrappers, the hydration story for SSR — would otherwise skip it
  // and only see contract drift at first render. Run it here on the
  // module map the runtime was constructed with so both paths converge.
  if (registered.length > 0 && options.modules) {
    validateCompositionContracts(registered, Object.values(options.modules));
  }

  const instances = new Map<CompositionInstanceId, CompositionInstanceRecord>();

  // Mount adapters keyed by zone-resolution `kind`. Today the only kind
  // that uses this is `"journey"` (wired by the consumer with
  // `createJourneyMountAdapter` from `@modular-react/journeys`). Future
  // kinds (composition-in-zone, federated remote modules) reuse the
  // same hole. Registering replaces the previous entry — last writer
  // wins, matching `Map.set` semantics.
  const mountAdapters = new Map<string, RuntimeMountAdapter>();

  function nowIso(): string {
    return new Date().toISOString();
  }

  function mintInstanceId(): CompositionInstanceId {
    const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (cryptoObj?.randomUUID) return `ci_${cryptoObj.randomUUID()}`;
    // No `crypto.randomUUID` — e.g. older Node test runners or
    // sandboxed contexts. Two `Math.random()` calls give ~104 bits
    // of entropy combined; together with the millisecond timestamp
    // the same-ms collision probability is negligible. The previous
    // 8-character single random had ~40 bits, which can collide
    // within a tight test loop.
    const rand1 = Math.random().toString(36).slice(2, 12);
    const rand2 = Math.random().toString(36).slice(2, 12);
    return `ci_${Date.now().toString(36)}_${rand1}${rand2}`;
  }

  function assertKnown(compositionId: string): RegisteredComposition {
    const reg = definitions.get(compositionId);
    if (!reg) throw new UnknownCompositionError(compositionId, [...definitions.keys()]);
    return reg;
  }

  function summarize(reg: RegisteredComposition): CompositionDefinitionSummary {
    return {
      id: reg.definition.id,
      version: reg.definition.version,
      meta: reg.definition.meta,
    };
  }

  function notify(record: CompositionInstanceRecord) {
    record.revision += 1;
    record.cachedSnapshot = null;
    // Snapshot before iterating: a listener may call `subscribe`/
    // `unsubscribe` on the same record (a useSyncExternalStore-driven
    // re-subscribe is the common case). Iterating the live `Set` would
    // pick up added entries on the same pass and skip removed ones —
    // both behaviors silently cause double or missed fires.
    const listeners = [...record.listeners];
    for (const listener of listeners) {
      try {
        listener();
      } catch (err) {
        // Always log listener throws — a silent listener bug is hard to
        // diagnose without observability and `debug` is usually off in
        // production. We also route to `options.onError` under a
        // distinct `"notify"` phase so shell telemetry can split
        // notify-time failures from selector/render/emit ones.
        console.error("[@modular-react/compositions] listener threw", err);
        fireOnError(record.id, err, { zone: undefined, phase: "notify" });
      }
    }
  }

  function snapshot(record: CompositionInstanceRecord): CompositionInstance {
    if (record.cachedSnapshot && record.cachedSnapshot.revision === record.revision) {
      return record.cachedSnapshot.instance;
    }
    const instance: CompositionInstance = {
      id: record.id,
      compositionId: record.compositionId,
      status: record.status,
      state: record.state,
      startedAt: record.startedAt,
      updatedAt: record.updatedAt,
    };
    record.cachedSnapshot = { revision: record.revision, instance };
    return instance;
  }

  function fireOnError(
    id: CompositionInstanceId,
    err: unknown,
    ctx: {
      zone: string | undefined;
      phase: "select" | "render" | "lifecycle" | "emit" | "notify" | "retry-exhausted";
    },
  ) {
    const record = instances.get(id);
    if (!record) return;
    const reg = definitions.get(record.compositionId);
    try {
      reg?.options?.onError?.(err, ctx);
    } catch (hookErr) {
      if (debug) console.error("[@modular-react/compositions] onError hook threw", hookErr);
    }
  }

  function fireOnMount<TState>(
    reg: RegisteredComposition,
    record: CompositionInstanceRecord<TState>,
  ) {
    if (record.mountFired) return;
    record.mountFired = true;
    try {
      (
        reg.definition.lifecycle?.onMount as
          | ((s: TState, d: Readonly<Record<string, unknown>>) => void)
          | undefined
      )?.(record.state, deps);
    } catch (err) {
      if (debug) console.error("[@modular-react/compositions] lifecycle.onMount threw", err);
      fireOnError(record.id, err, { zone: undefined, phase: "lifecycle" });
    }
    try {
      reg.options?.onMount?.({
        compositionId: record.compositionId,
        instanceId: record.id,
        state: record.state,
      });
    } catch (err) {
      if (debug) console.error("[@modular-react/compositions] options.onMount threw", err);
    }
  }

  function fireOnUnmount<TState>(
    reg: RegisteredComposition,
    record: CompositionInstanceRecord<TState>,
  ) {
    if (record.unmountFired) return;
    record.unmountFired = true;
    try {
      (
        reg.definition.lifecycle?.onUnmount as
          | ((s: TState, d: Readonly<Record<string, unknown>>) => void)
          | undefined
      )?.(record.state, deps);
    } catch (err) {
      if (debug) console.error("[@modular-react/compositions] lifecycle.onUnmount threw", err);
      fireOnError(record.id, err, { zone: undefined, phase: "lifecycle" });
    }
    try {
      reg.options?.onUnmount?.({
        compositionId: record.compositionId,
        instanceId: record.id,
        state: record.state,
      });
    } catch (err) {
      if (debug) console.error("[@modular-react/compositions] options.onUnmount threw", err);
    }
  }

  // -------------------------------------------------------------------------
  // Instance creation
  // -------------------------------------------------------------------------

  function createRecord<TState>(
    reg: RegisteredComposition,
    instanceId: CompositionInstanceId,
    state: TState,
    startedAt: string,
    updatedAt: string,
  ): CompositionInstanceRecord<TState> {
    const store = createStore<TState>(state);
    // Subscribe FIRST so the record's `storeUnsubscribe` field is the
    // real handle from the start — the previous "no-op placeholder,
    // overwrite after construction" pattern was a hidden assumption
    // that `store.subscribe` never fires synchronously.
    let record!: CompositionInstanceRecord<TState>;
    const storeUnsubscribe = store.subscribe((next) => {
      record.state = next;
      record.updatedAt = nowIso();
      notify(record);
    });
    record = {
      id: instanceId,
      compositionId: reg.definition.id,
      status: "active",
      state,
      store,
      startedAt,
      updatedAt,
      revision: 0,
      cachedSnapshot: null,
      outletRefCount: 0,
      listeners: new Set(),
      zoneRetryCounts: new Map(),
      mountFired: false,
      unmountFired: false,
      disposing: false,
      hydrationHolds: 0,
      storeUnsubscribe,
    };
    instances.set(instanceId, record);
    return record;
  }

  const ending = new Set<CompositionInstanceId>();
  function endInstance(id: CompositionInstanceId, reason: unknown): void {
    const record = instances.get(id);
    if (!record) return;
    if (record.status === "disposed") return;
    // Re-entrance guard: an `onUnmount`/`onDispose` hook that calls
    // `runtime.end(id)` again would otherwise re-fire the hooks
    // because `record.status` is still `"active"` at this point. The
    // ordering invariant we want is: hooks see the live instance, then
    // status flips and the terminal notify goes out.
    if (ending.has(id)) return;
    ending.add(id);
    // Flip the `disposing` flag BEFORE the hooks run so a hook that
    // calls `dispatch` (or any path that lands in `dispatch` —
    // listener fan-out, indirect emit) is silently ignored. `status`
    // is still `"active"` here on purpose: the hooks themselves want
    // to read a live instance via `getInstance(id)`. The terminal
    // status flip happens after the hooks return.
    record.disposing = true;
    const reg = definitions.get(record.compositionId);
    fireOnUnmount(reg as RegisteredComposition, record);
    try {
      reg?.definition.onDispose?.({
        compositionId: record.compositionId,
        instanceId: record.id,
        state: record.state,
        reason,
      });
    } catch (err) {
      if (debug) console.error("[@modular-react/compositions] onDispose threw", err);
    }
    // Hooks have observed the still-active instance. Flip status now so
    // the post-dispose notify broadcasts the terminal snapshot, and
    // any listener that calls `getInstance(id)` in response reads
    // `status: "disposed"`.
    record.status = "disposed";
    record.storeUnsubscribe();
    notify(record);
    record.listeners.clear();
    instances.delete(id);
    ending.delete(id);
  }

  // -------------------------------------------------------------------------
  // Public runtime surface
  // -------------------------------------------------------------------------

  const runtime: CompositionRuntime = {
    start(handleOrId: any, ...rest: any[]): CompositionInstanceId {
      const compositionId =
        typeof handleOrId === "string" ? handleOrId : (handleOrId as CompositionHandleRef).id;
      const input = rest[0];
      const reg = assertKnown(compositionId);
      const instanceId = mintInstanceId();
      const initial = reg.definition.initialState(input);
      const record = createRecord(
        reg as RegisteredComposition,
        instanceId,
        initial,
        nowIso(),
        nowIso(),
      );
      fireOnMount(reg as RegisteredComposition, record);
      notify(record);
      return instanceId;
    },
    getInstance(id) {
      const record = instances.get(id);
      if (!record) return null;
      return snapshot(record);
    },
    listInstances() {
      return [...instances.keys()];
    },
    listDefinitions() {
      return [...definitions.values()].map(summarize);
    },
    isRegistered(compositionId) {
      return definitions.has(compositionId);
    },
    subscribe(id, listener) {
      const record = instances.get(id);
      if (!record) {
        return () => {
          // No-op — listener attached to a disposed instance.
        };
      }
      record.listeners.add(listener);
      return () => {
        record.listeners.delete(listener);
        // Mirror the disposal gate from `__detach`: when the last
        // listener and outlet both leave, schedule disposal via a
        // microtask so a StrictMode mount/unmount/mount dance or a
        // subscribe-then-resubscribe pattern doesn't tear the instance
        // down prematurely. Hydration holds also block disposal — a
        // hydrated instance survives outlet remounts until the
        // caller releases its hold.
        if (
          record.outletRefCount === 0 &&
          record.listeners.size === 0 &&
          record.hydrationHolds === 0
        ) {
          queueMicrotask(() => {
            const r = instances.get(id);
            if (!r) return;
            if (r.outletRefCount > 0) return;
            if (r.listeners.size > 0) return;
            if (r.hydrationHolds > 0) return;
            endInstance(id, "unsubscribed");
          });
        }
      };
    },
    dispatch(id, updater) {
      const record = instances.get(id);
      if (!record) return;
      if (record.status === "disposed") return;
      // `disposing` flips true at the start of `endInstance`, before
      // any hook fires. Dispatches from `onUnmount`/`onDispose` (or
      // any reactivity those hooks trigger) would otherwise mutate
      // state and notify listeners that are about to be cleared,
      // corrupting the terminal snapshot.
      if (record.disposing) return;
      record.store.setState(updater as any);
    },
    end(id, ctx) {
      endInstance(id, ctx?.reason ?? "unspecified");
    },
    registerMountAdapter(kind, adapter) {
      if (debug && mountAdapters.has(kind)) {
        // Last-writer-wins is documented behavior, but a duplicate
        // registration is almost always an accidental double-wire
        // (HMR re-running the bootstrap, two `createJourneyMountAdapter`
        // calls). Surface it in dev so the bug doesn't hide behind
        // silent replacement.
        console.warn(
          `[@modular-react/compositions] registerMountAdapter("${kind}") replaced an existing adapter. Verify this is intentional.`,
        );
      }
      mountAdapters.set(kind, adapter);
    },
    getMountAdapter(kind) {
      return mountAdapters.get(kind);
    },
  };

  const internals: CompositionRuntimeInternals = {
    __getRecord: (id) => instances.get(id),
    __getRegistered: (compositionId) => definitions.get(compositionId),
    __moduleMap: moduleMap,
    __deps: deps,
    __attach: (id) => {
      const record = instances.get(id);
      if (!record) return;
      record.outletRefCount += 1;
    },
    __detach: (id) => {
      const record = instances.get(id);
      if (!record) return;
      record.outletRefCount = Math.max(0, record.outletRefCount - 1);
      // Disposal gate: only end when no outlet AND no other listeners
      // AND no outstanding hydration holds. Deferred via microtask so
      // React 18/19 StrictMode mount/unmount/mount cycles don't tear
      // the instance down on first visit. A hydrated instance with a
      // live hold survives outlet remounts until the caller releases.
      if (
        record.outletRefCount === 0 &&
        record.listeners.size === 0 &&
        record.hydrationHolds === 0
      ) {
        queueMicrotask(() => {
          const r = instances.get(id);
          if (!r) return;
          if (r.outletRefCount > 0) return;
          if (r.listeners.size > 0) return;
          if (r.hydrationHolds > 0) return;
          endInstance(id, "unmounted");
        });
      }
    },
    __consumeRetry: (id, zone, cap) => {
      const record = instances.get(id);
      if (!record) return false;
      const current = record.zoneRetryCounts.get(zone) ?? 0;
      if (current >= cap) return false;
      record.zoneRetryCounts.set(zone, current + 1);
      return true;
    },
    __resetRetry: (id, zone) => {
      const record = instances.get(id);
      if (!record) return;
      record.zoneRetryCounts.delete(zone);
    },
    __fireOnError: (id, err, ctx) => fireOnError(id, err, ctx),
    __releaseHydrationHold: (id) => {
      const record = instances.get(id);
      if (!record) return;
      record.hydrationHolds = Math.max(0, record.hydrationHolds - 1);
      if (
        record.hydrationHolds === 0 &&
        record.outletRefCount === 0 &&
        record.listeners.size === 0
      ) {
        queueMicrotask(() => {
          const r = instances.get(id);
          if (!r) return;
          if (r.hydrationHolds > 0) return;
          if (r.outletRefCount > 0) return;
          if (r.listeners.size > 0) return;
          endInstance(id, "hydration-released");
        });
      }
    },
    __hydrate: (reg, blob) => {
      // Hydration is for attaching an out-of-band blob (SSR dump, debug
      // snapshot). Match the blob's definition id explicitly: callers
      // that bypass `hydrateComposition` (test code, future SSR
      // plumbing) would otherwise be able to install a record whose
      // `compositionId` disagrees with its definition.
      if (blob.definitionId !== reg.definition.id) {
        throw new CompositionHydrationError(
          `Hydrate blob is for "${blob.definitionId}" but the resolved definition is "${reg.definition.id}"`,
        );
      }
      // We require the blob's version to match the active definition —
      // there is no auto-migration runner because there is no
      // persistence layer to encounter old blobs in the wild.
      if (blob.version !== reg.definition.version) {
        throw new CompositionHydrationError(
          `Hydrate blob for "${reg.definition.id}" has version "${blob.version}", ` +
            `expected "${reg.definition.version}". Migrate the blob upstream before calling hydrateComposition.`,
        );
      }
      // `SerializedComposition.instanceId` is required by the type — the
      // SSR/dump producer always supplies it so cross-document references
      // round-trip. If a caller bypasses TypeScript and hands us a blob
      // with a missing id, surface a clean error rather than silently
      // minting a new one (which would lose the round-trip guarantee).
      const instanceId = blob.instanceId;
      if (!instanceId) {
        throw new CompositionHydrationError(
          `Hydrate blob for "${reg.definition.id}" is missing \`instanceId\`. Producers must include the id used at serialization time.`,
        );
      }
      if (instances.has(instanceId)) {
        throw new CompositionHydrationError(
          `Cannot hydrate "${reg.definition.id}" into instanceId "${instanceId}" — ` +
            `that id is already live.`,
        );
      }
      const record = createRecord<unknown>(
        reg,
        instanceId,
        blob.state,
        blob.startedAt,
        blob.updatedAt,
      );
      // Hold the instance for the caller. `hydrateComposition`
      // exposes a `release()` that decrements this — between hydrate
      // and release the instance survives outlet remounts. Without
      // this, the first outlet that mounts and unmounts (typical
      // navigation) would disposal-gate the seed away.
      record.hydrationHolds += 1;
      fireOnMount(reg, record);
      notify(record);
      return instanceId;
    },
  };

  INTERNALS.set(runtime, internals);
  return runtime;
}

// Re-export validation errors so callers can `catch` them by class.
export { CompositionHydrationError, UnknownCompositionError };

/**
 * Handle returned by {@link hydrateComposition}. The instance survives
 * outlet remounts (the usual hydrate → mount → navigate-away → come
 * back flow) until the caller invokes `release()`. After release the
 * instance becomes eligible for the normal disposal gate — when no
 * outlet is attached and no listener is subscribed, the microtask
 * disposes it.
 *
 * Multiple `release()` calls are idempotent. A hydrated instance the
 * caller drops the handle on without releasing leaks — by design,
 * since the caller asked for an out-of-band reference.
 */
export interface CompositionHydrationHandle {
  readonly instanceId: CompositionInstanceId;
  readonly release: () => void;
}

/**
 * Attach a previously-serialized composition into a runtime. Useful for
 * SSR (the server pre-computes the seed blob and ships it to the client)
 * and for debugging dumps. NOT a persistence mechanism — the compositions
 * package intentionally does not ship one. Callers that want durability
 * should keep their state outside the composition (URL params, an
 * application-level store) and feed it back through `initialState`.
 *
 *   - the blob's `instanceId` is preserved (so cross-document references
 *     in dumps round-trip),
 *   - the blob's `version` must match the active definition — there is
 *     no built-in migration runner.
 *
 * Returns a {@link CompositionHydrationHandle}. The hydrated instance
 * is "held" by the runtime — it does NOT auto-dispose when the first
 * outlet unmounts, which matches the typical hydrate-then-navigate
 * usage. Call `release()` when you no longer need the seed; the
 * instance is then eligible for normal refcount-based disposal (or
 * call `runtime.end(id)` for immediate teardown).
 */
export function hydrateComposition<TState>(
  runtime: CompositionRuntime,
  compositionId: string,
  blob: SerializedComposition<TState>,
): CompositionHydrationHandle {
  const internals = getInternals(runtime);
  const reg = internals.__getRegistered(compositionId);
  if (!reg) {
    throw new UnknownCompositionError(
      compositionId,
      runtime.listDefinitions().map((d) => d.id),
    );
  }
  if (blob.definitionId !== compositionId) {
    throw new CompositionHydrationError(
      `Hydrate blob is for "${blob.definitionId}" but caller asked for "${compositionId}"`,
    );
  }
  const instanceId = internals.__hydrate(reg, blob as SerializedComposition<unknown>);
  let released = false;
  return {
    instanceId,
    release: () => {
      if (released) return;
      released = true;
      internals.__releaseHydrationHold(instanceId);
    },
  };
}
