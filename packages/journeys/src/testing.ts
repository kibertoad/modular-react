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
      internals.__bindStepCallbacks(record, reg).goBack?.();
    },
    inspect<TState = unknown>(id: InstanceId): InstanceSnapshot<TState> {
      const record = recordOrThrow(id);
      return {
        status: record.status,
        step: record.step,
        state: record.state as TState,
        history: record.history,
        stepToken: record.stepToken,
        retryCount: record.retryCount,
      };
    },
  };
}
