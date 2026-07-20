import type { NavigationItem, NavigationItemBase } from "@modular-react/core";
import type { ModuleDescriptor, SlotMap, SlotMapOf } from "./types.js";

/**
 * Identity function that provides type inference for React Router module descriptors.
 * Zero runtime overhead — returns its argument unchanged.
 *
 * See `NavigationItem` for the three generics that let you tighten navigation
 * typing: typed i18n labels, typed dynamic-href context, and a typed `meta`
 * bag for app-specific fields (permission actions, badges, analytics ids, etc.).
 *
 * ```ts
 * interface JourneyMeta { name: string; category: string }
 * type AppNavItem = NavigationItem<ParseKeys, { workspaceId: string }, { action?: Action }>
 *
 * export default defineModule<AppDeps, AppSlots, JourneyMeta, AppNavItem>({ ... })
 *
 * // Curried — pin app-wide deps/slots while navigation `to` stays inferred:
 * export default defineModule<AppDeps, AppSlots>()({ ... })
 * ```
 *
 * Two inference guarantees matter for journeys built on `typeof someModule`:
 *
 * 1. **Literal shape is preserved.** The trailing `TDescriptor` generic is
 *    inferred from the argument and returned verbatim, so `entryPoints` /
 *    `exitPoints` keep their *literal* keys instead of widening to
 *    `EntryPointMap` / `ExitPointMap`. A journey's `TransitionMap<{ m: typeof
 *    someModule }, …>` then resolves the module's real entry/exit vocabulary —
 *    no casts, no re-declaring the entry names by hand.
 * 2. **Function-form `to` works without spelling `TNavItem`.** `TNavItem` is
 *    inferred from the `navigation` array (the `descriptor & { navigation?:
 *    readonly TNavItem[] }` parameter shape), defaulting to `NavigationItem`
 *    only when there is no navigation. That inference admits a module that
 *    resolves its href at render time (`to: (ctx) => …`) with zero generics —
 *    the old fixed `NavigationItem` default narrowed `to` to a plain `string`
 *    and rejected the resolver form — while keeping the inferred item narrow so
 *    the result stays assignable where a `NavigationItem`-typed registry
 *    expects it.
 */
export function defineModule<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
  TNavItem extends NavigationItemBase = NavigationItem,
  TDescriptor extends ModuleDescriptor<TSharedDependencies, TSlots, TMeta, TNavItem> =
    ModuleDescriptor<TSharedDependencies, TSlots, TMeta, TNavItem>,
>(descriptor: TDescriptor & { readonly navigation?: readonly TNavItem[] }): TDescriptor;
export function defineModule<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots>,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
>(): <
  TNavItem extends NavigationItemBase = NavigationItem,
  TDescriptor extends ModuleDescriptor<TSharedDependencies, TSlots, TMeta, TNavItem> =
    ModuleDescriptor<TSharedDependencies, TSlots, TMeta, TNavItem>,
>(
  descriptor: TDescriptor & { readonly navigation?: readonly TNavItem[] },
) => TDescriptor;
export function defineModule(descriptor?: unknown): unknown {
  return descriptor === undefined ? (inner: unknown) => inner : descriptor;
}
