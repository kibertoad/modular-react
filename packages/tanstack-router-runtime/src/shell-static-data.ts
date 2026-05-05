import type { StaticDataRouteOption } from "@tanstack/react-router";

/**
 * Type-erase shell-owned static data so it satisfies an augmented
 * `StaticDataRouteOption`. Use this on routes that own shell-level zones —
 * `HeaderTitle`, `HeaderActions`, `headerVariant`, anything declared once
 * by a section root and inherited by the whole subtree.
 *
 * ## The two-tier pattern this enables
 *
 * The recommended TanStack pattern splits route static data into two
 * interfaces and only augments `StaticDataRouteOption` with the
 * page-contributable one:
 *
 * ```ts
 * // app-shared/static-data.ts
 * export interface AppPageStaticData {
 *   detailPanel?: ComponentType
 *   pageTitle?: string
 * }
 *
 * export interface AppShellStaticData {
 *   HeaderTitle?: ComponentType
 *   HeaderActions?: ComponentType
 *   headerVariant?: "portal" | "project"
 * }
 *
 * declare module "@tanstack/router-core" {
 *   // Only page-contributable keys flow through the augmentation.
 *   interface StaticDataRouteOption extends AppPageStaticData {}
 * }
 * ```
 *
 * Because TanStack uses interface augmentation + object-literal excess-
 * property checking, **every route's `staticData` literal is now
 * type-checked against `AppPageStaticData`**. A descendant route that
 * tries to write `HeaderTitle` (a shell-owned key) gets a compile error:
 *
 * ```ts
 * createRoute({
 *   getParentRoute: () => projectRoute,
 *   path: "dashboard",
 *   staticData: {
 *     HeaderTitle: DashboardTitle, // ❌ TS2353: not in AppPageStaticData
 *   },
 * })
 * ```
 *
 * The shell route — the one place that *should* set shell-owned keys —
 * uses this helper to pass an augmented shape through:
 *
 * ```ts
 * createRoute({
 *   getParentRoute: () => root,
 *   path: "project/$projectId",
 *   component: ProjectPage,
 *   staticData: defineShellStaticData<AppShellStaticData & AppPageStaticData>({
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
 * ## Why this is a TanStack-only pattern
 *
 * `StaticDataRouteOption` is TanStack's purpose-built module-augmentation
 * point for route static data. React Router 7's `RouteObject.handle` is
 * typed as `unknown` with no equivalent augmentation hook, so RR cannot
 * provide compile-time gating — RR users `satisfies AppRouteData` at the
 * call site and rely on the dev-mode override warning fired by
 * `useZones` / `useRouteData` to catch accidental clobbers at navigation
 * time. See the shell-patterns guides for the full asymmetry comparison.
 *
 * @typeParam TShellStaticData  The shell-owned shape this route is
 *                              authoritative for. Typically
 *                              `AppShellStaticData & AppPageStaticData`
 *                              when the shell route also contributes
 *                              page-level zones.
 */
export function defineShellStaticData<TShellStaticData extends object>(
  data: TShellStaticData,
): StaticDataRouteOption {
  return data as StaticDataRouteOption;
}
