import { createStore, isDevEnv } from "@modular-react/core";
import type { ModuleDescriptor, Store } from "@modular-react/core";
import type {
  AnyCompositionDefinition,
  CompositionDefinitionSummary,
  CompositionHandleRef,
  CompositionInstance,
  CompositionInstanceId,
  CompositionPersistence,
  CompositionRegisterOptions,
  CompositionRuntime,
  CompositionStatus,
  RegisteredComposition,
  SerializedComposition,
} from "./types.js";
import { CompositionHydrationError, UnknownCompositionError } from "./validation.js";

/**
 * Per-instance internal record. Trimmed analog of journeys'
 * `InstanceRecord` — no step history, no rollback, no parent/child link.
 * Compositions are pure state projections; resume = rerun selectors.
 */
export interface CompositionInstanceRecord<TState = unknown> {
  id: CompositionInstanceId;
  compositionId: string;
  status: CompositionStatus;
  state: TState;
  /** Underlying reactive store. setState merges or replaces just like zustand. */
  store: Store<TState>;
  persistenceKey: string | null;
  startedAt: string;
  updatedAt: string;
  /** Monotonic counter — bumped on observable changes, used to memoize the public snapshot. */
  revision: number;
  cachedSnapshot: { revision: number; instance: CompositionInstance } | null;
  /** Outlet attachment count; disposal trigger when this drops to 0. */
  outletRefCount: number;
  listeners: Set<() => void>;
  pendingSave: SerializedComposition<TState> | null;
  saveInFlight: boolean;
  pendingRemove: boolean;
  /** Per-zone consecutive retry counter, used by the outlet's retryLimit gate. */
  zoneRetryCounts: Map<string, number>;
  /** `lifecycle.onMount` has fired for this instance — gate so it only runs once. */
  mountFired: boolean;
  unmountFired: boolean;
  /** Subscription to the store's `subscribe` — kept so we can detach on disposal. */
  storeUnsubscribe: () => void;
}

