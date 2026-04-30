import { createJourneyRuntime, getInternals } from "./runtime.js";
import { createTestHarness } from "./testing.js";
import type {
  AnyJourneyDefinition,
  InstanceId,
  JourneyDefinition,
  JourneyStep,
  ModuleTypeMap,
  SerializedJourney,
  TransitionEvent,
} from "./types.js";

/**
 * Headless simulator for a journey definition. Fires exits / goBack without
 * mounting React and exposes state / step / history / the recorded
 * `TransitionEvent` stream for assertions.
 *
 * Intended for pure-logic unit tests of transition graphs.
 */
export interface JourneySimulator<_TModules extends ModuleTypeMap, TState> {
  readonly journeyId: string;
  readonly instanceId: string;
  /** Current step — null once the journey completes or aborts. */
  readonly step: JourneyStep | null;
  /**
   * Same as `step`, but throws if the journey has terminated. Use this in
   * tests to skip optional chaining on the common "still running" path —
   * the throw spells out the unexpected status (`completed` / `aborted`)
   * and is far easier to debug than a `Cannot read property 'moduleId' of
   * null` thrown by an assertion line.
   */
  readonly currentStep: JourneyStep;
  readonly state: TState;
  readonly history: readonly JourneyStep[];
  readonly status: "loading" | "active" | "completed" | "aborted";
  /**
   * Every `TransitionEvent` the runtime has fired since the simulator
   * started. Useful for assertions on analytics rules without having to
   * attach an `onTransition` by hand.
   */
  readonly transitions: readonly TransitionEvent[];
  /**
   * Terminal payload from the `complete` / `abort` transition that ended
   * the journey. `undefined` while the journey is still active.
   */
  readonly terminalPayload: unknown;

  fireExit(name: string, output?: unknown): void;
  goBack(): void;
  end(reason?: unknown): void;
  /**
   * Serialize the simulator's current instance into the same blob shape
   * a persistence adapter would see. Useful for pinning the exact blob
   * shape tests expect to round-trip, and for asserting `rollbackSnapshots`
   * alignment with `history` without reaching into runtime internals.
   */
  serialize(): SerializedJourney<TState>;

  // -------------------------------------------------------------------------
  // Invoke / resume helpers — present on every simulator, no-op when no
  // child is in flight.
  // -------------------------------------------------------------------------

  /**
   * Active child instance id when this journey has invoked another. `null`
   * when the journey is not currently awaiting a child.
   */
  readonly activeChildId: InstanceId | null;

  /**
   * Sub-simulator for the currently-invoked child journey, if any. The
   * returned simulator drives the child via the same runtime — once the
   * child terminates, the parent's resume fires automatically and this
   * sim's `state` / `step` reflect the post-resume position.
   *
   * `null` when no child is in flight (parent has not invoked, or the
   * child has already resumed back into the parent).
   */
  readonly activeChild: JourneySimulator<ModuleTypeMap, unknown> | null;

  /**
   * Synthesize a `{ status: "completed" }` outcome on the active child
   * without enumerating its steps. Useful for unit-testing a parent's
   * resume handler in isolation. Throws if no child is in flight.
   */
  completeChild(payload: unknown): void;

  /**
   * Synthesize a `{ status: "aborted" }` outcome on the active child.
   * Throws if no child is in flight.
   */
  abortChild(reason?: unknown): void;
}

/**
 * Options for {@link simulateJourney}. Pass `children` to register
 * additional journey definitions reachable via `invoke` from the
 * primary journey, so the simulator can drive child sub-flows
 * end-to-end. The `mockChildOutcomes` shortcut is preferred when the
 * child's transition path is irrelevant to the test.
 */
export interface SimulateJourneyOptions {
  /**
   * Child journey definitions the primary journey can `invoke`. Without
   * this, an `invoke` from the primary will abort with
   * `invoke-unknown-journey`. Order does not matter; mutually-invoking
   * journeys all go in here.
   */
  readonly children?: readonly AnyJourneyDefinition[];
}

/**
 * Headlessly drive a journey definition — see {@link JourneySimulator}.
 *
 * The second argument is the journey's `TInput`. When a journey declares
 * no input (`TInput extends void`), callers can omit it entirely:
 *
 * ```ts
 * simulateJourney(noInputJourney);          // no input required
 * simulateJourney(inputJourney, { id: 1 }); // input required and typed
 * ```
 *
 * Pass `options.children` when the primary journey can `invoke` child
 * journeys — every reachable child must be registered or the parent
 * will abort with `invoke-unknown-journey`.
 */
