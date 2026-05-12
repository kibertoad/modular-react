import type { InstanceId, JourneyInstance } from "@modular-react/core";

import { useInstanceSnapshot, useLeafId } from "./instance-hooks.js";
import { useJourneyContext } from "./provider.js";

/**
 * Sugar over {@link useJourneyInstance}: returns the instance's `state`
 * (or `null` when the runtime / id / instance is unavailable).
 * `TState` is the journey's state type — pass it at the call site.
 *
 * Prefer {@link useJourneyInstance} when the host needs more than
 * `state` (`step` / `status` / `terminalPayload`).
 */
export function useJourneyState<TState>(instanceId: InstanceId | null): TState | null {
  const inst = useJourneyInstance(instanceId);
  return inst ? (inst.state as TState) : null;
}

/**
 * Subscribe to a journey instance and return its full snapshot
 * (`status`, `step`, `state`, `terminalPayload`, …), or `null` when no
 * `<JourneyProvider>` is mounted or the id is unknown. Tearing-free via
 * `useSyncExternalStore`. The primitive of which {@link useJourneyState}
 * is sugar; symmetric with {@link useActiveLeafJourneyInstance} for the
 * leaf-walking case.
 */
export function useJourneyInstance(instanceId: InstanceId | null): JourneyInstance | null {
  const ctx = useJourneyContext();
  return useInstanceSnapshot(ctx?.runtime ?? null, instanceId);
}

/**
 * Sugar over {@link useActiveLeafJourneyInstance}: returns the leaf
 * instance's `state` as `TState`. Returns `null` when no provider, the
 * root id is unknown, or the leaf has been forgotten.
 *
 * Prefer {@link useActiveLeafJourneyInstance} when the leaf can be any
 * of several journeys — typing this hook as `<ParentState | ChildState>`
 * leaves the caller without a discriminator, whereas the instance form
 * gives a typed `inst.journeyId` to switch on.
 */
export function useActiveLeafJourneyState<TState>(
  rootInstanceId: InstanceId | null,
): TState | null {
  const inst = useActiveLeafJourneyInstance(rootInstanceId);
  return inst ? (inst.state as TState) : null;
}

/**
 * Walks `activeChildId` from `rootInstanceId` down to the deepest
 * descendant and returns that leaf's full `JourneyInstance`. The
 * recommended primitive when the host doesn't know the leaf's depth
 * (a parent that may or may not be in an invoked sub-flow) — pair with
 * `inst.journeyId` as a discriminator instead of typing the state hook
 * as a union and asserting manually. Re-subscribes as the chain grows
 * (parent invokes a child, grandchild starts) or shrinks (child
 * terminates and parent resumes).
 *
 * Returns `null` under the same conditions as {@link useJourneyInstance}.
 */
export function useActiveLeafJourneyInstance(
  rootInstanceId: InstanceId | null,
): JourneyInstance | null {
  const ctx = useJourneyContext();
  const runtime = ctx?.runtime ?? null;
  const leafId = useLeafId(runtime, rootInstanceId, true);
  return useInstanceSnapshot(runtime, leafId);
}
