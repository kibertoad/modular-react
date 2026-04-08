import { createContext, useContext } from "react";

export const SlotsContext = createContext<object | null>(null);

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
      "[@tanstack-react-modules/runtime] useSlots must be used within a <ReactiveApp />.",
    );
  }
  return slots as TSlots;
}
