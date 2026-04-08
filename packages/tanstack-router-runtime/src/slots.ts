import type { ReactiveModuleDescriptor } from "@tanstack-react-modules/core";

/**
 * Collects slot contributions from all registered modules.
 * Arrays are concatenated per slot key across modules.
 *
 * When defaults are provided, every key in defaults is guaranteed to exist
 * in the result — even if no module contributes to it.
 */
export function buildSlotsManifest<TSlots extends { [K in keyof TSlots]: readonly unknown[] }>(
  modules: readonly ReactiveModuleDescriptor<any, TSlots>[],
  defaults?: Partial<{ [K in keyof TSlots]: TSlots[K] }>,
): TSlots {
  const result: Record<string, unknown[]> = {};

  // Initialize from defaults so every declared key exists
  if (defaults) {
    for (const [key, items] of Object.entries(defaults)) {
      result[key] = Array.isArray(items) ? [...items] : [];
    }
  }

  for (const mod of modules) {
    if (!mod.slots) continue;
    for (const [key, items] of Object.entries(mod.slots)) {
      if (!result[key]) result[key] = [];
      if (Array.isArray(items)) {
        result[key].push(...items);
      }
    }
  }

  return result as unknown as TSlots;
}
