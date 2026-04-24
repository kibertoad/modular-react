import type { InstanceId, JourneyRuntime, JourneyStatus, JourneyStep } from "@modular-react/core";

import { getInternals } from "./runtime.js";

export { simulateJourney } from "./simulate-journey.js";
export type { JourneySimulator } from "./simulate-journey.js";

/**
 * Snapshot of the mutable runtime record for a single instance. Returned by
 * `JourneyTestHarness.inspect` so tests can assert on fields that the
 * public `JourneyInstance` surface intentionally does not expose (stepToken,
 * retryCount). Everything else is also available via `runtime.getInstance`.
 */
export interface InstanceSnapshot<TState = unknown> {
  readonly status: JourneyStatus;
  readonly step: JourneyStep | null;
  readonly state: TState;
  readonly history: readonly JourneyStep[];
  readonly stepToken: number;
  readonly retryCount: number;
}

/**
 * Test-only accessor that drives a runtime's internals from the outside —
 * fire exits, walk back, peek at per-instance state. Prefer
 * {@link simulateJourney} for pure-logic transition tests; use this when you
 * already have a live runtime (e.g. one produced by the registry) and need
 * to poke it from a test without mounting the outlet.
 *
 * The harness is the supported replacement for directly importing the
 * runtime's `__`-prefixed internals, which are kept off the public export
 * surface intentionally.
 */
export interface JourneyTestHarness {
  fireExit(id: InstanceId, name: string, output?: unknown): void;
  goBack(id: InstanceId): void;
  inspect<TState = unknown>(id: InstanceId): InstanceSnapshot<TState>;
}

export function createTestHarness(runtime: JourneyRuntime): JourneyTestHarness {
  const internals = getInternals(runtime);

  function recordOrThrow(id: InstanceId) {
    const record = internals.__getRecord(id);
    if (!record) {
      throw new Error(
        `[@modular-react/journeys/testing] No instance with id "${id}". Pass the id returned by runtime.start(...).`,
      );
    }
    return record;
  }

  return {
    fireExit(id, name, output) {
      const record = recordOrThrow(id);
      const reg = internals.__getRegistered(record.journeyId);
      if (!reg) {
        throw new Error(
          `[@modular-react/journeys/testing] Journey "${record.journeyId}" is not registered with this runtime.`,
        );
      }
      // Calling fireExit on a loading instance is a silent no-op at the
      // runtime level (the runtime has no step to resolve against yet).
      // In tests this almost always indicates the caller forgot to await
      // the persistence load probe. Throw early so the test fails on the
      // offending call instead of on a later `expect(step?.entry)` read.
      if (record.status === "loading") {
        throw new Error(
          `[@modular-react/journeys/testing] fireExit("${name}") called on instance "${id}" while status=loading. ` +
            `Await the runtime's async load probe (typically \`await Promise.resolve()\` a few times, or expose a subscribe hook in your test) before dispatching exits.`,
        );
      }
      if (record.status !== "active") {
        throw new Error(
          `[@modular-react/journeys/testing] fireExit("${name}") called on terminal instance "${id}" (status=${record.status}).`,
        );
      }
      internals.__bindStepCallbacks(record, reg).exit(name, output);
    },
    goBack(id) {
      const record = recordOrThrow(id);
      const reg = internals.__getRegistered(record.journeyId);
      if (!reg) {
        throw new Error(
          `[@modular-react/journeys/testing] Journey "${record.journeyId}" is not registered with this runtime.`,
        );
      }
      if (record.status === "loading") {
        throw new Error(
          `[@modular-react/journeys/testing] goBack() called on instance "${id}" while status=loading. ` +
            `Await the runtime's async load probe before dispatching.`,
        );
      }
      const callbacks = internals.__bindStepCallbacks(record, reg);
      if (!callbacks.goBack) {
        // Silently no-oping here would quietly "pass" a test that expects
        // back navigation to work — the common `goBack walks back…` pattern
        // asserts state *after* the call, so a no-op masks the wiring bug.
        // Throw with context so the test fails on the offending call instead.
        const stepLabel = record.step
          ? `${record.step.moduleId}.${record.step.entry}`
          : "(no step)";
        throw new Error(
          `[@modular-react/journeys/testing] goBack is unavailable on instance "${id}" (step=${stepLabel}). ` +
            `The journey's transition must declare allowBack: true AND the current step must have at least one history entry.`,
        );
      }
      callbacks.goBack();
    },
    inspect<TState = unknown>(id: InstanceId): InstanceSnapshot<TState> {
      const record = recordOrThrow(id);
      // Snapshot — `history` is a live array on the runtime record and will
      // grow as the journey advances. Copy so assertions captured by the
      // caller stay stable when the next `fireExit` runs.
      return {
        status: record.status,
        step: record.step,
        state: record.state as TState,
        history: [...record.history],
        stepToken: record.stepToken,
        retryCount: record.retryCount,
      };
    },
  };
}
