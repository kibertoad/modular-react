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
  /**
   * Active debounce timer for trailing-edge persistence writes (registration
   * option `saveDebounceMs`). Cleared on flush/disposal so a late timer
   * never fires after the instance is gone.
   */
  saveDebounceHandle: ReturnType<typeof setTimeout> | null;
  /** Per-zone consecutive retry counter, used by the outlet's retryLimit gate. */
  zoneRetryCounts: Map<string, number>;
  /** `lifecycle.onMount` has fired for this instance — gate so it only runs once. */
  mountFired: boolean;
  unmountFired: boolean;
  /** Subscription to the store's `subscribe` — kept so we can detach on disposal. */
  storeUnsubscribe: () => void;
  /**
   * Buffer for `runtime.dispatch` calls that arrive while `status` is
   * still `"loading"` (persistence load in flight). Flushed in order
   * once the instance transitions to `"active"`. Without this, hosts
   * that fire-and-forget a `dispatch` right after `start()` silently
   * lose the write.
   */
  pendingDispatches: Array<unknown>;
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
  /**
   * Direct-hydration escape hatch used by `hydrateComposition`. Bypasses
   * `start()` (and therefore `keyFor` / `initialState`) so out-of-band
   * blobs can be attached without crashing definitions that require
   * `TInput` or persist under a key the caller hasn't computed.
   */
  readonly __hydrate: (
    reg: RegisteredComposition,
    blob: SerializedComposition<unknown>,
  ) => CompositionInstanceId;
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

  const definitions = new Map<string, RegisteredComposition>();
  for (const reg of registered) {
    if (definitions.has(reg.definition.id)) {
      // Surface duplicate registrations even when bypassing the plugin —
      // the alternative (silent last-wins) makes test setups confusing.
      throw new Error(
        `[@modular-react/compositions] Composition "${reg.definition.id}" is registered more than once. ` +
          `Pass a single RegisteredComposition per id to createCompositionRuntime().`,
      );
    }
    definitions.set(reg.definition.id, reg);
  }

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
  // Persistence save pipeline — lifted from journeys' runtime (§10.2) with
  // debounce + successor-aware remove protection.
  // -------------------------------------------------------------------------

  function schedulePersist<TState>(
    record: CompositionInstanceRecord<TState>,
    persistence: CompositionPersistence<TState>,
    debounceMs: number,
  ) {
    if (debounceMs > 0) {
      // Trailing-edge debounce: cancel any pending timer, set a new one.
      // The timer captures the freshest serialize() at fire-time, so the
      // burst of mutations collapses to one save with the final state.
      if (record.saveDebounceHandle !== null) {
        clearTimeout(record.saveDebounceHandle);
      }
      record.saveDebounceHandle = setTimeout(() => {
        record.saveDebounceHandle = null;
        const blob = serialize(record);
        if (record.saveInFlight) {
          record.pendingSave = blob;
          return;
        }
        void runSave(record, persistence, blob);
      }, debounceMs);
      return;
    }
    const blob = serialize(record);
    if (record.saveInFlight) {
      record.pendingSave = blob;
      return;
    }
    void runSave(record, persistence, blob);
  }

  /**
   * Cancel any in-flight debounce timer so a trailing-edge save never
   * fires after the instance is gone. Disposal always removes the blob
   * anyway, so the pending state is intentionally dropped — flushing it
   * to disk only to immediately remove would be wasted work.
   */
  function cancelDebouncedSave<TState>(
    record: CompositionInstanceRecord<TState>,
    // `persistence` is unused but kept in the signature for symmetry with
    // `removePersisted` / `schedulePersist`.
    _persistence: CompositionPersistence<TState>,
  ) {
    if (record.saveDebounceHandle === null) return;
    clearTimeout(record.saveDebounceHandle);
    record.saveDebounceHandle = null;
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
        if (record.persistenceKey) {
          // Successor-aware: if another instance has claimed the same
          // persistence key since disposal started, suppress the remove
          // — otherwise we'd wipe the new instance's blob.
          const fullKey = indexKey(record.compositionId, record.persistenceKey);
          if (!keyIndex.has(fullKey)) {
            fireAndForgetRemove(persistence, record.persistenceKey);
          }
        }
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
    if (record.saveDebounceHandle !== null) {
      clearTimeout(record.saveDebounceHandle);
      record.saveDebounceHandle = null;
    }
    const key = record.persistenceKey;
    const fullKey = indexKey(record.compositionId, key);
    // Only release the index slot if it still points to THIS record.
    // A successor that already claimed the slot via a parallel `start()`
    // must keep it.
    if (keyIndex.get(fullKey) === record.id) {
      keyIndex.delete(fullKey);
    } else {
      // Successor owns the slot; do not remove its data.
      return;
    }
    if (record.saveInFlight) {
      record.pendingRemove = true;
      return;
    }
    // Re-check the slot one more time: a synchronous successor could
    // appear between `keyIndex.delete` above and this call. That window
    // is single-threaded JS so it can't happen here, but the symmetry
    // with the deferred branch above is clearer this way.
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
  // Hydration / migration helpers
  // -------------------------------------------------------------------------

  /**
   * Walk a freshly-loaded blob through the definition-level + registration-
   * level migration hooks, then verify the result's version matches the
   * active definition. Returns the (possibly migrated) blob on success,
   * or throws `CompositionHydrationError` on a version mismatch we
   * can't reconcile.
   */
  function migrateBlob<TState>(
    reg: RegisteredComposition,
    blob: SerializedComposition<unknown>,
  ): SerializedComposition<TState> {
    let migrated: SerializedComposition<unknown> = blob;
    let ranAny = false;

    const defHydrate = reg.definition.onHydrate as
      | ((b: SerializedComposition<unknown>) => SerializedComposition<unknown>)
      | undefined;
    if (defHydrate) {
      ranAny = true;
      try {
        migrated = defHydrate(migrated);
      } catch (err) {
        throw new CompositionHydrationError(
          `onHydrate (definition) threw while migrating blob for "${reg.definition.id}" ` +
            `(blob=${blob.version} def=${reg.definition.version}).`,
          { cause: err },
        );
      }
    }

    const regHydrate = reg.options?.onHydrate as
      | ((b: SerializedComposition<unknown>) => SerializedComposition<unknown>)
      | undefined;
    if (regHydrate) {
      ranAny = true;
      try {
        migrated = regHydrate(migrated);
      } catch (err) {
        throw new CompositionHydrationError(
          `onHydrate (registration) threw while migrating blob for "${reg.definition.id}" ` +
            `(blob=${blob.version} def=${reg.definition.version}).`,
          { cause: err },
        );
      }
    }

    if (migrated.version !== reg.definition.version) {
      if (ranAny) {
        throw new CompositionHydrationError(
          `onHydrate for "${reg.definition.id}" returned blob version ${migrated.version}, ` +
            `expected ${reg.definition.version}.`,
        );
      }
      throw new CompositionHydrationError(
        `Hydrate version mismatch for "${reg.definition.id}": blob=${blob.version} ` +
          `def=${reg.definition.version}. Provide onHydrate to migrate.`,
      );
    }

    return migrated as SerializedComposition<TState>;
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
    const debounceMs =
      typeof reg.options?.saveDebounceMs === "number" && reg.options.saveDebounceMs > 0
        ? reg.options.saveDebounceMs
        : 0;
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
      saveDebounceHandle: null,
      zoneRetryCounts: new Map(),
      mountFired: false,
      unmountFired: false,
      storeUnsubscribe: () => {
        // populated below
      },
      pendingDispatches: [],
    };
    // Wire store → record. setState pushes to record.state, bumps revision,
    // notifies subscribers, schedules persistence. Single source of truth.
    record.storeUnsubscribe = store.subscribe((next) => {
      record.state = next;
      // Only stamp `updatedAt` once the instance is active — during the
      // initial persistence-load splice we briefly write loaded state via
      // the store, and the load path itself is responsible for setting
      // `updatedAt` to the blob's value.
      if (record.status === "active") {
        record.updatedAt = nowIso();
      }
      notify(record);
      const persistence = reg.options?.persistence;
      if (persistence && record.status === "active") {
        schedulePersist(record, persistence, debounceMs);
      }
    });
    instances.set(instanceId, record);
    return record;
  }

  function flushPendingDispatches<TState>(record: CompositionInstanceRecord<TState>) {
    if (record.pendingDispatches.length === 0) return;
    const queue = record.pendingDispatches;
    record.pendingDispatches = [];
    for (const updater of queue) {
      try {
        record.store.setState(updater as never);
      } catch (err) {
        if (debug) {
          console.error(
            "[@modular-react/compositions] queued dispatch threw after load",
            err,
          );
        }
      }
    }
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
            try {
              const migrated = migrateBlob<TState>(
                reg as unknown as RegisteredComposition,
                blob as SerializedComposition<unknown>,
              );
              // Order matters: assign timestamps BEFORE replacing state.
              // The store's subscriber checks `status` and skips
              // `updatedAt` rewrites while loading — so once `setState`
              // fires, `record.updatedAt` is already the blob's value.
              record.startedAt = migrated.startedAt;
              record.updatedAt = migrated.updatedAt;
              record.state = migrated.state;
              record.store.setState(migrated.state, true);
            } catch (err) {
              if (debug) {
                console.error(
                  `[@modular-react/compositions] hydrate failed for "${compositionId}"; falling back to initialState`,
                  err,
                );
              }
              fireOnError(record.id, err, { zone: "", phase: "lifecycle" });
              // Drop the unmigrateable blob so the next start() doesn't
              // re-encounter it.
              fireAndForgetRemove(
                persistence as CompositionPersistence<TState>,
                userKey,
              );
            }
          }
          record.status = "active";
          notify(record);
          fireOnMount(reg as RegisteredComposition, record);
          flushPendingDispatches(record);
          // Persist immediately on cold-start so a refresh before any state
          // change still finds a blob keyed under userKey.
          schedulePersist(
            record,
            persistence as CompositionPersistence<TState>,
            // Cold-start save bypasses debounce — durability for fresh
            // instances matters more than write-amplification at idle.
            0,
          );
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
          flushPendingDispatches(record);
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
    // Cancel any pending debounced save — disposal removes the blob
    // synchronously below, so trailing-edge state is intentionally dropped.
    const persistence = reg?.options?.persistence;
    if (persistence) cancelDebouncedSave(record, persistence);
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
      if (!record) return;
      if (record.status === "disposed") return;
      if (record.status === "loading") {
        // Buffer until the persistence load resolves and status flips to
        // "active" — then flushPendingDispatches replays in arrival order.
        record.pendingDispatches.push(updater);
        return;
      }
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
    __hydrate: (reg, blob) => {
      // Migrate first so a version mismatch raises before we mint a
      // record we'd have to roll back.
      const migrated = migrateBlob<unknown>(reg, blob);
      const instanceId = migrated.instanceId ?? mintInstanceId();
      // Refuse to clobber a live record under the same id — the caller
      // (or a parallel hydrate) is racing with itself.
      if (instances.has(instanceId)) {
        throw new CompositionHydrationError(
          `Cannot hydrate "${reg.definition.id}" into instanceId "${instanceId}" — ` +
            `that id is already live.`,
        );
      }
      const record = createRecord<unknown>(
        reg,
        instanceId,
        migrated.state,
        // No persistenceKey: hydrated blobs are caller-owned; the runtime
        // does not register them with `keyIndex` so persisted-driven
        // start() calls remain independent.
        null,
        migrated.startedAt,
        migrated.updatedAt,
        "active",
      );
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
 * Hydrate a previously-serialized composition into an active instance.
 * Mirrors `JourneyRuntime.hydrate` — used by shells that load blobs out
 * of band (e.g. from a server-side dump) and want to attach them to a
 * runtime without going through `start()`.
 *
 * Unlike the persistence-driven load inside `start()`, this path:
 *   - preserves the blob's `instanceId` so out-of-band references
 *     (analytics, debug dumps) round-trip,
 *   - skips `keyFor` / persistence probing entirely (the blob was
 *     produced out-of-band, the adapter wasn't necessarily consulted),
 *   - runs `onHydrate` migrations so version-bumped blobs migrate the
 *     same way as the load path.
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
  return internals.__hydrate(reg, blob as SerializedComposition<unknown>);
}
