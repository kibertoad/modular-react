import type { JourneyHandleRef, ModuleDescriptor } from "@modular-react/core";
import type {
  AnyJourneyDefinition,
  ChildOutcome,
  InstanceId,
  InvokeSpec,
  JourneyDefinition,
  JourneyDefinitionSummary,
  JourneyInstance,
  JourneyPersistence,
  JourneyRuntime,
  JourneyStatus,
  JourneyStep,
  ModuleTypeMap,
  PendingInvoke,
  RegisteredJourney,
  ResumeBounceCounter,
  ResumeHandler,
  ResumeMap,
  SerializedJourney,
  StepSpec,
  TransitionEvent,
  TransitionResult,
} from "./types.js";
import { JourneyHydrationError, UnknownJourneyError } from "./validation.js";

/**
 * Default cap on the depth of an in-flight invoke chain (root parent +
 * descendants). A journey's registration can override this via
 * `JourneyRegisterOptions.maxCallStackDepth`; the runtime takes the
 * minimum of all non-undefined settings across the chain so the most
 * cautious journey wins.
 *
 * The default of 16 is chosen to be larger than any reasonable
 * invocation chain we've seen (deepest real-world: 3) while still
 * catching unbounded recursion long before it becomes a memory or
 * call-stack hazard.
 */
const DEFAULT_MAX_CALL_STACK_DEPTH = 16;

/**
 * Default cap on consecutive resume bounces at the same parent step.
 * A "bounce" is a resume that returns `{ invoke }` instead of advancing
 * the parent's step; the counter resets when the parent's step changes
 * for any reason. Override via
 * `JourneyRegisterOptions.maxResumeBouncesPerStep`.
 */
