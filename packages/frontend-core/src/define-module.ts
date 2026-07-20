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
 * Two call shapes:
 *
 * - **Direct** — `defineModule(descriptor)`. Infers everything from the
 *   argument. Use the generics to opt into stricter typing:
 *   - `TMeta` — catalog metadata shape ({@link ModuleDescriptor.meta}).
 *   - `TNavItem` — app-specific navigation item type. Alias
 *     `NavigationItem<TLabel, TContext, TMeta>` once in your app and pass it
 *     through, so typed i18n labels, dynamic hrefs, and typed `meta` are
 *     enforced. When you don't pass it, it is **inferred from the `navigation`
 *     array** (the `descriptor & { navigation?: readonly TNavItem[] }`
 *     parameter shape), defaulting to `NavigationItem` only when there is no
 *     navigation. That inference is what lets a module use **function-form**
 *     `to` (`to: (ctx) => "/portal/" + ctx.workspaceId`) with zero generics:
 *     the old fixed `NavigationItem` default narrowed `to` to a plain `string`
 *     and rejected the resolver form. The inferred item stays narrow (a
 *     plain-string `to` infers a `string`-`to` item), so the result is still
 *     assignable where a `NavigationItem`-typed registry expects it.
 *
 * - **Curried** — `defineModule<AppDeps, AppSlots>()(descriptor)`. Pins the
 *   app-wide `TSharedDependencies` / `TSlots` (and optionally `TMeta`) in the
 *   first, empty call, then infers `TNavItem` + `TDescriptor` from the
 *   descriptor in the second. This is what a typed shell wants: fix the
 *   dependency/slot types once while function-form `to` still type-checks,
 *   because `TNavItem` is *inferred*, not defaulted. It exists because
 *   TypeScript can't partially infer a single call's type arguments — spelling
 *   some (`defineModule<AppDeps, AppSlots>(descriptor)`) forces the rest to
 *   their defaults, which pins `TNavItem` back to `NavigationItem` and rejects
 *   function-form `to`. Moving the app-context generics to their own call keeps
 *   the descriptor-derived generics inferable, exactly like `defineJourney`.
 *
 * ```ts
 * interface JourneyMeta { name: string; category: string }
 * type AppNavItem = NavigationItem<ParseKeys, { workspaceId: string }, { action?: Action }>
 *
 * // Direct, fully explicit:
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
 *
 * // Curried — typed shell deps/slots, navigation `to` still inferred:
 * export default defineModule<AppDeps, AppSlots>()({
 *   id: "portal",
 *   version: "1.0.0",
 *   navigation: [{ label: "Requests", to: ({ workspaceId }) => `/portal/${workspaceId}` }],
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