export interface CompositionRuntimeOptions {
  readonly debug?: boolean;
  readonly modules?: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  /**
   * Shared dependency snapshot threaded to lifecycle hooks and zone
   * selectors. Captured by the plugin at resolve time from the registry's
   * resolved deps; the runtime treats it as opaque.
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
    ctx: { zone: string; phase: "select" | "render" | "lifecycle" },
  ) => void;
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
 */
export function createCompositionRuntime(
  registered: readonly RegisteredComposition[],
  options: CompositionRuntimeOptions = {},
): CompositionRuntime {
  const debug = options.debug ?? isDevEnv();
  const moduleMap = options.modules ?? {};
  const deps = options.deps ?? {};

  const definitions = new Map<string, RegisteredComposition>();
  for (const reg of registered) definitions.set(reg.definition.id, reg);

  const instances = new Map<CompositionInstanceId, CompositionInstanceRecord>();
  /**
   * `keyIndex` is namespaced internally by `compositionId` so two
   * compositions with the same `keyFor` string cannot collide. Mirrors
   * the journey runtime's pattern.
   */
  const keyIndex = new Map<string, CompositionInstanceId>();

  function indexKey(compositionId: string, userKey: string): string {
    return `${compositionId}\x1f${userKey}`;
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  function mintInstanceId(): CompositionInstanceId {
    try {
      const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
      if (cryptoObj?.randomUUID) return `ci_${cryptoObj.randomUUID()}`;
    } catch {
      // Fall through to the Math.random fallback.
    }
    const rand = Math.random().toString(36).slice(2, 10);
    return `ci_${Date.now().toString(36)}_${rand}`;
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
    for (const listener of record.listeners) {
      try {
        listener();
      } catch (err) {
        if (debug) console.error("[@modular-react/compositions] listener threw", err);
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

  // -------------------------------------------------------------------------
  // Persistence save pipeline — lifted from journeys' runtime (§10.2)
  // -------------------------------------------------------------------------

  function schedulePersist<TState>(
    record: CompositionInstanceRecord<TState>,
    persistence: CompositionPersistence<TState>,
  ) {
    const blob = serialize(record);
    if (record.saveInFlight) {
      record.pendingSave = blob;
      return;
    }
    void runSave(record, persistence, blob);
  }

  async function runSave<TState>(
    record: CompositionInstanceRecord<TState>,
    persistence: CompositionPersistence<TState>,
    blob: SerializedComposition<TState>,
  ) {
    record.saveInFlight = true;
    try {
      if (!record.persistenceKey) return;
      await persistence.save(record.persistenceKey, blob);
    } catch (err) {
      if (debug) {
        console.error(
          `[@modular-react/compositions] Failed to persist "${record.compositionId}" instance ${record.id}`,
          err,
        );
      }
    } finally {
      record.saveInFlight = false;
      if (record.pendingRemove) {
        record.pendingRemove = false;
        record.pendingSave = null;
        if (record.persistenceKey) fireAndForgetRemove(persistence, record.persistenceKey);
      } else if (record.pendingSave) {
        const next = record.pendingSave;
        record.pendingSave = null;
        void runSave(record, persistence, next);
      }
    }
  }

  function removePersisted<TState>(
    record: CompositionInstanceRecord<TState>,
    persistence: CompositionPersistence<TState>,
  ) {
    if (!record.persistenceKey) return;
    record.pendingSave = null;
    const key = record.persistenceKey;
    keyIndex.delete(indexKey(record.compositionId, key));
    if (record.saveInFlight) {
      record.pendingRemove = true;
      return;
    }
    fireAndForgetRemove(persistence, key);
  }

  function fireAndForgetRemove<TState>(
    persistence: CompositionPersistence<TState>,
    key: string,
  ) {
    try {
      const maybe = persistence.remove(key);
      if (maybe && typeof (maybe as Promise<void>).catch === "function") {
        (maybe as Promise<void>).catch((err) => {
          if (debug) {
            console.error("[@modular-react/compositions] persistence.remove rejected", err);
          }
        });
      }
    } catch (err) {
      if (debug) console.error("[@modular-react/compositions] persistence.remove threw", err);
    }
  }

  function serialize<TState>(
    record: CompositionInstanceRecord<TState>,
  ): SerializedComposition<TState> {
    return {
      definitionId: record.compositionId,
      version: definitions.get(record.compositionId)!.definition.version,
      instanceId: record.id,
      status: "active",
      state: record.state,
      startedAt: record.startedAt,
      updatedAt: record.updatedAt,
    };
  }

  function fireOnError(
    id: CompositionInstanceId,
    err: unknown,
    ctx: { zone: string; phase: "select" | "render" | "lifecycle" },
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

  function fireOnMount<TState>(reg: RegisteredComposition, record: CompositionInstanceRecord<TState>) {
    if (record.mountFired) return;
    record.mountFired = true;
    try {
      (reg.definition.lifecycle?.onMount as ((s: TState, d: Readonly<Record<string, unknown>>) => void) | undefined)?.(
        record.state,
        deps,
      );
    } catch (err) {
      if (debug) console.error("[@modular-react/compositions] lifecycle.onMount threw", err);
      fireOnError(record.id, err, { zone: "", phase: "lifecycle" });
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
      (reg.definition.lifecycle?.onUnmount as ((s: TState, d: Readonly<Record<string, unknown>>) => void) | undefined)?.(
        record.state,
        deps,
      );
    } catch (err) {
      if (debug) console.error("[@modular-react/compositions] lifecycle.onUnmount threw", err);
      fireOnError(record.id, err, { zone: "", phase: "lifecycle" });
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
  // Instance creation / hydration
  // -------------------------------------------------------------------------

  function createRecord<TState>(
    reg: RegisteredComposition,
    instanceId: CompositionInstanceId,
    state: TState,
    persistenceKey: string | null,
    startedAt: string,
    updatedAt: string,
    status: CompositionStatus = "active",
  ): CompositionInstanceRecord<TState> {
    const store = createStore<TState>(state);
    const record: CompositionInstanceRecord<TState> = {
      id: instanceId,
      compositionId: reg.definition.id,
      status,
      state,
      store,
      persistenceKey,
      startedAt,
      updatedAt,
      revision: 0,
      cachedSnapshot: null,
      outletRefCount: 0,
      listeners: new Set(),
      pendingSave: null,
      saveInFlight: false,
      pendingRemove: false,
      zoneRetryCounts: new Map(),
      mountFired: false,
      unmountFired: false,
      storeUnsubscribe: () => {
        // populated below
      },
    };
    // Wire store → record. setState pushes to record.state, bumps revision,
    // notifies subscribers, schedules persistence. Single source of truth.
    record.storeUnsubscribe = store.subscribe((next) => {
      record.state = next;
      record.updatedAt = nowIso();
      notify(record);
      const persistence = reg.options?.persistence;
      if (persistence && record.status === "active") {
        schedulePersist(record, persistence);
      }
    });
    instances.set(instanceId, record);
    return record;
  }

  function startCore<TState, TInput>(
    reg: RegisteredComposition<TState, TInput>,
    input: TInput,
  ): CompositionInstanceId {
    const persistence = reg.options?.persistence;
    const compositionId = reg.definition.id;

    if (persistence) {
      const userKey = persistence.keyFor({ compositionId, input });
      const fullKey = indexKey(compositionId, userKey);
      const existing = keyIndex.get(fullKey);
      if (existing && instances.has(existing)) {
        return existing;
      }
      const instanceId = mintInstanceId();
      keyIndex.set(fullKey, instanceId);

      const initial = reg.definition.initialState(input);
      const record = createRecord<TState>(
        reg as RegisteredComposition<unknown, unknown> as RegisteredComposition,
        instanceId,
        initial as TState,
        userKey,
        nowIso(),
        nowIso(),
        "loading",
      );
      // Probe persistence asynchronously. On hit, replace state with the
      // loaded blob; on miss, keep the freshly minted initial state. Either
      // way, transition loading → active and fire onMount.
      void Promise.resolve(persistence.load(userKey)).then(
        (blob) => {
          if (!instances.has(instanceId)) return; // disposed mid-flight
          if (blob && blob.definitionId === compositionId) {
            record.state = blob.state as TState;
            record.store.setState(blob.state as TState, true);
            record.startedAt = blob.startedAt;
            record.updatedAt = blob.updatedAt;
          }
          record.status = "active";
          notify(record);
          fireOnMount(reg as RegisteredComposition, record);
          // Persist immediately on cold-start so a refresh before any state
          // change still finds a blob keyed under userKey.
          schedulePersist(record, persistence as CompositionPersistence<TState>);
        },
        (err) => {
          if (!instances.has(instanceId)) return;
          if (debug) {
            console.error(
              `[@modular-react/compositions] persistence.load threw for "${compositionId}"`,
              err,
            );
          }
          record.status = "active";
          notify(record);
          fireOnMount(reg as RegisteredComposition, record);
        },
      );
      return instanceId;
    }

    // No persistence — mint a fresh active instance synchronously.
    const instanceId = mintInstanceId();
    const initial = reg.definition.initialState(input);
    const record = createRecord<TState>(
      reg as RegisteredComposition,
      instanceId,
      initial as TState,
      null,
      nowIso(),
      nowIso(),
      "active",
    );
    fireOnMount(reg as RegisteredComposition, record);
    notify(record);
    return instanceId;
  }

  function endInstance(id: CompositionInstanceId, reason: unknown): void {
    const record = instances.get(id);
    if (!record) return;
    if (record.status === "disposed") return;
    const reg = definitions.get(record.compositionId);
    record.status = "disposed";
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
    record.storeUnsubscribe();
    const persistence = reg?.options?.persistence;
    if (persistence) removePersisted(record, persistence);
    notify(record);
    record.listeners.clear();
    instances.delete(id);
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
      return startCore(reg, input);
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
      };
    },
    dispatch(id, updater) {
      const record = instances.get(id);
      if (!record || record.status !== "active") return;
      record.store.setState(updater as any);
    },
    end(id, ctx) {
      endInstance(id, ctx?.reason ?? "unspecified");
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
      // Disposal gate: only end when no outlet AND no other listeners.
      // Deferred via microtask so React 18/19 StrictMode mount/unmount/mount
      // cycles don't tear the instance down on first visit.
      if (record.outletRefCount === 0 && record.listeners.size === 0) {
        queueMicrotask(() => {
          const r = instances.get(id);
          if (!r) return;
          if (r.outletRefCount > 0) return;
          if (r.listeners.size > 0) return;
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
  };

  INTERNALS.set(runtime, internals);
  return runtime;
}

// Re-export validation errors so callers can `catch` them by class.
export { CompositionHydrationError, UnknownCompositionError };

/**
 * Hydrate a previously-serialized composition into an active instance.
 * Mirrors `JourneyRuntime.hydrate` — used by shells that load blobs out
 * of band (e.g. from a server-side dump) and want to attach them to a
 * runtime without going through `start()`.
 */
export function hydrateComposition<TState>(
  runtime: CompositionRuntime,
  compositionId: string,
  blob: SerializedComposition<TState>,
): CompositionInstanceId {
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
  // Re-enter through the normal start path with no persistence — once we
  // have the record, splice in the blob's state.
  const id = runtime.start(compositionId, undefined as never);
  const record = internals.__getRecord(id) as CompositionInstanceRecord<TState> | undefined;
  if (record) {
    record.state = blob.state;
    record.store.setState(blob.state, true);
    record.startedAt = blob.startedAt;
    record.updatedAt = blob.updatedAt;
  }
  return id;
}
