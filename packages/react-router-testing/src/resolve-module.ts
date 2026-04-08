import type { ReactiveModuleDescriptor, SlotMap, SlotMapOf } from "@react-router-modules/core";
import type { ModuleEntry } from "@react-router-modules/runtime";
import { buildSlotsManifest, evaluateDynamicSlots } from "@react-router-modules/runtime";

export interface ResolveModuleOptions<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots>,
> {
  /** Dependencies snapshot passed to onRegister lifecycle hook and dynamicSlots evaluation */
  deps?: Partial<TSharedDependencies>;
  /** Default slot values (same as registry slot defaults) */
  defaults?: Partial<{ [K in keyof TSlots]: TSlots[K] }>;
}

export interface ResolveModuleResult<TSlots> {
  /** The module's resolved slot contributions (merged with defaults, including dynamic slots) */
  slots: TSlots;
  /** The ModuleEntry as it would appear in useModules() */
  entry: ModuleEntry;
  /** Whether onRegister was called */
  onRegisterCalled: boolean;
}

/**
 * Resolves a module without rendering — runs it through slot merging
 * (static + dynamic) and lifecycle hooks, returning the resolved contributions.
 *
 * Use this for headless modules (no component, no routes) that can't
 * be tested with renderModule().
 *
 * When the module has `dynamicSlots`, they are evaluated with the
 * provided `deps` snapshot and merged with static slot contributions.
 *
 * @example
 * const { slots, entry } = resolveModule(externalSystemsModule, {
 *   defaults: { systems: [], commands: [] },
 *   deps: { auth: { user: { isAdmin: true } } },
 * })
 * expect(slots.systems).toHaveLength(1)
 * expect(entry.id).toBe('external-systems')
 */
export function resolveModule<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
>(
  module: ReactiveModuleDescriptor<TSharedDependencies, TSlots>,
  options?: ResolveModuleOptions<TSharedDependencies, TSlots>,
): ResolveModuleResult<TSlots> {
  let slots = buildSlotsManifest<TSlots>([module], options?.defaults);

  // Evaluate dynamic slots if the module has them
  if (module.dynamicSlots) {
    const deps = (options?.deps ?? {}) as Record<string, unknown>;
    slots = evaluateDynamicSlots(
      slots,
      [
        module.dynamicSlots as (
          deps: Record<string, unknown>,
        ) => Record<string, readonly unknown[]>,
      ],
      deps,
    );
  }

  const entry: ModuleEntry = {
    id: module.id,
    version: module.version,
    meta: module.meta,
    component: module.component,
    zones: module.zones,
  };

  let onRegisterCalled = false;
  if (module.lifecycle?.onRegister) {
    module.lifecycle.onRegister((options?.deps ?? {}) as TSharedDependencies);
    onRegisterCalled = true;
  }

  return { slots, entry, onRegisterCalled };
}
