import type { InstanceId, JourneyInstance } from "@modular-react/core";

import { useInstanceSnapshot, useLeafId } from "./instance-hooks.js";
import { useJourneyContext } from "./provider.js";

/**
 * Subscribe to a journey instance and return its current `state`, or
 * `null` when no `<JourneyProvider>` is mounted or the id is unknown.
 * Tearing-free via `useSyncExternalStore`. `TState` is the journey's
 * state type — pass it explicitly from a typed call site.
 *
 * ```ts
 * const state = useJourneyState<MyState>(instanceId);
 * if (!state) return null;
 * ```
 */
export function useJourneyState<TState>(instanceId: InstanceId | null): TState | null {
  const ctx = useJourneyContext();
  const inst = useInstanceSnapshot(ctx?.runtime ?? null, instanceId);
  return inst ? (inst.state as TState) : null;
}

/**
 * Like {@link useJourneyState}, but follows `activeChildId` down the
 * chain and returns the *leaf* instance's state. Subscribes to every
 * instance along the way so a host rendering inside an invoked child
 * journey sees the child's state directly.
 */
export function useActiveLeafJourneyState<TState>(
  rootInstanceId: InstanceId | null,
): TState | null {
  const inst = useActiveLeafJourneyInstance(rootInstanceId);
  return inst ? (inst.state as TState) : null;
}

/**
 * Like {@link useActiveLeafJourneyState}, but returns the full leaf
 * `JourneyInstance` (with `step`, `status`, `terminalPayload`, …) instead
 * of just its `state`. Use this when a host needs to read more than
 * `state` from the leaf — for example, the current step's `moduleId` /
 * `entry` to drive a breadcrumb, or `status` to gate UI off `completed`
 * / `aborted` — without pairing this hook with `useJourneyCallStack`
 * and a manual `runtime.getInstance(leafId)`.
 *
 * Returns `null` under the same conditions as the other hooks
 * (no provider, unknown root id, forgotten instance).
 */
export function useActiveLeafJourneyInstance(
  rootInstanceId: InstanceId | null,
): JourneyInstance | null {
  const ctx = useJourneyContext();
  const runtime = ctx?.runtime ?? null;
  const leafId = useLeafId(runtime, rootInstanceId, true);
  return useInstanceSnapshot(runtime, leafId);
}
