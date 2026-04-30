import type { JourneyHandleRef, ModuleDescriptor } from "@modular-react/core";
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
import { JourneyHydrationError, UnknownJourneyError } from "./validation.js";

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
  /** Total retries the outlet has consumed for this instance (across all steps). */
  retryCount: number;
  listeners: Set<() => void>;
  pendingSave: SerializedJourney<TState> | null;
  saveInFlight: boolean;
  /**
   * True when `removePersisted` fires while `saveInFlight` is still set:
   * the remove is deferred until the save settles so adapters that don't
   * serialize their own ops can't see remove→save reordering and leave
   * an orphaned blob in storage.
   */
  pendingRemove: boolean;
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

/**
 * Module-private store of runtime internals. Keeps `__bindStepCallbacks`,
 * `__getRecord`, `__getRegistered`, and the bound module descriptor map off
 * the public `JourneyRuntime` surface (which would otherwise show up in
 * autocomplete, `Object.keys`, etc.). Access via {@link getInternals}.
 */
const INTERNALS = new WeakMap<JourneyRuntime, JourneyRuntimeInternals>();

/**
 * Create a journey runtime bound to a set of registered journeys. The
 * registry integration assembles this once at resolve time; the runtime is
 * owned by the manifest and exposed as `manifest.journeys`.
 *
 * Passing an empty `registered` array yields a no-op runtime: every public
 * method is safe to call, and `start()` will throw "unknown journey id" —
 * matching the normal "not registered" failure mode and letting shells skip
 * null-guards on `manifest.journeys`.
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
  // keyIndex is namespaced internally by journeyId so two journeys that
  // happen to return the same `keyFor` string do not alias onto the same
  // instance. The adapter sees only the user-defined portion; the prefix is
  // applied inside the runtime.
  const keyIndex = new Map<string, InstanceId>();

  function indexKey(journeyId: string, userKey: string): string {
    return `${journeyId}::${userKey}`;
  }

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
      throw new UnknownJourneyError(journeyId, [...definitions.keys()]);
    }
    return reg;
  }

  function stepFromSpec(spec: StepSpec<ModuleTypeMap>): JourneyStep {
    return { moduleId: spec.module, entry: spec.entry, input: spec.input };
  }

  function entryAllowBackMode(step: JourneyStep | null): "preserve-state" | "rollback" | false {
    if (!step) return false;
    const mod = moduleMap[step.moduleId];
    const entry = mod?.entryPoints?.[step.entry];
    const raw = entry?.allowBack;
    if (raw === "rollback" || raw === "preserve-state") return raw;
    return false;
  }

  function journeyAllowsBack(definition: AnyJourneyDefinition, step: JourneyStep | null): boolean {
    if (!step) return false;
    const perModule = (definition.transitions as Record<string, any> | undefined)?.[step.moduleId];
    const perEntry = perModule?.[step.entry];
    return perEntry?.allowBack === true;
  }

  function cloneSnapshot(state: unknown): unknown {
    if (state === null || typeof state !== "object") return state;
    const cloned: unknown = Array.isArray(state) ? [...state] : { ...(state as object) };
    // Dev-mode probe: freeze the snapshot so a transition that mutates
    // rolled-back state in place fails loudly instead of silently corrupting
    // the history. The freeze is shallow — deep mutation still slips through
    // (documented limitation L8), but catches the most common footgun.
    if (debug) {
      try {
        Object.freeze(cloned);
      } catch {
        // Some engines reject freezing exotic objects; swallow.
      }
    }
    return cloned;
  }

  function trimHistory(record: InstanceRecord, reg: RegisteredJourney) {
    const cap = reg.options?.maxHistory;
    // `undefined`, zero, and negative all mean "unbounded" — zero is treated
    // as the same escape hatch as a negative cap so a misconfigured `0`
    // cannot silently disable `goBack` by trimming history on every transition.
    if (cap === undefined || cap <= 0) return;
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
      // A terminal transition arrived while the save was in flight. The
      // remove was deferred to this point so adapters that do not serialize
      // their own ops don't see remove → save reordering. Skip the pending
      // save — its blob is about to be obsolete anyway.
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
    record: InstanceRecord<TState>,
    persistence: JourneyPersistence<TState>,
  ) {
    if (!record.persistenceKey) return;
    record.pendingSave = null;
    const key = record.persistenceKey;
    keyIndex.delete(indexKey(record.journeyId, key));
    if (record.saveInFlight) {
      // Defer the remove until the save settles. `runSave`'s finally block
      // picks this up and fires the remove with the same key.
      record.pendingRemove = true;
      return;
    }
    fireAndForgetRemove(persistence, key);
  }

  /**
   * Delete a blob we've decided to discard (terminal, corrupt, unmigrateable)
   * without mutating any live instance record. Used from the `start()` paths
   * where we've probed the adapter and then chosen to mint a fresh instance.
   */
  function discardBlob<TState>(persistence: JourneyPersistence<TState>, key: string) {
    fireAndForgetRemove(persistence, key);
  }

  function fireAndForgetRemove<TState>(persistence: JourneyPersistence<TState>, key: string) {
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
        record.status === "loading" ? "active" : (record.status as SerializedJourney["status"]),
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
      // Defensive copy — `record.history` is mutated in place on every
      // transition, and async consumers (analytics batchers, deferred
      // telemetry) would otherwise observe later mutations when they
      // finally inspect the event.
      history: [...record.history],
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
    const ctx = {
      journeyId: record.journeyId,
      instanceId: record.id,
      state: record.state,
      history: record.history,
    };
    try {
      reg.definition.onComplete?.(ctx, result);
    } catch (err) {
      if (debug) console.error("[@modular-react/journeys] onComplete (definition) threw", err);
    }
    try {
      reg.options?.onComplete?.(ctx, result);
    } catch (err) {
      if (debug) console.error("[@modular-react/journeys] onComplete (registration) threw", err);
    }
  }

  function fireOnAbort(reg: RegisteredJourney, record: InstanceRecord, reason: unknown) {
    if (record.terminalFired) return;
    record.terminalFired = true;
    const ctx = {
      journeyId: record.journeyId,
      instanceId: record.id,
      state: record.state,
      history: record.history,
    };
    try {
      reg.definition.onAbort?.(ctx, reason);
    } catch (err) {
      if (debug) console.error("[@modular-react/journeys] onAbort (definition) threw", err);
    }
    try {
      reg.options?.onAbort?.(ctx, reason);
    } catch (err) {
      if (debug) console.error("[@modular-react/journeys] onAbort (registration) threw", err);
    }
  }

  function fireOnError(
    reg: RegisteredJourney,
    record: InstanceRecord,
    err: unknown,
    step: JourneyStep | null,
  ) {
    try {
      reg.options?.onError?.(err, { step });
    } catch (hookErr) {
      if (debug) console.error("[@modular-react/journeys] onError (registration) threw", hookErr);
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
      record.state = result.state;
    }

    if ("next" in result) {
      const nextStep = stepFromSpec(result.next);
      if (debug) {
        // Validation at resolveManifest() catches static misconfiguration,
        // but transition handlers branch at runtime and can return a
        // dynamically-built `next` that points at a module or entry that
        // isn't registered. The outlet would then render its generic
        // "no entry on the registered modules" message with no hint about
        // which transition was responsible. Warn here so the authoring loop
        // surfaces the source.
        if (Object.keys(moduleMap).length > 0) {
          const mod = moduleMap[nextStep.moduleId];
          if (!mod) {
            console.warn(
              `[@modular-react/journeys] Transition on "${previousStep?.moduleId}.${previousStep?.entry}" returned next.module="${nextStep.moduleId}" which is not in the runtime's module map — the outlet will render a "no entry" error.`,
            );
          } else if (!mod.entryPoints?.[nextStep.entry]) {
            console.warn(
              `[@modular-react/journeys] Transition on "${previousStep?.moduleId}.${previousStep?.entry}" returned next.entry="${nextStep.moduleId}.${nextStep.entry}" which is not a declared entry on that module.`,
            );
          }
        }
      }
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
    if (record.status !== "active") {
      if (debug) {
        console.warn(
          `[@modular-react/journeys] Exit("${exitName}") dropped on instance ${record.id} — status=${record.status}. ` +
            `(This is the expected no-op when an exit fires before the initial async load settles; ` +
            `await the load or subscribe for status changes before dispatching.)`,
        );
      }
      return;
    }
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
    const perModule = (reg.definition.transitions as Record<string, any> | undefined)?.[
      step.moduleId
    ];
    const perEntry = perModule?.[step.entry];
    const handler = perEntry?.[exitName] as
      | ((ctx: {
          state: unknown;
          input: unknown;
          output: unknown;
        }) => TransitionResult<ModuleTypeMap, unknown>)
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
      fireOnError(reg, record, err, step);
      applyTransition(
        record,
        reg,
        { abort: { reason: "transition-error", exit: exitName, error: err } },
        exitName,
      );
      return;
    }
    // Transitions must be pure and synchronous. A handler that returns a
    // thenable almost certainly forgot to put the async work inside a loading
    // entry point — applying the thenable as the transition result would be
    // a silent no-op (it is not `{ next | complete | abort }`), so warn and
    // treat it as an abort.
    if (result && typeof (result as { then?: unknown }).then === "function") {
      if (debug) {
        console.error(
          `[@modular-react/journeys] Transition handler for ${step.moduleId}.${step.entry}."${exitName}" returned a Promise. Transitions must be synchronous and pure — put async work inside a loading entry point on a module.`,
        );
      }
      applyTransition(
        record,
        reg,
        { abort: { reason: "transition-returned-promise", exit: exitName } },
        exitName,
      );
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
      record.state = snapshot;
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
    if (record.cachedCallbacks && record.cachedCallbacks.stepToken === record.stepToken) {
      return record.cachedCallbacks;
    }
    const token = record.stepToken;
    const exit = (name: string, output?: unknown) => {
      dispatchExit(record, reg, token, name, output);
    };
    let mode = entryAllowBackMode(record.step);
    // Documented fallback (see `JourneyRuntimeOptions.modules`): when the
    // runtime is built without a module descriptor for this step but the
    // journey's transition opts in via `allowBack: true`, treat the mode as
    // 'preserve-state' so `goBack` stays wired. Without this fallback the
    // headless simulator (which never passes a moduleMap) and any runtime
    // created without module descriptors would see `goBack` silently
    // disappear, contradicting the documented behavior.
    if (
      mode === false &&
      record.step &&
      journeyAllowsBack(reg.definition, record.step) &&
      !moduleMap[record.step.moduleId]
    ) {
      mode = "preserve-state";
    }
    const canGoBack =
      mode !== false && journeyAllowsBack(reg.definition, record.step) && record.history.length > 0;
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
    // Copy-on-build: history is mutated in place on every transition, so
    // consumers that diff against a prior `instance.history` reference
    // (React deps, effect closures, useMemo) need a frozen-per-revision
    // snapshot. Cheap — bounded by the history cap, and only rebuilt when
    // the revision bumps.
    const historySnapshot: readonly JourneyStep[] = [...record.history];
    const instance: JourneyInstance = {
      id: record.id,
      journeyId: record.journeyId,
      status: record.status,
      step: record.step,
      history: historySnapshot,
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
      retryCount: 0,
      listeners: new Set(),
      pendingSave: null,
      saveInFlight: false,
      pendingRemove: false,
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
      existingRecord ?? createRecord(reg, mintInstanceId(), null, def.initialState(input));
    if (!existingRecord) {
      instances.set(record.id, record);
    } else {
      // Recycling a record — typically because an async probe failed or a
      // partial hydrate threw. Reset every field that could carry stale
      // state from the record's previous life. Without this, a hydrate that
      // populated `history` / `rollbackSnapshots` before throwing would
      // leak those entries into the "fresh" instance.
      record.state = def.initialState(input);
      record.history = [];
      record.rollbackSnapshots = [];
      record.hasRollbackSnapshot = false;
    }
    const startStep = stepFromSpec(def.start(record.state, input));
    record.step = startStep;
    record.status = "active";
    record.stepToken += 1;
    record.terminalFired = false;
    record.terminalPayload = undefined;
    // A recycled record can carry a retry count from its previous life (an
    // async-load failure that fell through to `startFresh`, for example).
    // The new run is a fresh journey — reset the budget.
    record.retryCount = 0;
    record.updatedAt = nowIso();
    record.cachedCallbacks = null;
    fireOnTransition(reg, record, null, startStep, null);
    const persistence = reg.options?.persistence;
    if (persistence) schedulePersist(record, persistence);
    notify(record);
    return record.id;
  }

  function hydrateInto(record: InstanceRecord, blob: SerializedJourney<unknown>) {
    const historyLen = blob.history.length;
    // Align rollbackSnapshots with history — mismatched lengths corrupt
    // `goBack` (pop() would take the wrong pair). Reject upfront instead of
    // silently misbehaving later.
    if (blob.rollbackSnapshots && blob.rollbackSnapshots.length !== historyLen) {
      throw new JourneyHydrationError(
        `Blob for journey "${record.journeyId}" has rollbackSnapshots.length=${blob.rollbackSnapshots.length} but history.length=${historyLen}. Fix the persisted blob (pad rollbackSnapshots with null for non-rollback entries) or provide onHydrate to migrate.`,
      );
    }
    record.state = blob.state;
    record.step = blob.step;
    record.history = [...blob.history];
    if (blob.rollbackSnapshots) {
      record.rollbackSnapshots = blob.rollbackSnapshots.map((s) =>
        s === null ? undefined : s,
      ) as (unknown | undefined)[];
      record.hasRollbackSnapshot = record.rollbackSnapshots.some((s) => s !== undefined);
    } else {
      // Legacy blobs without rollbackSnapshots — treat as if every history
      // entry had no snapshot. Keeps the two arrays length-aligned.
      record.rollbackSnapshots = Array.from({ length: historyLen }, () => undefined);
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
  ): SerializedJourney<unknown> | null | Promise<SerializedJourney<unknown> | null> {
    let loaded: SerializedJourney<unknown> | null | Promise<SerializedJourney<unknown> | null>;
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

  type MigrateResult =
    | { ok: true; blob: SerializedJourney<unknown> }
    | { ok: false; reason: "version-mismatch" }
    | { ok: false; reason: "on-hydrate-threw"; cause: unknown };

  function migrateBlob(reg: RegisteredJourney, blob: SerializedJourney<unknown>): MigrateResult {
    let migrated: SerializedJourney<unknown> = blob;
    let ranAny = false;
    if (reg.definition.onHydrate) {
      ranAny = true;
      try {
        migrated = reg.definition.onHydrate(migrated) as SerializedJourney<unknown>;
      } catch (err) {
        if (debug) console.error("[@modular-react/journeys] onHydrate (definition) threw", err);
        return { ok: false, reason: "on-hydrate-threw", cause: err };
      }
    }
    // Registration-level `onHydrate` runs after the definition's — shells can
    // layer environment-specific post-migration tweaks (redaction, id
    // rewriting) without touching journey authoring code.
    const regHydrate = reg.options?.onHydrate as
      | ((b: SerializedJourney<unknown>) => SerializedJourney<unknown>)
      | undefined;
    if (regHydrate) {
      ranAny = true;
      try {
        migrated = regHydrate(migrated);
      } catch (err) {
        if (debug) console.error("[@modular-react/journeys] onHydrate (registration) threw", err);
        return { ok: false, reason: "on-hydrate-threw", cause: err };
      }
    }
    if (ranAny) {
      return { ok: true, blob: migrated };
    }
    if (blob.version !== reg.definition.version) {
      return { ok: false, reason: "version-mismatch" };
    }
    return { ok: true, blob };
  }

  // ---------------------------------------------------------------------------
  // Runtime surface
  // ---------------------------------------------------------------------------

  const runtime: JourneyRuntime = {
    start<TInput, TOutput>(
      journeyIdOrHandle: string | JourneyHandleRef<string, TInput, TOutput>,
      ...rest: [input?: TInput]
    ): InstanceId {
      const input = (rest.length > 0 ? rest[0] : undefined) as TInput;
      // Accept either a bare id or a `JourneyHandle`-shaped object. The
      // handle form is the `start<TId, TInput>(handle, input)` overload; it
      // only exists to type-check `input` — the runtime behaviour is
      // identical either way.
      const journeyId =
        typeof journeyIdOrHandle === "string" ? journeyIdOrHandle : journeyIdOrHandle.id;
      const reg = assertKnown(journeyId);
      const persistence = reg.options?.persistence;

      if (persistence) {
        const key = persistence.keyFor({
          journeyId: reg.definition.id,
          input,
        });
        const indexed = indexKey(reg.definition.id, key);
        // Idempotency: return the existing instance for this key whenever it
        // is still in flight — "active" OR "loading". Returning a fresh id
        // while a load is pending would orphan the loading instance and
        // trigger a second `load()`.
        const existingId = keyIndex.get(indexed);
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
          keyIndex.set(indexed, instanceId);
          notify(record);

          void (loaded as Promise<SerializedJourney<unknown> | null>).then(
            (blob) => {
              // The caller may have ended the instance before the load
              // settled (tab closed, navigation, explicit `runtime.end`).
              // In that case the record is already terminal and we must
              // not resurrect it with startFresh or a hydrate.
              if (record.status !== "loading") return;
              if (!blob || blob.status !== "active") {
                // Discard terminal/missing blob and mint a fresh instance
                // under the same key. A terminal blob left in storage would
                // be re-fetched on every subsequent start().
                if (blob) discardBlob(persistence as JourneyPersistence<unknown>, key);
                startFresh(reg, input, record);
                return;
              }
              const migrated = migrateBlob(reg, blob);
              if (!migrated.ok) {
                discardBlob(persistence as JourneyPersistence<unknown>, key);
                startFresh(reg, input, record);
                return;
              }
              try {
                hydrateInto(record, migrated.blob);
              } catch (err) {
                if (debug)
                  console.error("[@modular-react/journeys] hydrate after async load failed", err);
                discardBlob(persistence as JourneyPersistence<unknown>, key);
                startFresh(reg, input, record);
                return;
              }
              notify(record);
            },
            (err) => {
              if (debug) console.error("[@modular-react/journeys] persistence.load rejected", err);
              if (record.status !== "loading") return;
              startFresh(reg, input, record);
            },
          );
          return instanceId;
        }

        const blob = loaded as SerializedJourney<unknown> | null;
        if (blob && blob.status === "active") {
          const migrated = migrateBlob(reg, blob);
          if (migrated.ok) {
            // Guard against a blob whose recorded id collides with a live
            // instance (corrupted / hand-edited blob, or two journeys sharing
            // a persistence keyspace). Mint a fresh id instead of clobbering
            // the existing entry — matches `hydrate()`'s existing rejection
            // of re-hydrate over an existing id.
            const instanceId =
              migrated.blob.instanceId && !instances.has(migrated.blob.instanceId)
                ? migrated.blob.instanceId
                : mintInstanceId();
            const record = createRecord(reg, instanceId, key, def.initialState(input));
            instances.set(instanceId, record);
            keyIndex.set(indexed, instanceId);
            try {
              hydrateInto(record, migrated.blob);
            } catch (err) {
              if (debug)
                console.error("[@modular-react/journeys] hydrate during start failed", err);
              // Cleanup the half-built record and fall through to startFresh
              // under the same key.
              instances.delete(instanceId);
              keyIndex.delete(indexed);
              discardBlob(persistence as JourneyPersistence<unknown>, key);
              const freshId = mintInstanceId();
              const freshRecord = createRecord(reg, freshId, key, def.initialState(input));
              instances.set(freshId, freshRecord);
              keyIndex.set(indexed, freshId);
              return startFresh(reg, input, freshRecord);
            }
            notify(record);
            return instanceId;
          }
          // Migration failed: discard the stale blob so it doesn't get
          // re-fetched forever.
          discardBlob(persistence as JourneyPersistence<unknown>, key);
        } else if (blob) {
          // Terminal blob — drop it before reusing the key for a fresh run.
          discardBlob(persistence as JourneyPersistence<unknown>, key);
        }

        // No blob / terminal blob / migration failed — mint a fresh instance
        // that still owns the key, so subsequent `start()` calls are
        // idempotent.
        const instanceId = mintInstanceId();
        const record = createRecord(reg, instanceId, key, def.initialState(input));
        instances.set(instanceId, record);
        keyIndex.set(indexed, instanceId);
        return startFresh(reg, input, record);
      }

      return startFresh(reg, input);
    },

    hydrate<TState>(journeyId: string, blob: SerializedJourney<TState>): InstanceId {
      const reg = assertKnown(journeyId);
      const migrated = migrateBlob(reg, blob as SerializedJourney<unknown>);
      if (!migrated.ok) {
        if (migrated.reason === "on-hydrate-threw") {
          // Surface the original throw via `.cause` so callers can
          // distinguish a migrator bug from a true version mismatch and
          // log the underlying error without losing the stack.
          throw new JourneyHydrationError(
            `onHydrate threw while migrating blob for "${journeyId}" (blob=${blob.version} def=${reg.definition.version}).`,
            { cause: migrated.cause },
          );
        }
        throw new JourneyHydrationError(
          `Hydrate version mismatch for "${journeyId}": blob=${blob.version} def=${reg.definition.version}. Provide onHydrate to migrate.`,
        );
      }
      const instanceId = migrated.blob.instanceId || mintInstanceId();
      // Guard against silent overwrite — two hydrates of the same blob would
      // otherwise clobber live state and orphan existing listeners.
      if (instances.has(instanceId)) {
        throw new JourneyHydrationError(
          `Cannot hydrate journey "${journeyId}" with instance id "${instanceId}" — an instance with the same id is already in memory. Call forget(id) first if you intend to replace it.`,
        );
      }

      // If the migrated blob has an input we can use to compute the key, we
      // could re-index — but `SerializedJourney` doesn't carry the original
      // `input`, so explicit hydrate stays persistence-unlinked. Callers
      // that want round-trip persistence should use `start()` which owns the
      // key lifecycle. Document this on the API.
      const record = createRecord(reg, instanceId, null, migrated.blob.state);
      instances.set(instanceId, record);
      try {
        hydrateInto(record, migrated.blob);
      } catch (err) {
        // Don't leak the half-built loading placeholder — otherwise
        // subsequent getInstance(id) returns partial state, a retry hits
        // the "already in memory" guard, and forget(id) is a no-op
        // (status never reached terminal). Mirror the sync-start path
        // which already cleans up in the same situation.
        instances.delete(instanceId);
        throw err;
      }
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

    isRegistered(journeyId) {
      return definitions.has(journeyId);
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
      // An outlet that unmounts mid-load should still be able to tear the
      // placeholder instance down. The journey never "started" as far as the
      // author is concerned, so skip `onAbandon` (it would see a null step)
      // and transition straight to `aborted` with the supplied reason.
      if (record.status === "loading") {
        applyTransition(record, reg, { abort: { reason: reason ?? "abandoned" } }, null);
        return;
      }
      const defaultAbort: TransitionResult<ModuleTypeMap, unknown> = {
        abort: { reason: reason ?? "abandoned" },
      };
      let result: TransitionResult<ModuleTypeMap, unknown> = defaultAbort;
      // Registration-level `onAbandon` overrides the definition's — shells
      // can swap the abandon outcome without modifying journey authoring code
      // (e.g. complete instead of abort on tab close). If absent, fall back
      // to the definition's handler.
      const abandonHandler = reg.options?.onAbandon ?? reg.definition.onAbandon;
      if (abandonHandler) {
        try {
          result = abandonHandler({
            journeyId: record.journeyId,
            instanceId: record.id,
            step: record.step,
            state: record.state,
            reason: reason ?? "abandoned",
          }) as TransitionResult<ModuleTypeMap, unknown>;
        } catch (err) {
          // Surface the handler crash through the registration-level onError
          // hook before falling back to the default abort. Preserve the
          // caller-supplied `reason` (and surface `onAbandon`'s own error as
          // `cause`) so a throw in a shell's onAbandon doesn't silently
          // erase the original abort context.
          if (debug) console.error("[@modular-react/journeys] onAbandon threw", err);
          fireOnError(reg, record, err, record.step);
          result = {
            abort: {
              reason: reason ?? "abandoned",
              cause: "onAbandon-threw",
              error: err,
            },
          };
        }
      }
      applyTransition(record, reg, result, null);
    },

    forget(id) {
      const record = instances.get(id);
      if (!record) return;
      if (record.status !== "completed" && record.status !== "aborted") return;
      if (record.persistenceKey) keyIndex.delete(indexKey(record.journeyId, record.persistenceKey));
      record.listeners.clear();
      instances.delete(id);
    },

    forgetTerminal() {
      let removed = 0;
      for (const [id, record] of instances) {
        if (record.status === "completed" || record.status === "aborted") {
          if (record.persistenceKey) {
            keyIndex.delete(indexKey(record.journeyId, record.persistenceKey));
          }
          record.listeners.clear();
          instances.delete(id);
          removed += 1;
        }
      }
      return removed;
    },
  };

  function dispatchComponentError(id: InstanceId, err: unknown, step: JourneyStep): void {
    const record = instances.get(id);
    if (!record) return;
    const reg = definitions.get(record.journeyId);
    if (!reg) return;
    fireOnError(reg, record, err, step);
  }

  // Internals used by the outlet and testing helpers — kept on a WeakMap
  // rather than on the runtime object to keep the public surface clean.
  const internals: JourneyRuntimeInternals = {
    __bindStepCallbacks: bindStepCallbacks,
    __getRecord: (id: InstanceId) => instances.get(id),
    __getRegistered: (id: string) => definitions.get(id),
    __moduleMap: moduleMap,
    __debug: debug,
    __fireComponentError: dispatchComponentError,
  };
  INTERNALS.set(runtime, internals);

  return runtime;
}

function defaultDebug(): boolean {
  const g = globalThis as { process?: { env?: { NODE_ENV?: string } } };
  return !!g.process && g.process.env?.NODE_ENV !== "production";
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
  /** Module descriptors bound to this runtime — the `<JourneyOutlet>` reads
   *  this to resolve step components without the caller threading `modules`
   *  through as a prop. */
  __moduleMap: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  /** Runtime's resolved debug flag — useful for dev-mode probes in the
   *  outlet / module-tab. */
  __debug: boolean;
  /**
   * Fires the registration-level `onError` hook for a component-level throw
   * caught by the outlet's error boundary. Routed through the runtime so
   * the outlet never has to reach into `reg.options.onError` directly —
   * keeps the runtime the single owner of hook firing.
   */
  __fireComponentError(id: InstanceId, err: unknown, step: JourneyStep): void;
}

export function getInternals(runtime: JourneyRuntime): JourneyRuntimeInternals {
  const internals = INTERNALS.get(runtime);
  if (!internals) {
    throw new Error(
      "[@modular-react/journeys] getInternals() called on a runtime that was not produced by createJourneyRuntime().",
    );
  }
  return internals;
}