const DEFAULT_MAX_RESUME_BOUNCES_PER_STEP = 8;

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
   * Set when this instance is a child invoked from a parent's transition.
   * On terminal, the runtime looks up the parent record and applies the
   * named resume handler with this instance's terminal outcome. Cleared
   * after the resume fires (or never set for root instances). Mirrored to
   * the persisted blob as `parentLink` so a child loaded out-of-order on
   * reload still knows its parent.
   */
  parent: { instanceId: InstanceId; resumeName: string } | null;
  /**
   * Set on a parent record when a child journey is in flight from this
   * record's current step. Cleared on resume (the named handler fires)
   * or when either side is force-terminated. Mirrored to the persisted
   * blob as `pendingInvoke` so reload can relink across processes.
   */
  activeChildId: InstanceId | null;
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
  /**
   * Per-step bounce counter for the resume-bounce-limit guard. Set when
   * a resume on this record's current step returns `{ invoke }`;
   * incremented on each subsequent same-step resume that does the same;
   * cleared whenever the step actually advances. Mirrored to the
   * persisted blob as `resumeBouncesAtStep` so a hostile or accidental
   * reload-bounce-reload-bounce cannot reset the counter through
   * storage.
   */
  resumeBouncesAtStep: ResumeBounceCounter | null;
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
  /**
   * Reverse lookup from child instance id → parent instance id. Maintained
   * alongside `record.parent` so the child-terminal hook is O(1) and does
   * not have to scan all records to find an awaiting parent. Symmetric:
   * present iff `parent.activeChildId === childId`.
   */
  const childToParent = new Map<InstanceId, InstanceId>();

  function indexKey(journeyId: string, userKey: string): string {
    // Use a non-printable separator so a journey id containing the
    // separator can never collide with a user-defined key.
    return `${journeyId}${userKey}`;
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
    // Freeze the snapshot so a transition that mutates rolled-back state
    // in place fails loudly instead of silently corrupting the history.
    // Done in dev *and* prod so the dev/prod behavior diff is just
    // "console.error vs strict-mode throw," not "silently corrupts vs
    // throws." The freeze is shallow — deep mutation still slips through
    // (documented limitation L8), but catches the most common footgun.
    try {
      Object.freeze(cloned);
    } catch {
      // Some engines reject freezing exotic objects; swallow.
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
    let pendingInvoke: PendingInvoke | undefined;
    if (record.activeChildId) {
      const child = instances.get(record.activeChildId);
      // Best-effort: only emit pendingInvoke when the child is still in
      // memory and we can resolve it. If the child has been forgotten or
      // never linked, we skip serialization rather than emitting a dangling
      // link the hydrate path can't satisfy.
      if (child) {
        const link = child.parent;
        if (link && link.instanceId === record.id) {
          pendingInvoke = {
            childJourneyId: child.journeyId,
            childInstanceId: child.id,
            childPersistenceKey: child.persistenceKey,
            resumeName: link.resumeName,
          };
        }
      }
    }
    const parentLink = record.parent
      ? { parentInstanceId: record.parent.instanceId, resumeName: record.parent.resumeName }
      : undefined;
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
      pendingInvoke,
      parentLink,
      resumeBouncesAtStep: record.resumeBouncesAtStep ?? undefined,
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
    extras?: {
      readonly kind?: TransitionEvent["kind"];
      readonly child?: TransitionEvent["child"];
      readonly outcome?: TransitionEvent["outcome"];
      readonly resume?: TransitionEvent["resume"];
    },
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
      kind: extras?.kind ?? "step",
      child: extras?.child,
      outcome: extras?.outcome,
      resume: extras?.resume,
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
    phase: "step" | "invoke" | "resume" | "abandon" = "step",
  ) {
    try {
      reg.options?.onError?.(err, { step, phase });
    } catch (hookErr) {
      if (debug) console.error("[@modular-react/journeys] onError (registration) threw", hookErr);
    }
  }

  // ---------------------------------------------------------------------------
  // Invoke / resume helpers
  // ---------------------------------------------------------------------------

  /**
   * Look up a resume handler on a record's current step. Resumes live in a
   * sibling map at the journey-definition level (`def.resumes[mod][entry]`)
   * so the `EntryTransitions` intersection stays clean — see the doc on
   * `EntryTransitions` in `journey-contracts.ts` for why.
   */
  function lookupResume(
    reg: RegisteredJourney,
    step: JourneyStep,
    resumeName: string,
  ): ResumeHandler<ModuleTypeMap, unknown, unknown, unknown, unknown> | undefined {
    const resumesMap = reg.definition.resumes as ResumeMap<ModuleTypeMap, unknown> | undefined;
    if (!resumesMap) return undefined;
    const perModule = resumesMap[step.moduleId];
    if (!perModule) return undefined;
    const perEntry = perModule[step.entry];
    if (!perEntry) return undefined;
    return perEntry[resumeName] as
      | ResumeHandler<ModuleTypeMap, unknown, unknown, unknown, unknown>
      | undefined;
  }

  /**
   * Walk a record's ancestor chain via `parent` links, returning every
   * ancestor in root → immediate-parent order (excluding `record`
   * itself). Used by the cycle and depth guards in {@link beginInvoke}.
   * Stops at the first dangling pointer (an ancestor that has been
   * `forget()`-ed mid-flight) — the chain we have is what we work with;
   * we do not synthesize phantom links.
   */
  function ancestorChain(record: InstanceRecord): InstanceRecord[] {
    const chain: InstanceRecord[] = [];
    let cur = record.parent;
    // Cap the walk at MAX_ANCESTOR_WALK so a corrupted in-memory cycle
    // (parent pointer landing back on a descendant after a forget +
    // re-hydrate race) cannot lock the runtime in an infinite loop.
    // The cap is far above any realistic chain depth and any finite
    // guard limit.
    const seen = new Set<InstanceId>([record.id]);
    while (cur) {
      if (seen.has(cur.instanceId)) break;
      const ancestor = instances.get(cur.instanceId);
      if (!ancestor) break;
      seen.add(ancestor.id);
      chain.unshift(ancestor);
      cur = ancestor.parent;
    }
    return chain;
  }

  /**
   * Resolve the effective `maxResumeBouncesPerStep` for a record. Unlike
   * `maxCallStackDepth`, the bounce counter is per-record (per-step,
   * actually) and can only be sensibly governed by the journey that
   * owns the resume returning the bounce — i.e. the parent's own
   * registration. Other journeys in the call chain don't see the
   * resumes; they would have no business voting on the cap.
   */
  function resolveBounceCap(reg: RegisteredJourney): number {
    const opt = reg.options?.maxResumeBouncesPerStep;
    if (typeof opt === "number" && Number.isFinite(opt) && opt > 0) return opt;
    return DEFAULT_MAX_RESUME_BOUNCES_PER_STEP;
  }

  /**
   * Resolve the effective `maxCallStackDepth` for an invoke about to
   * happen. Walks the chain (ancestors + parent + would-be child) and
   * picks the **minimum** non-undefined option, falling back to the
   * library default. Any journey in the chain can lower the cap; none
   * can quietly raise it.
   *
   * `0` and negative values are treated as "no opinion" (consistent with
   * `maxHistory` semantics) so a misconfigured `0` cannot silently
   * disable invoke from this journey.
   */
  function resolveMaxCallStackDepth(
    chain: readonly InstanceRecord[],
    parentReg: RegisteredJourney,
    childReg: RegisteredJourney | undefined,
  ): number {
    let cap = DEFAULT_MAX_CALL_STACK_DEPTH;
    let sawOverride = false;
    const visit = (reg: RegisteredJourney | undefined) => {
      const opt = reg?.options?.maxCallStackDepth;
      if (typeof opt === "number" && Number.isFinite(opt) && opt > 0) {
        cap = sawOverride ? Math.min(cap, opt) : opt;
        sawOverride = true;
      }
    };
    for (const ancestor of chain) visit(definitions.get(ancestor.journeyId));
    visit(parentReg);
    visit(childReg);
    return cap;
  }

  /**
   * Open a child journey from a parent's transition. Validates the handle
   * up-front; on any failure (unknown journey id, missing resume on the
   * parent step), fires `onError` and drives the parent into `abort` so
   * the failure mode is surfaced uniformly with other transition errors.
   * Returns the live child `InstanceRecord` when the invoke was committed,
   * or `false` when it fell through to abort (and the caller must skip
   * the post-transition persistence/notify pass).
   *
   * The cycle / depth / undeclared-child guards run *before* the handle
   * is dispatched to `runtime.start`, so a guard rejection never
   * materialises a child record. This keeps the failure path symmetric
   * with the existing unknown-journey / missing-resume validations.
   */
  function beginInvoke(
    parent: InstanceRecord,
    parentReg: RegisteredJourney,
    spec: InvokeSpec<unknown, unknown>,
    exitName: string | null,
  ): InstanceRecord | false {
    const parentStep = parent.step;
    if (!parentStep) {
      // Should not happen (we only reach the invoke arm with an active step),
      // but guard so a corrupted call site can't crash the runtime.
      applyTransitionLocal(
        parent,
        parentReg,
        { abort: { reason: "invoke-without-step", exit: exitName } },
        { kind: "invoke" },
      );
      return false;
    }
    if (!spec || typeof spec !== "object") {
      applyTransitionLocal(
        parent,
        parentReg,
        { abort: { reason: "invoke-missing-spec", exit: exitName } },
        { kind: "invoke" },
      );
      return false;
    }
    const childJourneyId = spec.handle?.id;
    if (!childJourneyId || !definitions.has(childJourneyId)) {
      if (debug) {
        console.error(
          `[@modular-react/journeys] Invoke from "${parent.journeyId}.${parentStep.moduleId}.${parentStep.entry}" references unknown child journey id "${childJourneyId}".`,
        );
      }
      fireOnError(
        parentReg,
        parent,
        new Error(`Unknown child journey "${childJourneyId}"`),
        parentStep,
        "invoke",
      );
      applyTransitionLocal(
        parent,
        parentReg,
        {
          abort: { reason: "invoke-unknown-journey", journeyId: childJourneyId, exit: exitName },
        },
        { kind: "invoke" },
      );
      return false;
    }
    if (typeof spec.resume !== "string" || spec.resume.length === 0) {
      if (debug) {
        console.error(
          `[@modular-react/journeys] Invoke from "${parent.journeyId}.${parentStep.moduleId}.${parentStep.entry}" is missing a resume name.`,
        );
      }
      fireOnError(parentReg, parent, new Error("Invoke missing resume name"), parentStep, "invoke");
      applyTransitionLocal(
        parent,
        parentReg,
        { abort: { reason: "invoke-missing-resume", exit: exitName } },
        { kind: "invoke" },
      );
      return false;
    }
    if (!lookupResume(parentReg, parentStep, spec.resume)) {
      if (debug) {
        console.error(
          `[@modular-react/journeys] Invoke from "${parent.journeyId}.${parentStep.moduleId}.${parentStep.entry}" names resume "${spec.resume}" but no such handler is declared on def.resumes[${parentStep.moduleId}][${parentStep.entry}].`,
        );
      }
      fireOnError(
        parentReg,
        parent,
        new Error(
          `Resume "${spec.resume}" not declared on ${parentStep.moduleId}.${parentStep.entry}`,
        ),
        parentStep,
        "invoke",
      );
      applyTransitionLocal(
        parent,
        parentReg,
        { abort: { reason: "invoke-unknown-resume", resume: spec.resume, exit: exitName } },
        { kind: "invoke" },
      );
      return false;
    }

    // ---------------------------------------------------------------------
    // Cycle / depth / declared-set guards (cycle-safety net).
    //
    // All three run before we dispatch to `runtime.start` so a guard
    // rejection never materialises a child record nor touches the child's
    // persistence. The order is deliberate:
    //   1. undeclared-child: cheapest, catches dynamic-dispatch typos
    //      whose blast radius is the parent's own definition.
    //   2. cycle: catches "this exact id is already on the active chain"
    //      with the most actionable error message (a printed chain).
    //   3. depth: backstop for graphs that cycle through ids the
    //      runtime has not seen yet (e.g. ABCABC where each link is a
    //      different journey).
    // ---------------------------------------------------------------------

    const childReg = definitions.get(childJourneyId);
    const declaredInvokes = parentReg.definition.invokes;
    if (Array.isArray(declaredInvokes)) {
      let allowed = false;
      for (const handle of declaredInvokes) {
        if (handle?.id === childJourneyId) {
          allowed = true;
          break;
        }
      }
      if (!allowed) {
        if (debug) {
          console.error(
            `[@modular-react/journeys] Invoke from "${parent.journeyId}.${parentStep.moduleId}.${parentStep.entry}" dispatched handle "${childJourneyId}" which is not in the parent's declared invokes[]. Add the handle to the parent journey's \`invokes\` array, or remove the declaration to opt out of static checking.`,
          );
        }
        fireOnError(
          parentReg,
          parent,
          new Error(`Child journey "${childJourneyId}" is not in "${parent.journeyId}".invokes[]`),
          parentStep,
          "invoke",
        );
        applyTransitionLocal(
          parent,
          parentReg,
          {
            abort: {
              reason: "invoke-undeclared-child",
              parentJourneyId: parent.journeyId,
              childJourneyId,
              exit: exitName,
            },
          },
          { kind: "invoke" },
        );
        return false;
      }
    }

    const chain = ancestorChain(parent);
    // Same-id guard. Walks every ancestor + the parent itself; if the
    // target id is anywhere on the active chain we abort with the
    // closing-cycle path so the author can see exactly where recursion
    // closed. The `chain` payload mirrors the printed display (cycle
    // portion only — pre-cycle prefix is dropped) so telemetry consumers
    // and the human-readable warning agree.
    {
      const fullIds = chain.map((r) => r.journeyId).concat(parent.journeyId);
      const collisionIdx = fullIds.indexOf(childJourneyId);
      if (collisionIdx >= 0) {
        const cyclePath = [...fullIds.slice(collisionIdx), childJourneyId];
        const display = cyclePath.map((id) => `"${id}"`).join(" → ");
        if (debug) {
          console.error(
            `[@modular-react/journeys] Invoke would re-enter journey "${childJourneyId}" already on the active chain: ${display}. Aborting parent "${parent.id}".`,
          );
        }
        fireOnError(
          parentReg,
          parent,
          new Error(`Invoke cycle on chain: ${display}`),
          parentStep,
          "invoke",
        );
        applyTransitionLocal(
          parent,
          parentReg,
          {
            abort: {
              reason: "invoke-cycle",
              childJourneyId,
              chain: cyclePath,
              exit: exitName,
            },
          },
          { kind: "invoke" },
        );
        return false;
      }
    }

    // Depth guard. The chain reaching `parent` is `chain.length + 1`
    // (ancestors + parent); the new child would push it to
    // `chain.length + 2`. Compare against the resolved cap.
    const cap = resolveMaxCallStackDepth(chain, parentReg, childReg);
    const depthAfterInvoke = chain.length + 2;
    if (depthAfterInvoke > cap) {
      const chainIds = chain.map((r) => r.journeyId).concat(parent.journeyId, childJourneyId);
      const display = chainIds.map((id) => `"${id}"`).join(" → ");
      if (debug) {
        console.error(
          `[@modular-react/journeys] Invoke would exceed maxCallStackDepth (${cap}) — chain: ${display}. Aborting parent "${parent.id}".`,
        );
      }
      fireOnError(
        parentReg,
        parent,
        new Error(`Invoke would exceed depth cap ${cap} on chain ${display}`),
        parentStep,
        "invoke",
      );
      applyTransitionLocal(
        parent,
        parentReg,
        {
          abort: {
            reason: "invoke-stack-overflow",
            depth: depthAfterInvoke,
            cap,
            chain: chainIds,
            exit: exitName,
          },
        },
        { kind: "invoke" },
      );
      return false;
    }

    // Mint or load the child via the standard `start` path so persistence
    // and idempotency work uniformly. `start` returns an existing instance
    // id when the child's keyFor matches an in-flight one (rare here, but
    // fully supported).
    let childId: InstanceId;
    try {
      childId = runtime.start(spec.handle, spec.input as never);
    } catch (err) {
      if (debug) console.error("[@modular-react/journeys] runtime.start during invoke threw", err);
      fireOnError(parentReg, parent, err, parentStep, "invoke");
      applyTransitionLocal(
        parent,
        parentReg,
        { abort: { reason: "invoke-start-threw", error: err, exit: exitName } },
        { kind: "invoke" },
      );
      return false;
    }
    const child = instances.get(childId);
    if (!child) {
      // Defensive: start should have populated `instances`. If not, abort.
      applyTransitionLocal(
        parent,
        parentReg,
        { abort: { reason: "invoke-start-no-record", exit: exitName } },
        { kind: "invoke" },
      );
      return false;
    }

    // Wire the link in both directions.
    parent.activeChildId = childId;
    child.parent = { instanceId: parent.id, resumeName: spec.resume };
    childToParent.set(childId, parent.id);
    // Persist the child *now* that its parentLink is set — otherwise the
    // blob written during `runtime.start(...)` above has parentLink=undefined,
    // and a reload would resurrect the child with no back-pointer to the
    // parent's resume. Reuses the `childReg` looked up by the cycle/depth
    // guards above; that lookup is by `childJourneyId === child.journeyId`,
    // so it is the same registration record.
    const childPersistence = childReg?.options?.persistence;
    if (childPersistence) schedulePersist(child, childPersistence);
    // Bump the child's revision so subscribers picking up `instance.parent`
    // see the link on the very first read after the invoke.
    notify(child);
    return child;
  }

  /**
   * Local short-cut for the abort branch used by `beginInvoke`'s validation
   * failures — calls into the same shared transition machinery without
   * re-entering the invoke arm. The "Local" suffix marks it as the inner
   * sibling of the public `applyTransition`; both eventually fall into the
   * same persistence/notify tail.
   */
  function applyTransitionLocal(
    record: InstanceRecord,
    reg: RegisteredJourney,
    result: TransitionResult<ModuleTypeMap, unknown>,
    eventExtras?: {
      readonly kind?: TransitionEvent["kind"];
      readonly outcome?: TransitionEvent["outcome"];
      readonly resume?: TransitionEvent["resume"];
    },
  ) {
    applyTransition(record, reg, result, null, eventExtras);
  }

  /**
   * If `record` has a `parent` link AND has just reached a terminal status,
   * fire the parent's named resume handler with the child's outcome and
   * apply the result as the parent's next transition. Idempotent: clears
   * the parent's `activeChildId` and the `childToParent` entry so a second
   * call is a no-op.
   *
   * Edge: the parent may itself be terminal already (cascade-end raced
   * with a child completing) — in that case the resume is dropped, the
   * link is cleared, and the child's terminal stands on its own.
   */
  function applyResumeIfChild(child: InstanceRecord) {
    if (child.status !== "completed" && child.status !== "aborted") return;
    const parentLink = child.parent;
    if (!parentLink) return;
    const parentId = parentLink.instanceId;
    const parent = instances.get(parentId);
    // Always clear the bookkeeping, even if the parent is gone — leftover
    // entries would otherwise pin the child in `childToParent` forever.
    childToParent.delete(child.id);
    child.parent = null;
    if (!parent) return;
    // Only fire the resume when this child is still the parent's *active*
    // child. A racey end()/forget on the parent could have set
    // `activeChildId` to null already; treat that as "parent moved on".
    if (parent.activeChildId !== child.id) return;
    parent.activeChildId = null;
    if (parent.status !== "active") return;
    const parentReg = definitions.get(parent.journeyId);
    const parentStep = parent.step;
    if (!parentReg || !parentStep) return;

    const handler = lookupResume(parentReg, parentStep, parentLink.resumeName);
    if (!handler) {
      // The parent's journey definition was upgraded between invoke and
      // resume so the resume name is gone. Surface as an abort with a
      // discoverable reason — the parent's onAbort/onError see it and the
      // shell can decide whether to restart or surrender.
      if (debug) {
        console.warn(
          `[@modular-react/journeys] Resume "${parentLink.resumeName}" no longer declared on ${parentStep.moduleId}.${parentStep.entry} — aborting parent ${parent.id}.`,
        );
      }
      fireOnError(
        parentReg,
        parent,
        new Error(`Resume "${parentLink.resumeName}" missing`),
        parentStep,
        "resume",
      );
      applyTransition(
        parent,
        parentReg,
        {
          abort: {
            reason: "resume-missing",
            resume: parentLink.resumeName,
            childJourneyId: child.journeyId,
          },
        },
        null,
      );
      return;
    }

    const outcome: ChildOutcome<unknown> =
      child.status === "completed"
        ? { status: "completed", payload: child.terminalPayload }
        : { status: "aborted", reason: child.terminalPayload };

    let result: TransitionResult<ModuleTypeMap, unknown>;
    try {
      result = handler({
        state: parent.state,
        input: parentStep.input,
        outcome,
      }) as TransitionResult<ModuleTypeMap, unknown>;
    } catch (err) {
      if (debug) console.error("[@modular-react/journeys] resume handler threw", err);
      fireOnError(parentReg, parent, err, parentStep, "resume");
      applyTransition(
        parent,
        parentReg,
        {
          abort: {
            reason: "resume-threw",
            resume: parentLink.resumeName,
            error: err,
          },
        },
        null,
      );
      return;
    }
    if (result && typeof (result as { then?: unknown }).then === "function") {
      if (debug) {
        console.error(
          `[@modular-react/journeys] Resume handler "${parentLink.resumeName}" on ${parentStep.moduleId}.${parentStep.entry} returned a Promise. Resumes must be synchronous and pure.`,
        );
      }
      applyTransition(
        parent,
        parentReg,
        { abort: { reason: "resume-returned-promise", resume: parentLink.resumeName } },
        null,
        { kind: "resume", outcome, resume: parentLink.resumeName },
      );
      return;
    }
    // Tag the parent's transition as "resume" — same flow through
    // applyTransition, but `onTransition` consumers can filter by
    // `kind === "resume"` and read `outcome` / `resume` to correlate.
    applyTransition(parent, parentReg, result, null, {
      kind: "resume",
      outcome,
      resume: parentLink.resumeName,
    });
  }

  // ---------------------------------------------------------------------------
  // Transition application
  // ---------------------------------------------------------------------------

  function applyTransition(
    record: InstanceRecord,
    reg: RegisteredJourney,
    result: TransitionResult<ModuleTypeMap, unknown>,
    exitName: string | null,
    eventExtras?: {
      readonly kind?: TransitionEvent["kind"];
      readonly outcome?: TransitionEvent["outcome"];
      readonly resume?: TransitionEvent["resume"];
    },
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

    // Any step change clears the per-step bounce counter — the counter is
    // scoped to the step that fired the bouncing resumes; once we move
    // off that step, we're in a fresh per-step budget. Cleared up front
    // so all three step-advancing arms (next / complete / abort) inherit
    // the reset uniformly.
    if ("next" in result || "complete" in result || "abort" in result) {
      record.resumeBouncesAtStep = null;
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
      fireOnTransition(reg, record, previousStep, nextStep, exitName, eventExtras);
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
      fireOnTransition(reg, record, previousStep, null, exitName, eventExtras);
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
      fireOnTransition(reg, record, previousStep, null, exitName, eventExtras);
      fireOnAbort(reg, record, result.abort);
    } else if ("invoke" in result) {
      // Invoke a child journey from this step. The parent's step does NOT
      // change — the parent stays "active, with a child in flight." When
      // the child terminates, the runtime fires the parent's named resume
      // handler (declared on `def.resumes[mod][entry][name]`) with the
      // child's outcome and applies the result as the parent's next
      // transition.
      //
      // Bounce-limit guard: when this `{ invoke }` arm is the result of
      // a *resume* on the same step (kind === "resume"), the parent has
      // not advanced since the previous invoke at this step — that is a
      // "bounce." Cap the consecutive bounces so a malformed
      // resume → invoke → resume → invoke loop cannot spin indefinitely.
      // The check runs before `beginInvoke` so a rejected bounce never
      // mints a child instance.
      if (eventExtras?.kind === "resume") {
        const bounceCap = resolveBounceCap(reg);
        const prior = record.resumeBouncesAtStep;
        const nextCount = prior && prior.stepToken === record.stepToken ? prior.count + 1 : 1;
        if (nextCount > bounceCap) {
          if (debug) {
            console.error(
              `[@modular-react/journeys] Resume on "${record.journeyId}.${previousStep?.moduleId}.${previousStep?.entry}" would bounce ${nextCount} times in a row at the same step (cap ${bounceCap}). Aborting "${record.id}" to break the loop.`,
            );
          }
          fireOnError(
            reg,
            record,
            new Error(
              `Resume bounce limit exceeded (${bounceCap}) at ${previousStep?.moduleId}.${previousStep?.entry}`,
            ),
            previousStep,
            "resume",
          );
          // Re-enter the abort branch via the standard machinery — that
          // gives us the persist + notify + onAbort tail for free, and
          // fires `kind: "resume"` so telemetry filters work.
          applyTransition(
            record,
            reg,
            {
              abort: {
                reason: "resume-bounce-limit",
                cap: bounceCap,
                count: nextCount,
                resume: eventExtras.resume,
              },
            },
            null,
            { kind: "resume", outcome: eventExtras.outcome, resume: eventExtras.resume },
          );
          return;
        }
        record.resumeBouncesAtStep = { stepToken: record.stepToken, count: nextCount };
      }
      const childRecord = beginInvoke(record, reg, result.invoke, exitName);
      if (!childRecord) {
        // beginInvoke already applied the abort path on validation failure.
        // notify+persistence have run there too; bail without a second pass.
        return;
      }
      record.updatedAt = nowIso();
      // No step change → no stepToken bump → exit/goBack callbacks for the
      // parent step would still resolve, but `dispatchExit` short-circuits
      // on `record.activeChildId` (see the guard added there) so a stray
      // exit fires from the now-paused parent are dropped with a warning.
      fireOnTransition(reg, record, previousStep, previousStep, exitName, {
        kind: "invoke",
        child: { instanceId: childRecord.id, journeyId: childRecord.journeyId },
      });
    }

    const persistence = reg.options?.persistence;
    if (persistence) {
      if (record.status === "active") schedulePersist(record, persistence);
      else removePersisted(record, persistence);
    }

    notify(record);

    // After the parent's transition has settled (and any persistence has
    // been scheduled), check whether *this* record was a child whose
    // terminal we just applied — in which case the parent's named resume
    // fires now. Doing it after `notify(record)` keeps subscribers'
    // observed order intact: child's terminal first, parent's resume
    // second. `applyResumeIfChild` is a no-op for non-child or non-terminal
    // records.
    applyResumeIfChild(record);
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
    if (record.activeChildId) {
      // Parent step is paused awaiting a child's resume. Exits from the
      // parent step are dropped — same semantics as a stale stepToken or
      // a terminal record. The parent advances only via the resume.
      if (debug) {
        console.warn(
          `[@modular-react/journeys] Exit("${exitName}") dropped on instance ${record.id} — a child journey is in flight (activeChildId=${record.activeChildId}). The parent advances when the child resumes.`,
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
      activeChildId: record.activeChildId,
      // Defensive copy — `record.parent` is mutated when invoke/resume cycles
      // clear the link, and consumers diffing against a previously-read
      // `instance.parent` reference would otherwise see the mutation.
      parent: record.parent ? { ...record.parent } : null,
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
      parent: null,
      activeChildId: null,
      resumeBouncesAtStep: null,
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

    // Restore the parent ↔ child link state. The matching record on the
    // other side may not exist yet (cross-instance hydrate ordering varies),
    // but we lay down the local half so a subsequent hydrate of the other
    // half can finish the link via `relinkInvocations()`.
    if (blob.parentLink) {
      record.parent = {
        instanceId: blob.parentLink.parentInstanceId,
        resumeName: blob.parentLink.resumeName,
      };
    } else {
      record.parent = null;
    }
    if (blob.pendingInvoke) {
      // Adopt the recorded child id even if no live child record exists
      // yet — `relinkInvocations` will validate or rebuild on demand.
      record.activeChildId = blob.pendingInvoke.childInstanceId;
    } else {
      record.activeChildId = null;
    }
    // Restore the bounce counter. The persisted `stepToken` is from the
    // pre-hydrate runtime, so it cannot be compared against the new
    // `record.stepToken` (which we just bumped). We retain the count
    // and re-stamp the token to the *current* step so the counter
    // continues to police the same step. If the parent advances after
    // hydrate, the next applyTransition's reset-on-step-change clears
    // it — exactly matching pre-hydrate semantics.
    if (blob.resumeBouncesAtStep && Number.isFinite(blob.resumeBouncesAtStep.count)) {
      record.resumeBouncesAtStep = {
        stepToken: record.stepToken,
        count: Math.max(0, Math.floor(blob.resumeBouncesAtStep.count)),
      };
    } else {
      record.resumeBouncesAtStep = null;
    }
  }

  /**
   * Rebuild `childToParent` from records' in-memory `parent` /
   * `activeChildId` fields. Called after each hydrate path so a hydrate
   * that lands a child after its parent (or vice-versa) ends with a
   * consistent reverse map.
   *
   * Does NOT abort parents whose `activeChildId` points at a not-yet-loaded
   * child — the shell may be hydrating in stages, and a transient missing
   * child would otherwise eat the parent. Parents with a missing child
   * stay in `active` with the link set; their step exits are blocked
   * (see `dispatchExit`'s `activeChildId` guard), and the shell decides
   * whether to `runtime.end(parent)` or load the missing child later.
   * Idempotent — safe to call multiple times.
   */
  function relinkInvocations() {
    childToParent.clear();
    for (const child of instances.values()) {
      if (!child.parent) continue;
      const parent = instances.get(child.parent.instanceId);
      if (!parent) continue;
      if (parent.activeChildId !== child.id) continue;
      childToParent.set(child.id, parent.id);
    }
  }

  /**
   * Auto-rehydrate a child journey when a parent's blob carries a
   * `pendingInvoke.childPersistenceKey`. The runtime walks the persisted
   * link chain transparently so callers only need to `start()` the root —
   * the leaf comes back along with its parents. Recurses into the loaded
   * child's own `pendingInvoke` so deep chains (parent → child → grandchild)
   * restore in one sweep.
   *
   * Tolerant of missing pieces: a child blob that's gone from storage,
   * a child journey that's no longer registered, or a child journey
   * without persistence configured all leave the parent in the documented
   * "active with activeChildId set, exits blocked" state. The shell can
   * then `runtime.end(parentId)` to give up.
   *
   * Async loads return without resolving; the link is reconciled when the
   * persistence promise settles.
   */
  function tryRehydrateChild(parentRecord: InstanceRecord, parentBlob: SerializedJourney<unknown>) {
    const pi = parentBlob.pendingInvoke;
    if (!pi) return;
    if (instances.has(pi.childInstanceId)) return;
    if (!pi.childPersistenceKey) return;
    const childReg = definitions.get(pi.childJourneyId);
    if (!childReg) return;
    const childPersistence = childReg.options?.persistence as
      | JourneyPersistence<unknown>
      | undefined;
    if (!childPersistence) return;

    const childIndexed = indexKey(pi.childJourneyId, pi.childPersistenceKey);
    // If a different in-memory instance already owns this child key, leave
    // it alone — we don't want to clobber a user-driven `start()` of the
    // same child journey that happened to land first.
    if (keyIndex.has(childIndexed)) return;

    const loaded = probeLoad(childReg, childPersistence, pi.childPersistenceKey);

    const finishHydrate = (childBlob: SerializedJourney<unknown> | null) => {
      if (!childBlob) return;
      if (childBlob.status !== "active") return;
      // Race guards (matters for the async path): a parallel `start()` may
      // have populated the slot or the parent may have moved on.
      if (instances.has(pi.childInstanceId)) return;
      if (keyIndex.has(childIndexed)) return;
      if (parentRecord.activeChildId !== pi.childInstanceId) return;
      const childMigrated = migrateBlob(childReg, childBlob);
      if (!childMigrated.ok) return;
      const childRecord = createRecord(
        childReg,
        pi.childInstanceId,
        pi.childPersistenceKey,
        childMigrated.blob.state,
      );
      instances.set(pi.childInstanceId, childRecord);
      keyIndex.set(childIndexed, pi.childInstanceId);
      try {
        hydrateInto(childRecord, childMigrated.blob);
      } catch (err) {
        if (debug) console.error("[@modular-react/journeys] auto-rehydrate child failed", err);
        instances.delete(pi.childInstanceId);
        keyIndex.delete(childIndexed);
        return;
      }
      // Recurse: the child may itself have a pendingInvoke (grandchild).
      tryRehydrateChild(childRecord, childMigrated.blob);
      relinkInvocations();
      notify(childRecord);
      notify(parentRecord);
    };

    if (loaded && typeof (loaded as Promise<unknown>).then === "function") {
      void (loaded as Promise<SerializedJourney<unknown> | null>).then(
        (childBlob) => finishHydrate(childBlob),
        (err) => {
          if (debug)
            console.error(
              "[@modular-react/journeys] auto-rehydrate child persistence.load rejected",
              err,
            );
        },
      );
      return;
    }
    finishHydrate(loaded as SerializedJourney<unknown> | null);
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
              tryRehydrateChild(record, migrated.blob);
              relinkInvocations();
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
            tryRehydrateChild(record, migrated.blob);
            relinkInvocations();
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
      tryRehydrateChild(record, migrated.blob);
      relinkInvocations();
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
      // Cascade-end: a parent that gets force-terminated must take its
      // active child with it. Sever the parent ↔ child link first so the
      // child's terminal does NOT trigger the parent's resume (the parent
      // is already on its way out). Then end the child with a propagated
      // reason. Recurses naturally — a grandchild will be ended by the
      // child's `end()`.
      if (record.activeChildId) {
        const childId = record.activeChildId;
        record.activeChildId = null;
        const child = instances.get(childId);
        if (child && child.parent && child.parent.instanceId === record.id) {
          child.parent = null;
        }
        childToParent.delete(childId);
        // Use a distinct cascade reason so child telemetry can distinguish
        // "user closed parent" from "child aborted on its own."
        runtime.end(childId, { reason: "parent-ended", parentId: record.id, cause: reason });
      }
      // An outlet that unmounts mid-load should still be able to tear the
      // placeholder instance down. The journey never "started" as far as the
      // author is concerned, so skip `onAbandon` (it would see a null step)
      // and transition straight to `aborted` with the supplied reason.
      // The reason is passed through directly (no `{ reason }` wrap) so
      // `terminalPayload` matches what callers handed in — important when
      // a parent's resume handler reads `outcome.reason` after a cascade.
      if (record.status === "loading") {
        applyTransition(record, reg, { abort: reason ?? "abandoned" }, null);
        return;
      }
      const defaultAbort: TransitionResult<ModuleTypeMap, unknown> = {
        abort: reason ?? "abandoned",
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
          fireOnError(reg, record, err, record.step, "abandon");
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
      // A terminal child whose parent never picked up the resume (parent
      // already terminal, or detached) leaves the childToParent entry
      // dangling. Drop it on forget so the map cannot leak indefinitely.
      childToParent.delete(id);
      // If this terminal record still references a child (parent forgotten
      // before the child resumed back), null the orphan child's `parent`
      // pointer so a future child-terminal doesn't try to fire a resume
      // on a dropped instance.
      if (record.activeChildId) {
        const orphan = instances.get(record.activeChildId);
        if (orphan && orphan.parent && orphan.parent.instanceId === record.id) {
          orphan.parent = null;
          notify(orphan);
        }
        childToParent.delete(record.activeChildId);
        record.activeChildId = null;
      }
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
          childToParent.delete(id);
          if (record.activeChildId) {
            const orphan = instances.get(record.activeChildId);
            if (orphan && orphan.parent && orphan.parent.instanceId === record.id) {
              orphan.parent = null;
              notify(orphan);
            }
            childToParent.delete(record.activeChildId);
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
    // Component-level throws are step-phase errors — they happen during
    // a step component's render, not in the invoke / resume control plane.
    fireOnError(reg, record, err, step, "step");
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
    __synthesizeCompletion: (childId: InstanceId, payload: unknown) => {
      const child = instances.get(childId);
      if (!child) return;
      const reg = definitions.get(child.journeyId);
      if (!reg) return;
      // Drive the child through the standard transition machinery so
      // onComplete, onTransition, persistence, AND the parent's resume
      // hook all fire exactly as they would for a real `{ complete }`
      // transition. The shape we hand `applyTransition` is the same one
      // a transition handler would have returned.
      applyTransition(child, reg, { complete: payload }, null);
    },
    __synthesizeAbort: (childId: InstanceId, reason: unknown) => {
      const child = instances.get(childId);
      if (!child) return;
      const reg = definitions.get(child.journeyId);
      if (!reg) return;
      // Mirror of `__synthesizeCompletion` but for the abort arm. Lets the
      // simulator's `abortChild()` deliver a clean reason to the parent's
      // resume handler — equivalent to what the child's own
      // `{ abort: reason }` transition would produce, without going through
      // `runtime.end()`'s onAbandon path.
      applyTransition(child, reg, { abort: reason }, null);
    },
    __consumeRetry: (id: InstanceId, retryLimit: number) => {
      // Centralized retry-budget check: the outlet calls in here so the
      // counter increments under the runtime's ownership, and a future
      // shell that wants to track retries via telemetry hooks has a
      // single place to do so.
      const record = instances.get(id);
      if (!record) return false;
      if (record.retryCount >= retryLimit) return false;
      record.retryCount += 1;
      return true;
    },
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
  /**
   * Drive a child instance to a `completed` terminal with a synthesized
   * payload. Test-only — the simulator's `completeChild()` uses this to
   * exercise a parent's resume handler in isolation without enumerating
   * the child's transition graph. Routes through the standard
   * `applyTransition` so onComplete / onTransition / persistence / the
   * parent's resume all fire as they would for a real `{ complete }`.
   * No-op for unknown ids.
   */
  __synthesizeCompletion(childId: InstanceId, payload: unknown): void;
  /**
   * Sibling of `__synthesizeCompletion` for the abort arm — the
   * simulator's `abortChild()` uses this so the parent's resume handler
   * receives the reason directly, without the `{ reason }` wrap that
   * `runtime.end()` previously applied.
   */
  __synthesizeAbort(childId: InstanceId, reason: unknown): void;
  /**
   * Atomically attempt to consume one retry slot for `id`. Returns
   * `true` if the budget allowed the retry (counter incremented), or
   * `false` if `retryLimit` was already hit. Centralizing this in the
   * runtime keeps the budget in one place — the outlet only decides
   * whether the policy was `"retry"` and trusts the runtime for the
   * cap check.
   */
  __consumeRetry(id: InstanceId, retryLimit: number): boolean;
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
