import type { ReactiveModuleDescriptor, SlotMap, SlotMapOf } from "@tanstack-react-modules/core";
import type { ModuleEntry } from "@tanstack-react-modules/runtime";
import { buildSlotsManifest } from "@tanstack-react-modules/runtime";

export interface ResolveModuleOptions<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots>,
> {
  /** Dependencies snapshot passed to onRegister lifecycle hook */
  deps?: Partial<TSharedDependencies>;
  /** Default slot values (same as registry slot defaults) */
  defaults?: Partial<{ [K in keyof TSlots]: TSlots[K] }>;
}

export interface ResolveModuleResult<TSlots> {
  /** The module's resolved slot contributions (merged with defaults) */
  slots: TSlots;
  /** The ModuleEntry as it would appear in useModules() */
  entry: ModuleEntry;
  /** Whether onRegister was called */
  onRegisterCalled: boolean;
}

/**
 * Resolves a module without rendering — runs it through slot merging
 * and lifecycle hooks, returning the resolved contributions.
 *
 * Use this for headless modules (no component, no routes) that can't
 * be tested with renderModule().
 *
 * @example
 * const { slots, entry } = resolveModule(externalSystemsModule, {
 *   defaults: { systems: [], commands: [] },
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
  const slots = buildSlotsManifest<TSlots>([module], options?.defaults);

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
