import {
  computed,
  shallowRef,
  toValue,
  watchEffect,
  type ComputedRef,
  type MaybeRefOrGetter,
  type ShallowRef,
} from "vue";
import type {
  InstanceId,
  JourneyInstance,
  JourneyRuntime,
} from "@modular-frontend/journeys-engine";

/**
 * Sanity bound to break a corrupted cycle in the activeChild graph.
 * Legitimate invoke nesting is not expected to approach this depth — if a
 * real product stacks deeper, surface a knob via `JourneyRuntimeOptions`
 * rather than raising the constant blindly. Intentionally not exported:
 * the cap is implementation detail, not a knob. Matches the React source.
 */
const MAX_CHAIN_DEPTH = 64;

const EMPTY_CHAIN: readonly InstanceId[] = Object.freeze([]);

/**
 * Subscribe to a single instance and return a `ShallowRef` of its current
 * snapshot, or `null` when runtime / id is missing or the instance has been
 * forgotten. The Vue analog of the React `useInstanceSnapshot` (which uses
 * `useSyncExternalStore`): a `watchEffect` seeds the ref, subscribes, and
 * re-subscribes whenever `instanceId` changes.
 *
 * `instanceId` accepts a plain value, a ref, or a getter. Reactive ids are
 * the point of the leaf-walking composables: `useActiveLeafJourneyInstance`
 * feeds a `ComputedRef` leaf id here, so the snapshot re-subscribes as the
 * active chain grows (parent invokes a child) or shrinks (child terminates).
 * The subscribe callback reads the *current* id so an in-flight notification
 * that arrives after an id swap still resolves against the live instance.
 *
 * The `watchEffect` uses the default (pre) flush: the initial subscription is
 * established synchronously at setup, runtime events push snapshots into the
 * `shallowRef` synchronously (matching React's tearing-free reads), and only
 * re-subscription on an id change is deferred to the next tick — so a
 * changing-leaf test awaits `nextTick()` before the swap is observed.
 */
export function useInstanceSnapshot(
  runtime: JourneyRuntime | null,
  instanceId: MaybeRefOrGetter<InstanceId | null>,
): ShallowRef<JourneyInstance | null> {
  const snapshot = shallowRef<JourneyInstance | null>(null);

  const readCurrent = (): JourneyInstance | null => {
    const id = toValue(instanceId);
    if (!runtime || !id) return null;
    return runtime.getInstance(id);
  };

  watchEffect((onCleanup) => {
    const id = toValue(instanceId);
    if (!runtime || !id) {
      snapshot.value = null;
      return;
    }
    snapshot.value = runtime.getInstance(id);
    const unsubscribe = runtime.subscribe(id, () => {
      snapshot.value = readCurrent();
    });
    onCleanup(unsubscribe);
  });

  return snapshot;
}

/**
 * Walk `activeChildId` from `rootId` down to the deepest descendant, returning
 * a `ShallowRef` of the full chain. Subscribes to every instance in the chain
 * and re-subscribes as the chain grows / shrinks. Pass `enabled: false` to
 * short-circuit the walk (collapses to `[rootId]`) — used by the outlet's
 * `leafOnly` opt-out (PR-31). Null `runtime` / `rootId` yields an empty chain
 * so callers can invoke this composable unconditionally even before a runtime
 * is mounted.
 *
 * The dynamic per-instance subscriptions are managed by hand (as in the React
 * source) rather than through Vue reactivity, since they rewire on runtime
 * events, not on tracked dependencies. The `watchEffect` only re-runs — tearing
 * down and rebuilding the whole chain — when `rootId` or `enabled` change.
 */
export function useCallChain(
  runtime: JourneyRuntime | null,
  rootId: MaybeRefOrGetter<InstanceId | null>,
  enabled: MaybeRefOrGetter<boolean>,
): ShallowRef<readonly InstanceId[]> {
  const chainRef = shallowRef<readonly InstanceId[]>(EMPTY_CHAIN);

  // Cache by the joined-id signature so the ref keeps identity when the chain
  // hasn't actually shifted — the Vue analog of the React `cacheRef` guard, so
  // an unrelated state change on a chain member doesn't churn the ref.
  let lastKey: string | null = null;
  const setChain = (chain: readonly InstanceId[]): void => {
    const key = chain.join(">");
    if (lastKey === key) return;
    lastKey = key;
    chainRef.value = chain.length === 0 ? EMPTY_CHAIN : chain;
  };

  watchEffect((onCleanup) => {
    const root = toValue(rootId);
    const enabledNow = toValue(enabled);
    if (!runtime || !root) {
      setChain(EMPTY_CHAIN);
      return;
    }

    const unsubs = new Map<InstanceId, () => void>();
    let stopped = false;

    const rewire = (): void => {
      if (stopped) return;
      const seen = new Set<InstanceId>();
      const chain: InstanceId[] = [];
      let id: InstanceId | null = root;
      let depth = 0;
      while (id && depth < MAX_CHAIN_DEPTH) {
        if (seen.has(id)) break;
        seen.add(id);
        chain.push(id);
        if (!unsubs.has(id)) {
          unsubs.set(id, runtime.subscribe(id, rewire));
        }
        const inst = runtime.getInstance(id);
        id = enabledNow && inst ? inst.activeChildId : null;
        depth += 1;
      }
      for (const [subscribedId, unsub] of unsubs) {
        if (!seen.has(subscribedId)) {
          unsub();
          unsubs.delete(subscribedId);
        }
      }
      setChain(chain);
    };

    rewire();
    onCleanup(() => {
      stopped = true;
      for (const unsub of unsubs.values()) unsub();
      unsubs.clear();
    });
  });

  return chainRef;
}

/**
 * Last id in the active chain — `rootId` when no child is in flight, `null`
 * when runtime / rootId are missing. Returns a `ComputedRef` that tracks the
 * chain, so feeding it to {@link useInstanceSnapshot} re-subscribes the
 * snapshot as the leaf moves.
 */
export function useLeafId(
  runtime: JourneyRuntime | null,
  rootId: MaybeRefOrGetter<InstanceId | null>,
  enabled: MaybeRefOrGetter<boolean>,
): ComputedRef<InstanceId | null> {
  const chain = useCallChain(runtime, rootId, enabled);
  return computed(() => chain.value[chain.value.length - 1] ?? toValue(rootId));
}