export function simulateJourney<TModules extends ModuleTypeMap, TState, TInput>(
  definition: JourneyDefinition<TModules, TState, TInput>,
  ...rest: [TInput] extends [void]
    ? [] | [input?: TInput] | [input: TInput, options: SimulateJourneyOptions]
    : [input: TInput] | [input: TInput, options: SimulateJourneyOptions]
): JourneySimulator<TModules, TState> {
  const input = (rest.length > 0 ? rest[0] : undefined) as TInput;
  const options = (rest.length > 1 ? rest[1] : undefined) as SimulateJourneyOptions | undefined;
  // Attach our own recorder on top of whatever `onTransition` the definition
  // declares — the runtime already invokes both (definition first, then
  // registration option), so this does not shadow the journey's own hook.
  const transitions: TransitionEvent[] = [];
  const recorder = (ev: TransitionEvent) => {
    transitions.push(ev);
  };
  const registered = [
    {
      definition: definition as AnyJourneyDefinition,
      options: { onTransition: recorder },
    },
    ...(options?.children ?? []).map((child) => ({
      definition: child,
      options: { onTransition: recorder },
    })),
  ];
  const runtime = createJourneyRuntime(registered);
  const instanceId = runtime.start(definition.id, input);
  const harness = createTestHarness(runtime);
  const internals = getInternals(runtime);

  return wrapInstanceAsSim<TModules, TState>(
    runtime,
    harness,
    internals,
    transitions,
    instanceId,
    definition.id,
  );
}

/**
 * Build a simulator wrapper around a runtime instance. Used for both the
 * primary sim returned by `simulateJourney` and any child sims surfaced
 * via `sim.activeChild`. Sharing this constructor keeps the two surfaces
 * structurally identical so test code drives parent and child the same
 * way.
 */
function wrapInstanceAsSim<TModules extends ModuleTypeMap, TState>(
  runtime: ReturnType<typeof createJourneyRuntime>,
  harness: ReturnType<typeof createTestHarness>,
  internals: ReturnType<typeof getInternals>,
  transitions: TransitionEvent[],
  instanceId: InstanceId,
  journeyId: string,
): JourneySimulator<TModules, TState> {
  function snapshot() {
    return harness.inspect<TState>(instanceId);
  }
  function instanceOrThrow() {
    const inst = runtime.getInstance(instanceId);
    if (!inst) throw new Error(`[simulateJourney] instance ${instanceId} not found`);
    return inst;
  }
  return {
    journeyId,
    instanceId,
    get step() {
      return snapshot().step;
    },
    get currentStep() {
      const snap = snapshot();
      if (!snap.step) {
        throw new Error(
          `[simulateJourney] no current step (status=${snap.status}). Use \`step\` if a null step is expected.`,
        );
      }
      return snap.step;
    },
    get state() {
      return snapshot().state;
    },
    get history() {
      return snapshot().history;
    },
    get status() {
      return snapshot().status;
    },
    get transitions() {
      return transitions;
    },
    get terminalPayload() {
      return instanceOrThrow().terminalPayload;
    },
    get activeChildId() {
      return instanceOrThrow().activeChildId;
    },
    get activeChild() {
      const inst = instanceOrThrow();
      const childId = inst.activeChildId;
      if (!childId) return null;
      const child = runtime.getInstance(childId);
      if (!child) return null;
      return wrapInstanceAsSim<ModuleTypeMap, unknown>(
        runtime,
        harness,
        internals,
        transitions,
        childId,
        child.journeyId,
      );
    },
    serialize() {
      return instanceOrThrow().serialize() as SerializedJourney<TState>;
    },
    fireExit(name, output) {
      harness.fireExit(instanceId, name, output);
    },
    goBack() {
      harness.goBack(instanceId);
    },
    end(reason) {
      runtime.end(instanceId, reason);
    },
    completeChild(payload) {
      const childId = instanceOrThrow().activeChildId;
      if (!childId) {
        throw new Error(
          `[simulateJourney] completeChild() called on instance "${instanceId}" but no child is in flight.`,
        );
      }
      internals.__synthesizeCompletion(childId, payload);
    },
    abortChild(reason) {
      const childId = instanceOrThrow().activeChildId;
      if (!childId) {
        throw new Error(
          `[simulateJourney] abortChild() called on instance "${instanceId}" but no child is in flight.`,
        );
      }
      runtime.end(childId, reason);
    },
  };
}
