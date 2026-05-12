import { useMemo, useRef, useSyncExternalStore } from "react";
import type { InstanceId, JourneyInstance, JourneyRuntime } from "@modular-react/core";

/**
 * Sanity bound to break a corrupted cycle in the activeChild graph.
 * Legitimate invoke nesting is not expected to approach this depth — if a
 * real product stacks deeper, surface a knob via `JourneyRuntimeOptions`
 * rather than raising the constant blindly. Intentionally not exported:
 * the cap is implementation detail, not a knob.
 */
const MAX_CHAIN_DEPTH = 64;

/**
 * Subscribe to a single instance and return its current snapshot, or
 * `null` when runtime / id is missing or the instance has been forgotten.
 * Tearing-free via `useSyncExternalStore`.
 */
export function useInstanceSnapshot(
  runtime: JourneyRuntime | null,
  instanceId: InstanceId | null,
): JourneyInstance | null {
  const subscribe = useMemo(
    () => (listener: () => void) => {
      if (!runtime || !instanceId) return () => {};
      return runtime.subscribe(instanceId, listener);
    },
    [runtime, instanceId],
  );
  const getSnapshot = () => {
    if (!runtime || !instanceId) return null;
    return runtime.getInstance(instanceId);
  };
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Walk `activeChildId` from `rootId` down to the deepest descendant,
 * returning the full chain. Subscribes to every instance in the chain
 * and re-subscribes as the chain grows / shrinks. Pass `enabled: false`
 * to short-circuit the walk (collapses to `[rootId]`) — used by the
 * outlet's `leafOnly` opt-out. Null `runtime` / `rootId` returns an
 * empty chain so callers can invoke this hook unconditionally even
 * before a runtime is mounted.
 */
export function useCallChain(
  runtime: JourneyRuntime | null,
  rootId: InstanceId | null,
  enabled: boolean,
): readonly InstanceId[] {
  const subscribe = useMemo(
    () => (listener: () => void) => {
      if (!runtime || !rootId) return () => {};
      const unsubs = new Map<InstanceId, () => void>();
      let stopped = false;
      const fire = () => {
        if (stopped) return;
        rewire();
        listener();
      };
      const rewire = () => {
        const seen = new Set<InstanceId>();
        let id: InstanceId | null = rootId;
        let depth = 0;
        while (id && depth < MAX_CHAIN_DEPTH) {
          if (seen.has(id)) break;
          seen.add(id);
          if (!unsubs.has(id)) {
            unsubs.set(id, runtime.subscribe(id, fire));
          }
          const inst = runtime.getInstance(id);
          id = enabled && inst ? inst.activeChildId : null;
          depth += 1;
        }
        for (const [subscribedId, unsub] of unsubs) {
          if (!seen.has(subscribedId)) {
            unsub();
            unsubs.delete(subscribedId);
          }
        }
      };
      rewire();
      return () => {
        stopped = true;
        for (const unsub of unsubs.values()) unsub();
        unsubs.clear();
      };
    },
    [runtime, rootId, enabled],
  );
  // `resolveChain` returns a fresh array on every call; cache by the
  // joined-id signature so `useSyncExternalStore` bails on identity
  // checks when the chain hasn't actually shifted.
  const cacheRef = useRef<{ key: string; chain: readonly InstanceId[] } | null>(null);
  const getStableSnapshot = () => {
    if (!runtime || !rootId) return EMPTY_CHAIN;
    const fresh = resolveChain(runtime, rootId, enabled);
    const key = fresh.join(">");
    if (cacheRef.current && cacheRef.current.key === key) return cacheRef.current.chain;
    cacheRef.current = { key, chain: fresh };
    return fresh;
  };
  return useSyncExternalStore(subscribe, getStableSnapshot, getStableSnapshot);
}

/**
 * Last id in the active chain — `rootId` when no child is in flight,
 * `null` when runtime / rootId are missing.
 */
export function useLeafId(
  runtime: JourneyRuntime | null,
  rootId: InstanceId | null,
  enabled: boolean,
): InstanceId | null {
  const chain = useCallChain(runtime, rootId, enabled);
  return chain[chain.length - 1] ?? rootId;
}

const EMPTY_CHAIN: readonly InstanceId[] = Object.freeze([]);

function resolveChain(
  runtime: JourneyRuntime,
  rootId: InstanceId,
  enabled: boolean,
): readonly InstanceId[] {
  const chain: InstanceId[] = [];
  let id: InstanceId | null = rootId;
  let depth = 0;
  const visited = new Set<InstanceId>();
  while (id && depth < MAX_CHAIN_DEPTH) {
    if (visited.has(id)) break;
    visited.add(id);
    chain.push(id);
    const inst = runtime.getInstance(id);
    id = enabled && inst ? inst.activeChildId : null;
    depth += 1;
  }
  return chain;
}
