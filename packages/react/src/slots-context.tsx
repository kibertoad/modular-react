import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Store, ReactiveService, DynamicSlotFactory, SlotFilter } from "@modular-react/core";
import { evaluateDynamicSlots } from "@modular-react/core";

export const SlotsContext = createContext<object | null>(null);

const noop = () => {};
export const RecalculateSlotsContext = createContext<() => void>(noop);

/**
 * Access the collected slot contributions from all registered modules.
 * Must be used within a <ReactiveApp /> provider tree.
 *
 * @example
 * const slots = useSlots<AppSlots>()
 * const commands = slots.commands // CommandDefinition[] from all modules
 */
export function useSlots<TSlots extends { [K in keyof TSlots]: readonly unknown[] }>(): TSlots {
  const slots = useContext(SlotsContext);
  if (!slots) {
    throw new Error("[@modular-react/react] useSlots must be used within a <ReactiveApp />.");
  }
  return slots as TSlots;
}

/**
 * Returns a function that triggers re-evaluation of dynamic slots.
 *
 * Use this inside module components when a local action should cause
 * dynamic slot contributions to be recalculated — for example after
 * toggling a feature flag or completing a flow that changes permissions.
 *
 * No-op when no module uses `dynamicSlots` and no `slotFilter` is configured.
 *
 * @example
 * function PermissionsPanel() {
 *   const recalculateSlots = useRecalculateSlots()
 *
 *   async function handleRoleChange(userId: string, role: string) {
 *     await api.updateRole(userId, role)
 *     recalculateSlots()
 *   }
 *   // ...
 * }
 */
export function useRecalculateSlots(): () => void {
  return useContext(RecalculateSlotsContext);
}

/**
 * Minimal pub/sub signal — one producer (`notify`) triggers
 * all subscribers. Used to connect the imperative `recalculateSlots()`
 * function to the React-side `DynamicSlotsProvider`.
 */
export interface SlotsSignal {
  subscribe: (fn: () => void) => () => void;
  notify: () => void;
}

export function createSlotsSignal(): SlotsSignal {
  const listeners = new Set<() => void>();
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    notify() {
      for (const fn of listeners) fn();
    },
  };
}

/**
 * Provider that re-evaluates dynamic slot factories when
 * `recalculateSlots()` is called (via the signal).
 *
 * Only mounted when at least one dynamic slot factory or slotFilter exists.
 */
export function DynamicSlotsProvider({
  baseSlots,
  factories,
  filter,
  stores,
  services,
  reactiveServices,
  signal,
  children,
}: {
  baseSlots: object;
  factories: readonly DynamicSlotFactory[];
  filter: SlotFilter | undefined;
  stores: Record<string, Store<unknown>>;
  services: Record<string, unknown>;
  reactiveServices: Record<string, ReactiveService<unknown>>;
  signal: SlotsSignal;
  children: React.ReactNode;
}) {
  // All props are stable references created once at resolve() time,
  // so useCallback with empty deps is correct.
  const computeSlots = useCallback(() => {
    const deps: Record<string, unknown> = {};
    for (const [key, store] of Object.entries(stores)) {
      deps[key] = store.getState();
    }
    for (const [key, service] of Object.entries(services)) {
      deps[key] = service;
    }
    for (const [key, rs] of Object.entries(reactiveServices)) {
      deps[key] = rs.getSnapshot();
    }
    return evaluateDynamicSlots(baseSlots as any, factories, deps, filter);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- all closure values are stable from resolve()

  const [resolvedSlots, setResolvedSlots] = useState(computeSlots);

  useEffect(() => {
    const unsubscribe = signal.subscribe(() => setResolvedSlots(computeSlots()));
    // Catch any recalculateSlots() calls that fired between initial render and this effect
    setResolvedSlots(computeSlots());
    return unsubscribe;
  }, [computeSlots, signal]);

  return <SlotsContext value={resolvedSlots}>{children}</SlotsContext>;
}
