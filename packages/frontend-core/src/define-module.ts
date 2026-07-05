import type {
  ModuleDescriptor,
  NavigationItem,
  NavigationItemBase,
  SlotMap,
  SlotMapOf,
} from "./types.js";

/**
 * Identity function that provides type inference for module descriptors.
 * Zero runtime overhead — returns its argument unchanged.
 *
 * Use the generics to opt into stricter typing:
 *
 * - `TMeta` — catalog metadata shape ({@link ModuleDescriptor.meta}).
 *
 * - `TNavItem` — app-specific navigation item type. Alias
 *   `NavigationItem<TLabel, TContext, TMeta>` once in your app and pass
 *   it through, so typed i18n labels, dynamic hrefs, and typed `meta` are
 *   enforced on every module.
 *
 * ```ts
 * interface JourneyMeta { name: string; category: string }
 * type AppNavItem = NavigationItem<ParseKeys, { workspaceId: string }, { action?: Action }>
 *
 * export default defineModule<AppDeps, AppSlots, JourneyMeta, AppNavItem>({
 *   id: "portal",
 *   version: "1.0.0",
 *   meta: { name: "Portal", category: "workspace" },
 *   navigation: [
 *     {
 *       label: "appShell.nav.requests",                         // typed i18n key
 *       to: ({ workspaceId }) => `/portal/${workspaceId}`,      // typed context
 *       meta: { action: "managePortalRequests" },               // typed meta
 *     },
 *   ],
 * })
 * ```
 *
 * The final `TDescriptor` generic is inferred from the argument and lets the
 * return type preserve the *literal* shape of `entryPoints` / `exitPoints` /
 * `meta` — important for downstream journey types, which derive entry/exit
 * vocabulary from `typeof someModule`. Without this, those maps would widen
 * to their base constraints (`EntryPointMap` / `ExitPointMap`) and journey
 * transitions wouldn't typecheck.
 */
export function defineModule<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
  TNavItem extends NavigationItemBase = NavigationItem,
  TDescriptor extends ModuleDescriptor<TSharedDependencies, TSlots, TMeta, TNavItem> =
    ModuleDescriptor<TSharedDependencies, TSlots, TMeta, TNavItem>,
>(descriptor: TDescriptor): TDescriptor {
  return descriptor;
}
