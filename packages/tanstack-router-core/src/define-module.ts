import type { NavigationItem } from "@modular-react/core";
import type { ModuleDescriptor, SlotMap, SlotMapOf } from "./types.js";

/**
 * Identity function that provides type inference for TanStack Router module descriptors.
 * Zero runtime overhead — returns its argument unchanged.
 *
 * See {@link NavigationItem} for the three generics that let you tighten
 * navigation typing: typed i18n labels, typed dynamic-href context, and a
 * typed `meta` bag for app-specific fields (permission actions, badges,
 * analytics ids, etc.).
 *
 * ```ts
 * interface JourneyMeta { name: string; category: string }
 * type AppNavItem = NavigationItem<ParseKeys, { workspaceId: string }, { action?: Action }>
 *
 * export default defineModule<AppDeps, AppSlots, JourneyMeta, AppNavItem>({ ... })
 * ```
 */
export function defineModule<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
  TNavItem extends NavigationItem = NavigationItem,
>(
  descriptor: ModuleDescriptor<TSharedDependencies, TSlots, TMeta, TNavItem>,
): ModuleDescriptor<TSharedDependencies, TSlots, TMeta, TNavItem> {
  return descriptor;
}
