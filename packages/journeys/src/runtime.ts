import type { ModuleDescriptor } from "@modular-react/core";
import type {
  AnyJourneyDefinition,
  InstanceId,
  JourneyDefinition,
  JourneyDefinitionSummary,
  JourneyInstance,
  JourneyPersistence,
  JourneyRuntime,
  JourneyStatus,
  JourneyStep,
  ModuleTypeMap,
  RegisteredJourney,
  SerializedJourney,
  StepSpec,
  TransitionEvent,
  TransitionResult,
} from "./types.js";

export interface InstanceRecord<TState = unknown> {
  id: InstanceId;
  journeyId: string;
  status: JourneyStatus;
  step: JourneyStep | null;
  history: JourneyStep[];
  /** Snapshots captured per history entry — indexed alongside history. */
  rollbackSnapshots: (TState | undefined)[];
  /** True when any entry in `rollbackSnapshots` holds a real snapshot. */
  hasRollbackSnapshot: boolean;
  state: TState;
  terminalPayload: unknown;
  startedAt: string;
  updatedAt: string;
  /** Monotonically increasing token used to invalidate stale exit/goBack calls. */
  stepToken: number;
  /** Persistence key computed on start. Stable for the instance's lifetime. */
  persistenceKey: string | null;
  terminalFired: boolean;
  listeners: Set<() => void>;
  pendingSave: SerializedJourney<TState> | null;
  saveInFlight: boolean;
  /**
   * Monotonically incrementing revision bumped when an observable field
   * changes (status/step/state/history/terminalPayload). Used to memoize
   * the public `JourneyInstance` snapshot so that `getInstance(id)` returns
   * a stable reference between changes — a requirement of
   * `useSyncExternalStore`.
   */
  revision: number;
  /** Cached snapshot keyed by `revision`; rebuilt on the next read if stale. */
  cachedSnapshot: { revision: number; instance: JourneyInstance } | null;
  /** Cached exit/goBack closures keyed by stepToken. */
  cachedCallbacks: {
    stepToken: number;
    exit: (name: string, output?: unknown) => void;
    goBack: (() => void) | undefined;
  } | null;
}

export interface JourneyRuntimeOptions {
  readonly debug?: boolean;
  /**
   * Module descriptors keyed by id — the runtime needs them to resolve
   * `allowBack` mode ('preserve-state' | 'rollback' | false) at goBack time.
   * When omitted, `goBack` falls back to 'preserve-state' for any journey
   * transition that opts in via `allowBack: true`.
   */
  readonly modules?: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
}

const ASYNC_LOAD_PENDING = Symbol("asyncLoadPending");
type AsyncLoadPending = typeof ASYNC_LOAD_PENDING;

/**
 * Create a journey runtime bound to a set of registered journeys. The
 * registry integration assembles this once at resolve time; the runtime is
 * owned by the manifest and exposed as `manifest.journeys`.
 */
