import { createJourneyRuntime } from "./runtime.js";
import { createTestHarness } from "./testing.js";
import type {
  AnyJourneyDefinition,
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
}

export function simulateJourney<TModules extends ModuleTypeMap, TState, TInput>(
  definition: JourneyDefinition<TModules, TState, TInput>,
  input: TInput,
): JourneySimulator<TModules, TState> {
  // Attach our own recorder on top of whatever `onTransition` the definition
  // declares — the runtime already invokes both (definition first, then
  // registration option), so this does not shadow the journey's own hook.
  const transitions: TransitionEvent[] = [];
  const runtime = createJourneyRuntime([
    {
      definition: definition as AnyJourneyDefinition,
      options: {
        onTransition: (ev) => {
          transitions.push(ev);
        },
      },
    },
  ]);
  const instanceId = runtime.start(definition.id, input);
  const harness = createTestHarness(runtime);

  function snapshot() {
    return harness.inspect<TState>(instanceId);
  }

  function instanceOrThrow() {
    const inst = runtime.getInstance(instanceId);
    if (!inst) throw new Error(`[simulateJourney] instance ${instanceId} not found`);
    return inst;
  }

  return {
    journeyId: definition.id,
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
  };
}
