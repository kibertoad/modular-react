import { createContext, useContext } from "react";

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
    throw new Error(
      "[@react-router-modules/runtime] useSlots must be used within a <ReactiveApp />.",
    );
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
