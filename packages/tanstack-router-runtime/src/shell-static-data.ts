import type { StaticDataRouteOption } from "@tanstack/react-router";

/**
 * Type-erase shell-owned static data so it satisfies an augmented
 * `StaticDataRouteOption`. Use this on routes that own shell-level zones —
 * `HeaderTitle`, `HeaderActions`, anything declared once by a section root
 * and inherited by the whole subtree.
 *
 * ## The two-tier pattern this enables
 *
 * The recommended TanStack pattern splits route static data into two
 * interfaces and only augments `StaticDataRouteOption` with the
 * page-contributable one:
 *
 * ```ts
 * // app-shared/zones.ts
 * import type { ComponentType } from "react";
 *
 * export interface AppPageZones {
 *   detailPanel?: ComponentType;
 * }
 *
 * export interface AppShellZones {
 *   HeaderTitle?: ComponentType;
 *   HeaderActions?: ComponentType;
 * }
 *
 * declare module "@tanstack/router-core" {
 *   // Only page-contributable keys flow through the augmentation.
 *   interface StaticDataRouteOption extends AppPageZones {}
 * }
 * ```
 *
 * Because TanStack uses interface augmentation + object-literal excess-
 * property checking, **every route's `staticData` literal is now
 * type-checked against `AppPageZones`**. A descendant route that tries to
 * write `HeaderTitle` (a shell-owned key) gets a compile error:
 *
 * ```ts
 * createRoute({
 *   getParentRoute: () => projectRoute,
 *   path: "dashboard",
 *   staticData: {
 *     HeaderTitle: DashboardTitle, // ❌ TS2353: not in StaticDataRouteOption
 *   },
 * })
 * ```
 *
 * The shell route — the one place that *should* set shell-owned keys —
 * uses this helper to pass a wider shape through:
 *
 * ```ts
 * createRoute({
 *   getParentRoute: () => root,
 *   path: "project/$projectId",
 *   component: ProjectPage,
 *   staticData: defineShellStaticData<AppShellZones & AppPageZones>({
 *     HeaderTitle: ProjectTitle,
 *     HeaderActions: ProjectActions,
 *     detailPanel: ProjectPanel,
 *   }),
 * })
 * ```
 *
 * The helper is the identity function at runtime — its job is to be the
 * single named, greppable place where the cast happens. Shell-owned keys
 * remain blocked everywhere except routes that use this helper, and code
 * review can audit `defineShellStaticData` call sites instead of every
 * `staticData: { ... }` in the codebase.
 *
 * ## Non-component shell-owned route data
 *
 * The same pattern extends to non-component fields read via `useRouteData`
 * (header variants, page titles, feature flags). Define `AppShellRouteData`
 * / `AppPageRouteData` interfaces alongside the zone interfaces, augment
 * `StaticDataRouteOption extends AppPageZones, AppPageRouteData`, and pass
 * the full union to `defineShellStaticData<...>` on shell routes that
 * contribute non-component fields. The helper accepts any object shape;
 * the gating comes from what you choose to leave out of the augmentation.
 *
 * ## Why this is a TanStack-only pattern
 *
 * `StaticDataRouteOption` is TanStack's purpose-built module-augmentation
 * point for route static data. React Router 7's `RouteObject.handle` is
 * typed as `unknown` with no equivalent augmentation hook, so RR cannot
 * provide compile-time gating — RR users `satisfies AppZones` at the call
 * site and rely on the dev-mode override warning fired by `useZones` /
 * `useRouteData` to catch accidental clobbers at navigation time. See the
 * shell-patterns guides for the full asymmetry comparison.
 *
/**
 * Internal helper — collapses the parameter type to `never` when `T` is an
 * array (or readonly array), so `defineShellStaticData([1, 2, 3])` fails
 * at compile time. A simpler `extends Record<string, unknown>` constraint
 * would also reject interfaces (TS doesn't grant them implicit string
 * index signatures); a `length?: never` rider works for object literals
 * but TS lets it through for already-array-typed values.
 */
type NotArray<T> = T extends readonly unknown[] ? never : T;

/**
 * @typeParam TShellStaticData  The shell-owned shape this route is
 *                              authoritative for. Typically
 *                              `AppShellZones & AppPageZones` when the
 *                              shell route also contributes page-level
 *                              zones. The `NotArray` conditional in the
 *                              parameter blocks accidents like
 *                              `defineShellStaticData([1, 2, 3])`
 *                              while still accepting plain interfaces
 *                              and intersected zone types.
 */
export function defineShellStaticData<TShellStaticData extends object>(
  data: NotArray<TShellStaticData>,
): StaticDataRouteOption {
  return data as StaticDataRouteOption;
}
