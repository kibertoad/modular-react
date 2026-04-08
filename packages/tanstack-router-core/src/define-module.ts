import type { ReactiveModuleDescriptor, SlotMap, SlotMapOf } from "./types.js";

/**
 * Identity function that provides type inference for module descriptors.
 * Zero runtime overhead — returns its argument unchanged.
 *
 * Use the TMeta generic for typed metadata:
 * ```ts
 * interface JourneyMeta { name: string; category: string }
 * export default defineModule<AppDeps, AppSlots, JourneyMeta>({ ... })
 * ```
 */
export function defineModule<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
>(
  descriptor: ReactiveModuleDescriptor<TSharedDependencies, TSlots, TMeta>,
): ReactiveModuleDescriptor<TSharedDependencies, TSlots, TMeta> {
  return descriptor;
}
