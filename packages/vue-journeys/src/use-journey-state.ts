import { computed, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from "vue";
import type { InstanceId, JourneyInstance } from "@modular-frontend/journeys-engine";

import { useInstanceSnapshot, useLeafId } from "./instance-hooks.js";
import { useJourneyContext } from "./provider.js";

/**
 * Sugar over {@link useJourneyInstance}: returns a `ComputedRef` of the
 * instance's `state` (or `null` when the runtime / id / instance is
 * unavailable). `TState` is the journey's state type — pass it at the call
 * site.
 *
 * The React analog returns a plain `TState | null`; the Vue port returns a
 * `ComputedRef` so it stays reactive in templates and `watch` (the PR-23
 * convention for reactive-source composables). Read `.value` at the call site.
 *
 * Prefer {@link useJourneyInstance} when the host needs more than `state`
 * (`step` / `status` / `terminalPayload`).
 */
export function useJourneyState<TState>(
  instanceId: MaybeRefOrGetter<InstanceId | null>,
): ComputedRef<TState | null> {
  const inst = useJourneyInstance(instanceId);
  return computed(() => (inst.value ? (inst.value.state as TState) : null));
}

/**
 * Subscribe to a journey instance and return a `ShallowRef` of its full
 * snapshot (`status`, `step`, `state`, `terminalPayload`, …), or `null` when
 * no `<JourneyProvider>` is mounted or the id is unknown. Tearing-free via the
 * `shallowRef` bridge in {@link useInstanceSnapshot}. The primitive of which
 * {@link useJourneyState} is sugar; symmetric with
 * {@link useActiveLeafJourneyInstance} for the leaf-walking case.
 */
export function useJourneyInstance(
  instanceId: MaybeRefOrGetter<InstanceId | null>,
): ShallowRef<JourneyInstance | null> {
  const ctx = useJourneyContext();
  return useInstanceSnapshot(ctx?.runtime ?? null, instanceId);
}

/**
 * Sugar over {@link useActiveLeafJourneyInstance}: returns a `ComputedRef` of
 * the leaf instance's `state` as `TState`. `.value` is `null` when no
 * provider, the root id is unknown, or the leaf has been forgotten.
 *
 * Prefer {@link useActiveLeafJourneyInstance} when the leaf can be any of
 * several journeys — typing this composable as `<ParentState | ChildState>`
 * leaves the caller without a discriminator, whereas the instance form gives a
 * typed `inst.journeyId` to switch on.
 */
export function useActiveLeafJourneyState<TState>(
  rootInstanceId: MaybeRefOrGetter<InstanceId | null>,
): ComputedRef<TState | null> {
  const inst = useActiveLeafJourneyInstance(rootInstanceId);
  return computed(() => (inst.value ? (inst.value.state as TState) : null));
}

/**
 * Walks `activeChildId` from `rootInstanceId` down to the deepest descendant
 * and returns a `ShallowRef` of that leaf's full `JourneyInstance`. The
 * recommended primitive when the host doesn't know the leaf's depth (a parent
 * that may or may not be in an invoked sub-flow) — pair with `inst.journeyId`
 * as a discriminator instead of typing the state composable as a union and
 * asserting manually. Re-subscribes as the chain grows (parent invokes a
 * child, grandchild starts) or shrinks (child terminates and parent resumes).
 *
 * `.value` is `null` under the same conditions as {@link useJourneyInstance}.
 */
export function useActiveLeafJourneyInstance(
  rootInstanceId: MaybeRefOrGetter<InstanceId | null>,
): ShallowRef<JourneyInstance | null> {
  const ctx = useJourneyContext();
  const runtime = ctx?.runtime ?? null;
  const leafId = useLeafId(runtime, rootInstanceId, true);
  return useInstanceSnapshot(runtime, leafId);
}
