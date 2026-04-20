import type { AnyModuleDescriptor, ModuleDescriptor } from "./types.js";

/**
 * A dynamic slot factory — a function that receives a deps snapshot
 * and returns conditional slot contributions.
 */
export type DynamicSlotFactory = (
  deps: Record<string, unknown>,
) => Record<string, readonly unknown[]>;

/**
 * A slot filter — receives the full merged slots and deps, returns filtered slots.
 */
export type SlotFilter = (
  slots: Record<string, unknown[]>,
  deps: Record<string, unknown>,
) => Record<string, unknown[]>;

/**
 * Collects slot contributions from all registered modules.
 * Arrays are concatenated per slot key across modules.
 *
 * When defaults are provided, every key in defaults is guaranteed to exist
 * in the result — even if no module contributes to it.
 */
export function buildSlotsManifest<TSlots extends { [K in keyof TSlots]: readonly unknown[] }>(
  modules: readonly ModuleDescriptor<any, TSlots>[],
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

/**
 * Collects dynamicSlots functions from all registered modules.
 * Returns an empty array when no module contributes dynamic slots.
 */
export function collectDynamicSlotFactories(
  modules: readonly AnyModuleDescriptor[],
): DynamicSlotFactory[] {
  const factories: DynamicSlotFactory[] = [];
  for (const mod of modules) {
    if (mod.dynamicSlots) {
      factories.push(mod.dynamicSlots as DynamicSlotFactory);
    }
  }
  return factories;
}

/**
 * Evaluates dynamic slot factories against a deps snapshot and merges
 * the results with the static base slots.
 *
 * When a slotFilter is provided, it runs after all dynamic contributions
 * have been merged — useful for cross-cutting concerns like permission checks.
 */
export function evaluateDynamicSlots<TSlots extends { [K in keyof TSlots]: readonly unknown[] }>(
  baseSlots: TSlots,
  factories: readonly DynamicSlotFactory[],
  deps: Record<string, unknown>,
  filter?: SlotFilter,
): TSlots {
  // Copy base slots
  const result: Record<string, unknown[]> = {};
  for (const [key, items] of Object.entries(baseSlots)) {
    result[key] = Array.isArray(items) ? [...items] : [];
  }

  // Evaluate each factory and merge contributions
  for (const factory of factories) {
    const contribution = factory(deps);
    if (!contribution) continue;
    for (const [key, items] of Object.entries(contribution)) {
      if (!result[key]) result[key] = [];
      if (Array.isArray(items)) {
        result[key].push(...items);
      }
    }
  }

  // Apply global filter
  if (filter) {
    return filter(result, deps) as unknown as TSlots;
  }

  return result as unknown as TSlots;
}
