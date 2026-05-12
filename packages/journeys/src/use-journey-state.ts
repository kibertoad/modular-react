import type { InstanceId } from "@modular-react/core";

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
  const ctx = useJourneyContext();
  const runtime = ctx?.runtime ?? null;
  const leafId = useLeafId(runtime, rootInstanceId, true);
  const inst = useInstanceSnapshot(runtime, leafId);
  return inst ? (inst.state as TState) : null;
}