export function createJourneyRuntime(
  registered: readonly RegisteredJourney[],
  options: JourneyRuntimeOptions = {},
): JourneyRuntime {
  const debug = options.debug ?? defaultDebug();
  const moduleMap = options.modules ?? {};
  const definitions = new Map<string, RegisteredJourney>();
  for (const entry of registered) definitions.set(entry.definition.id, entry);
  const instances = new Map<InstanceId, InstanceRecord>();
  const keyIndex = new Map<string, InstanceId>();

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function notify(record: InstanceRecord) {
    record.revision += 1;
    record.cachedSnapshot = null;
    for (const listener of record.listeners) {
      try {
        listener();
      } catch (err) {
        if (debug) console.error("[@modular-react/journeys] listener threw", err);
      }
    }
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  function mintInstanceId(): InstanceId {
    try {
      const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
      if (cryptoObj?.randomUUID) return `ji_${cryptoObj.randomUUID()}`;
    } catch {
      // Fall through to the Math.random fallback.
    }
    const rand = Math.random().toString(36).slice(2, 10);
    return `ji_${Date.now().toString(36)}_${rand}`;
  }

  function summarize(reg: RegisteredJourney): JourneyDefinitionSummary {
    return {
      id: reg.definition.id,
      version: reg.definition.version,
      meta: reg.definition.meta,
    };
  }

  function assertKnown(journeyId: string): RegisteredJourney {
    const reg = definitions.get(journeyId);
    if (!reg) {
      throw new Error(
        `[@modular-react/journeys] Unknown journey id "${journeyId}". Registered: ${[...definitions.keys()].join(", ") || "(none)"}`,
      );
    }
    return reg;
  }

  function stepFromSpec(spec: StepSpec<ModuleTypeMap>): JourneyStep {
    const s = spec as { module: string; entry: string; input: unknown };
    return { moduleId: s.module, entry: s.entry, input: s.input };
  }

  function entryAllowBackMode(
    step: JourneyStep | null,
  ): "preserve-state" | "rollback" | false {
    if (!step) return false;
    const mod = moduleMap[step.moduleId];
    const entry = mod?.entryPoints?.[step.entry];
    const raw = entry?.allowBack;
    if (raw === "rollback" || raw === "preserve-state") return raw;
    return false;
  }

  function journeyAllowsBack(
    definition: AnyJourneyDefinition,
    step: JourneyStep | null,
  ): boolean {
    if (!step) return false;
    const perModule = (definition.transitions as Record<string, any> | undefined)?.[step.moduleId];
    const perEntry = perModule?.[step.entry];
    return perEntry?.allowBack === true;
  }

  function computeKey(reg: RegisteredJourney, input: unknown): string | null {
    const persistence = reg.options?.persistence;
    if (!persistence) return null;
    return persistence.keyFor({ journeyId: reg.definition.id, input });
  }

  function cloneSnapshot<TState>(state: TState): TState {
    if (state === null || typeof state !== "object") return state;
    if (Array.isArray(state)) return [...state] as unknown as TState;
    return { ...(state as object) } as TState;
  }

  function trimHistory(record: InstanceRecord, reg: RegisteredJourney) {
    const cap = reg.options?.maxHistory;
    if (cap === undefined || cap < 0) return;
    while (record.history.length > cap) {
      record.history.shift();
      record.rollbackSnapshots.shift();
    }
    record.hasRollbackSnapshot = record.rollbackSnapshots.some((s) => s !== undefined);
  }

  // ---------------------------------------------------------------------------
  // Persistence save pipeline (§10.2)
  // ---------------------------------------------------------------------------

  function schedulePersist<TState>(
    record: InstanceRecord<TState>,
    persistence: JourneyPersistence<TState>,
  ) {
    const blob = serialize(record);
    if (record.saveInFlight) {
      record.pendingSave = blob;
      return;
    }
    void runSave(record, persistence, blob);
  }

  async function runSave<TState>(
    record: InstanceRecord<TState>,
    persistence: JourneyPersistence<TState>,
    blob: SerializedJourney<TState>,
  ) {
    record.saveInFlight = true;
    try {
      if (!record.persistenceKey) return;
      await persistence.save(record.persistenceKey, blob);
    } catch (err) {
      if (debug) {
        console.error(
          `[@modular-react/journeys] Failed to persist "${record.journeyId}" instance ${record.id}`,
          err,
        );
      }
    } finally {
      record.saveInFlight = false;
      if (record.pendingSave) {
        const next = record.pendingSave;
        record.pendingSave = null;
        void runSave(record, persistence, next);
      }
    }
  }

  function removePersisted<TState>(
    record: InstanceRecord<TState>,
    persistence: JourneyPersistence<TState>,
  ) {
    if (!record.persistenceKey) return;
    record.pendingSave = null;
    const key = record.persistenceKey;
    keyIndex.delete(key);
    try {
      const maybe = persistence.remove(key);
      if (maybe && typeof (maybe as Promise<void>).catch === "function") {
        (maybe as Promise<void>).catch((err) => {
          if (debug) console.error("[@modular-react/journeys] persistence.remove rejected", err);
        });
      }
    } catch (err) {
      if (debug) console.error("[@modular-react/journeys] persistence.remove threw", err);
    }
  }

  function serialize<TState>(record: InstanceRecord<TState>): SerializedJourney<TState> {
    return {
      definitionId: record.journeyId,
      version: definitions.get(record.journeyId)!.definition.version,
      instanceId: record.id,
      status:
        record.status === "loading"
          ? "active"
          : (record.status as SerializedJourney["status"]),
      step: record.step,
      history: [...record.history],
      // Preserve alignment with `history` — map `undefined` to `null` so the
      // shape survives JSON. Only emit when we actually hold snapshots.
      rollbackSnapshots: record.hasRollbackSnapshot
        ? record.rollbackSnapshots.map((s) => (s === undefined ? null : s))
        : undefined,
      terminalPayload:
        record.status === "completed" || record.status === "aborted"
          ? record.terminalPayload
          : undefined,
      state: record.state,
      startedAt: record.startedAt,
      updatedAt: record.updatedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Hook firing
  // ---------------------------------------------------------------------------

  function fireOnTransition(
    reg: RegisteredJourney,
    record: InstanceRecord,
    from: JourneyStep | null,
    to: JourneyStep | null,
    exit: string | null,
  ) {
    const ev: TransitionEvent = {
      journeyId: record.journeyId,
      instanceId: record.id,
      from,
      to,
      exit,
      state: record.state,
      history: record.history,
    };
    try {
      reg.definition.onTransition?.(ev);
    } catch (err) {
      if (debug) console.error("[@modular-react/journeys] onTransition (definition) threw", err);
    }
    try {
      reg.options?.onTransition?.(ev);
    } catch (err) {
      if (debug) console.error("[@modular-react/journeys] onTransition (registration) threw", err);
    }
  }

  function fireOnComplete(reg: RegisteredJourney, record: InstanceRecord, result: unknown) {
    if (record.terminalFired) return;
    record.terminalFired = true;
    try {
      reg.definition.onComplete?.(
        {
          journeyId: record.journeyId,
          instanceId: record.id,
          state: record.state,
          history: record.history,
        },
        result,
      );
    } catch (err) {
      if (debug) console.error("[@modular-react/journeys] onComplete threw", err);
    }
  }

  function fireOnAbort(reg: RegisteredJourney, record: InstanceRecord, reason: unknown) {
    if (record.terminalFired) return;
    record.terminalFired = true;
    try {
      reg.definition.onAbort?.(
        {
          journeyId: record.journeyId,
          instanceId: record.id,
          state: record.state,
          history: record.history,
        },
        reason,
      );
    } catch (err) {
      if (debug) console.error("[@modular-react/journeys] onAbort threw", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Transition application
  // ---------------------------------------------------------------------------

  function applyTransition(
    record: InstanceRecord,
    reg: RegisteredJourney,
    result: TransitionResult<ModuleTypeMap, unknown>,
    exitName: string | null,
  ) {
    const previousStep = record.step;
    // Snapshot the *pre-transition* state (before any state update) — this
    // is what goBack should restore into the step we're about to leave.
    // "state" in result signals an explicit write, even if the new value is
    // `undefined` (legitimate for state types that allow it).
    const preState = record.state;
    if ("state" in result) {
      record.state = result.state as typeof record.state;
    }

    if ("next" in result) {
      const nextStep = stepFromSpec(result.next);
      if (previousStep) {
        record.history.push(previousStep);
        // Clone the pre-state snapshot only when the step we're entering
        // opts in to rollback — avoids unnecessary work for preserve-state
        // / no-back entries. Shallow clone keeps the snapshot stable against
        // accidental top-level mutation.
        const nextMode = entryAllowBackModeForStep(nextStep);
        if (nextMode === "rollback") {
          record.rollbackSnapshots.push(cloneSnapshot(preState));
          record.hasRollbackSnapshot = true;
        } else {
          record.rollbackSnapshots.push(undefined);
        }
      }
      record.step = nextStep;
      record.status = "active";
      record.stepToken += 1;
      record.updatedAt = nowIso();
      record.cachedCallbacks = null;
      trimHistory(record, reg);
      fireOnTransition(reg, record, previousStep, nextStep, exitName);
    } else if ("complete" in result) {
      if (previousStep) {
        record.history.push(previousStep);
        record.rollbackSnapshots.push(undefined);
      }
      record.step = null;
      record.status = "completed";
      record.terminalPayload = result.complete;
      record.stepToken += 1;
      record.updatedAt = nowIso();
      record.cachedCallbacks = null;
      trimHistory(record, reg);
      fireOnTransition(reg, record, previousStep, null, exitName);
      fireOnComplete(reg, record, result.complete);
    } else if ("abort" in result) {
      if (previousStep) {
        record.history.push(previousStep);
        record.rollbackSnapshots.push(undefined);
      }
      record.step = null;
      record.status = "aborted";
      record.terminalPayload = result.abort;
      record.stepToken += 1;
      record.updatedAt = nowIso();
      record.cachedCallbacks = null;
      trimHistory(record, reg);
      fireOnTransition(reg, record, previousStep, null, exitName);
      fireOnAbort(reg, record, result.abort);
    }

    const persistence = reg.options?.persistence;
    if (persistence) {
      if (record.status === "active") schedulePersist(record, persistence);
      else removePersisted(record, persistence);
    }

    notify(record);
  }

  function entryAllowBackModeForStep(
    step: JourneyStep | null,
  ): "preserve-state" | "rollback" | false {
    return entryAllowBackMode(step);
  }

  function dispatchExit(
    record: InstanceRecord,
    reg: RegisteredJourney,
    stepToken: number,
    exitName: string,
    output: unknown,
  ) {
    if (record.status !== "active") return;
    if (record.stepToken !== stepToken) {
      if (debug) {
        console.warn(
          `[@modular-react/journeys] Stale exit("${exitName}") dropped on instance ${record.id}`,
        );
      }
      return;
    }
    const step = record.step;
    if (!step) return;
    const perModule =
      (reg.definition.transitions as Record<string, any> | undefined)?.[step.moduleId];
    const perEntry = perModule?.[step.entry];
    const handler = perEntry?.[exitName] as
      | ((ctx: { state: unknown; input: unknown; output: unknown }) => TransitionResult<ModuleTypeMap, unknown>)
      | undefined;
    if (typeof handler !== "function") {
      if (debug) {
        console.warn(
          `[@modular-react/journeys] No transition for exit("${exitName}") on ${step.moduleId}.${step.entry} — ignoring.`,
        );
      }
      return;
    }
    let result: TransitionResult<ModuleTypeMap, unknown>;
    try {
      result = handler({ state: record.state, input: step.input, output });
    } catch (err) {
      if (debug) console.error("[@modular-react/journeys] transition handler threw", err);
      applyTransition(record, reg, { abort: { reason: "transition-error", error: err } }, exitName);
      return;
    }
    applyTransition(record, reg, result, exitName);
  }

  function dispatchGoBack(record: InstanceRecord, reg: RegisteredJourney, stepToken: number) {
    if (record.status !== "active") return;
    if (record.stepToken !== stepToken) return;
    if (record.history.length === 0) return;

    const step = record.step;
    if (!step) return;
    // Journey-side opt-in
    if (!journeyAllowsBack(reg.definition, step)) return;

    const previousStep = record.history.pop()!;
    const snapshot = record.rollbackSnapshots.pop();
    const mode = entryAllowBackMode(step);
    if (mode === "rollback" && snapshot !== undefined) {
      record.state = snapshot as typeof record.state;
    }
    record.hasRollbackSnapshot = record.rollbackSnapshots.some((s) => s !== undefined);
    record.step = previousStep;
    record.stepToken += 1;
    record.updatedAt = nowIso();
    record.cachedCallbacks = null;
    fireOnTransition(reg, record, step, previousStep, null);
    const persistence = reg.options?.persistence;
    if (persistence) schedulePersist(record, persistence);
    notify(record);
  }

  function bindStepCallbacks(record: InstanceRecord, reg: RegisteredJourney) {
    if (
      record.cachedCallbacks &&
      record.cachedCallbacks.stepToken === record.stepToken
    ) {
      return record.cachedCallbacks;
    }
    const token = record.stepToken;
    const exit = (name: string, output?: unknown) => {
      dispatchExit(record, reg, token, name, output);
    };
    const mode = entryAllowBackMode(record.step);
    const canGoBack =
      mode !== false &&
      journeyAllowsBack(reg.definition, record.step) &&
      record.history.length > 0;
    const goBack = canGoBack
      ? () => {
          dispatchGoBack(record, reg, token);
        }
      : undefined;
    record.cachedCallbacks = { stepToken: token, exit, goBack };
    return record.cachedCallbacks;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  function buildInstance(record: InstanceRecord): JourneyInstance {
    if (record.cachedSnapshot && record.cachedSnapshot.revision === record.revision) {
      return record.cachedSnapshot.instance;
    }
    const instance: JourneyInstance = {
      id: record.id,
      journeyId: record.journeyId,
      status: record.status,
      step: record.step,
      history: record.history,
      state: record.state,
      terminalPayload:
        record.status === "completed" || record.status === "aborted"
          ? record.terminalPayload
          : undefined,
      startedAt: record.startedAt,
      updatedAt: record.updatedAt,
      serialize: () => serialize(record),
    };
    record.cachedSnapshot = { revision: record.revision, instance };
    return instance;
  }

  function createRecord(
    reg: RegisteredJourney,
    instanceId: InstanceId,
    persistenceKey: string | null,
    initialState: unknown,
  ): InstanceRecord {
    const startedAt = nowIso();
    return {
      id: instanceId,
      journeyId: reg.definition.id,
      status: "loading",
      step: null,
      history: [],
      rollbackSnapshots: [],
      hasRollbackSnapshot: false,
      state: initialState,
      terminalPayload: undefined,
      startedAt,
      updatedAt: startedAt,
      stepToken: 0,
      persistenceKey,
      terminalFired: false,
      listeners: new Set(),
      pendingSave: null,
      saveInFlight: false,
      revision: 0,
      cachedSnapshot: null,
      cachedCallbacks: null,
    };
  }

  function startFresh(
    reg: RegisteredJourney,
    input: unknown,
    existingRecord?: InstanceRecord,
  ): InstanceId {
    const def = reg.definition as JourneyDefinition<any, any, unknown>;
    const record =
      existingRecord ??
      createRecord(reg, mintInstanceId(), computeKey(reg, input), def.initialState(input));
    if (!existingRecord) {
      instances.set(record.id, record);
      if (record.persistenceKey) keyIndex.set(record.persistenceKey, record.id);
    } else {
      record.state = def.initialState(input);
    }
    const startStep = stepFromSpec(def.start(record.state, input));
    record.step = startStep;
    record.status = "active";
    record.stepToken += 1;
    record.terminalFired = false;
    record.terminalPayload = undefined;
    record.updatedAt = nowIso();
    record.cachedCallbacks = null;
    fireOnTransition(reg, record, null, startStep, null);
    const persistence = reg.options?.persistence;
    if (persistence) schedulePersist(record, persistence);
    notify(record);
    return record.id;
  }

  function hydrateInto(record: InstanceRecord, blob: SerializedJourney<unknown>) {
    record.state = blob.state;
    record.step = blob.step;
    record.history = [...blob.history];
    if (blob.rollbackSnapshots) {
      record.rollbackSnapshots = blob.rollbackSnapshots.map((s) =>
        s === null ? undefined : s,
      ) as (unknown | undefined)[];
      record.hasRollbackSnapshot = record.rollbackSnapshots.some((s) => s !== undefined);
    } else {
      record.rollbackSnapshots = [];
      record.hasRollbackSnapshot = false;
    }
    record.status = blob.status;
    record.terminalPayload = blob.terminalPayload;
    record.startedAt = blob.startedAt;
    record.updatedAt = blob.updatedAt;
    record.stepToken += 1;
    record.terminalFired = blob.status !== "active";
    record.cachedCallbacks = null;
  }

  function probeLoad(
    reg: RegisteredJourney,
    persistence: JourneyPersistence<unknown>,
    key: string,
  ): SerializedJourney<unknown> | null | AsyncLoadPending | Promise<SerializedJourney<unknown> | null> {
    let loaded:
      | SerializedJourney<unknown>
      | null
      | Promise<SerializedJourney<unknown> | null>;
    try {
      loaded = persistence.load(key) as
        | SerializedJourney<unknown>
        | null
        | Promise<SerializedJourney<unknown> | null>;
    } catch (err) {
      if (debug) console.error("[@modular-react/journeys] persistence.load threw", err);
      return null;
    }
    if (loaded && typeof (loaded as Promise<unknown>).then === "function") {
      return loaded as Promise<SerializedJourney<unknown> | null>;
    }
    return loaded as SerializedJourney<unknown> | null;
  }

  function migrateBlob(
    reg: RegisteredJourney,
    blob: SerializedJourney<unknown>,
  ): SerializedJourney<unknown> | null {
    if (reg.definition.onHydrate) {
      try {
        return reg.definition.onHydrate(blob) as SerializedJourney<unknown>;
      } catch (err) {
        if (debug) console.error("[@modular-react/journeys] onHydrate threw", err);
        return null;
      }
    }
    if (blob.version !== reg.definition.version) return null;
    return blob;
  }

  // ---------------------------------------------------------------------------
  // Runtime surface
  // ---------------------------------------------------------------------------

  const runtime: JourneyRuntime = {
    start<TInput>(journeyId: string, input: TInput): InstanceId {
      const reg = assertKnown(journeyId);
      const persistence = reg.options?.persistence;

      if (persistence) {
        const key = persistence.keyFor({
          journeyId: reg.definition.id,
          input,
        });
        // Idempotency: return the existing instance for this key whenever it
        // is still in flight — "active" OR "loading". Returning a fresh id
        // while a load is pending would orphan the loading instance and
        // trigger a second `load()`.
        const existingId = keyIndex.get(key);
        const existing = existingId ? instances.get(existingId) : null;
        if (existing && (existing.status === "active" || existing.status === "loading")) {
          return existing.id;
        }

        const def = reg.definition as JourneyDefinition<any, any, unknown>;
        const loaded = probeLoad(reg, persistence as JourneyPersistence<unknown>, key);

        if (loaded && typeof (loaded as Promise<unknown>).then === "function") {
          // Async probe — mint a placeholder instance in `loading` status,
          // but initialize `state` from `initialState(input)` immediately so
          // consumers reading state during loading never see `undefined`.
          // If the blob later hydrates, state is overwritten.
          const instanceId = mintInstanceId();
          const record = createRecord(reg, instanceId, key, def.initialState(input));
          instances.set(instanceId, record);
          keyIndex.set(key, instanceId);
          notify(record);

          void (loaded as Promise<SerializedJourney<unknown> | null>).then(
            (blob) => {
              if (!blob || blob.status !== "active") {
                startFresh(reg, input, record);
                return;
              }
              const migrated = migrateBlob(reg, blob);
              if (!migrated) {
                startFresh(reg, input, record);
                return;
              }
              hydrateInto(record, migrated);
              notify(record);
            },
            (err) => {
              if (debug) console.error("[@modular-react/journeys] persistence.load rejected", err);
              startFresh(reg, input, record);
            },
          );
          return instanceId;
        }

        const blob = loaded as SerializedJourney<unknown> | null;
        if (blob && blob.status === "active") {
          const migrated = migrateBlob(reg, blob);
          if (migrated) {
            const instanceId = migrated.instanceId || mintInstanceId();
            const record = createRecord(reg, instanceId, key, def.initialState(input));
            instances.set(instanceId, record);
            keyIndex.set(key, instanceId);
            hydrateInto(record, migrated);
            notify(record);
            return instanceId;
          }
          // Migration failed: fall through to fresh start.
        }

        // No blob / terminal blob / migration failed — mint a fresh instance
        // that still owns the key, so subsequent `start()` calls are
        // idempotent.
        const instanceId = mintInstanceId();
        const record = createRecord(reg, instanceId, key, def.initialState(input));
        instances.set(instanceId, record);
        keyIndex.set(key, instanceId);
        return startFresh(reg, input, record);
      }

      return startFresh(reg, input);
    },

    hydrate<TState>(journeyId: string, blob: SerializedJourney<TState>): InstanceId {
      const reg = assertKnown(journeyId);
      const migrated = migrateBlob(reg, blob as SerializedJourney<unknown>);
      if (!migrated) {
        throw new Error(
          `[@modular-react/journeys] Hydrate version mismatch for "${journeyId}": blob=${blob.version} def=${reg.definition.version}. Provide onHydrate to migrate.`,
        );
      }
      const instanceId = migrated.instanceId || mintInstanceId();

      // If the migrated blob has an input we can use to compute the key, we
      // could re-index — but `SerializedJourney` doesn't carry the original
      // `input`, so explicit hydrate stays persistence-unlinked. Callers
      // that want round-trip persistence should use `start()` which owns the
      // key lifecycle. Document this on the API.
      const record = createRecord(reg, instanceId, null, migrated.state);
      instances.set(instanceId, record);
      hydrateInto(record, migrated);
      notify(record);
      return instanceId;
    },

    getInstance(id) {
      const record = instances.get(id);
      return record ? buildInstance(record) : null;
    },

    listInstances() {
      return [...instances.keys()];
    },

    listDefinitions() {
      return [...definitions.values()].map(summarize);
    },

    subscribe(id, listener) {
      const record = instances.get(id);
      if (!record) return () => {};
      record.listeners.add(listener);
      return () => {
        record.listeners.delete(listener);
      };
    },

    end(id, reason) {
      const record = instances.get(id);
      if (!record) return;
      if (record.status === "completed" || record.status === "aborted") return;
      const reg = definitions.get(record.journeyId);
      if (!reg) return;
      let result: TransitionResult<ModuleTypeMap, unknown> = {
        abort: { reason: reason ?? "abandoned" },
      };
      if (reg.definition.onAbandon) {
        try {
          result = reg.definition.onAbandon({
            journeyId: record.journeyId,
            instanceId: record.id,
            step: record.step,
            state: record.state,
            reason: reason ?? "abandoned",
          }) as TransitionResult<ModuleTypeMap, unknown>;
        } catch (err) {
          if (debug) console.error("[@modular-react/journeys] onAbandon threw", err);
        }
      }
      applyTransition(record, reg, result, null);
    },

    forget(id) {
      const record = instances.get(id);
      if (!record) return;
      if (record.status !== "completed" && record.status !== "aborted") return;
      if (record.persistenceKey) keyIndex.delete(record.persistenceKey);
      record.listeners.clear();
      instances.delete(id);
    },
  };

  // Internals used by the outlet and testing helpers.
  const internals: JourneyRuntimeInternals = {
    __bindStepCallbacks: bindStepCallbacks,
    __getRecord: (id: InstanceId) => instances.get(id),
    __getRegistered: (id: string) => definitions.get(id),
  };
  Object.assign(runtime, internals);

  return runtime;
}

function defaultDebug(): boolean {
  try {
    const g = globalThis as unknown as { process?: { env?: { NODE_ENV?: string } } };
    return !!g.process && g.process.env?.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

export interface JourneyRuntimeInternals {
  __bindStepCallbacks(
    record: InstanceRecord,
    reg: RegisteredJourney,
  ): {
    exit: (name: string, output?: unknown) => void;
    goBack?: () => void;
    stepToken: number;
  };
  __getRecord(id: InstanceId): InstanceRecord | undefined;
  __getRegistered(id: string): RegisteredJourney | undefined;
}

export function getInternals(runtime: JourneyRuntime): JourneyRuntimeInternals {
  return runtime as unknown as JourneyRuntimeInternals;
}
