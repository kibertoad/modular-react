import type { ReactiveModuleDescriptor, SlotMap, SlotMapOf } from "./types.js";

/**
 * Shorthand for defining headless modules that only contribute slots.
 * Returns a ReactiveModuleDescriptor with no component, routes, or lifecycle.
 *
 * @example
 * ```ts
 * export default defineSlots<AppDeps, AppSlots>('external-systems', {
 *   systems: [{ id: 'salesforce', name: 'Salesforce', ... }],
 * })
 * ```
 */
export function defineSlots<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
>(
  id: string,
  slots: { readonly [K in keyof TSlots]?: TSlots[K] },
): ReactiveModuleDescriptor<TSharedDependencies, TSlots> {
  return { id, version: "0.0.0", slots };
}
