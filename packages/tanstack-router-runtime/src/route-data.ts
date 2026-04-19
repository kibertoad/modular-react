import { useMatches } from "@tanstack/react-router";
import { mergeRouteStaticData } from "@modular-react/core";

/**
 * Read merged `staticData` values from the currently matched route
 * hierarchy — the "non-component zone" escape hatch for TanStack Router.
 *
 * Counterpart to `useZones` (same merge semantics) but with no type
 * constraint on values. Use it for non-component route metadata —
 * headerVariant enums, page titles, analytics event names, per-route
 * feature flags — that shouldn't be forced into a ComponentType shape.
 *
 * Two hooks, two channels: components in `staticData` for `useZones`,
 * metadata in `staticData` for `useRouteData`. They co-exist — the shared
 * `staticData` object carries both; each hook exposes only the keys
 * declared in its generic.
 *
 * @example
 * ```ts
 * interface AppZones {
 *   HeaderActions?: ComponentType
 * }
 * interface AppRouteData {
 *   headerVariant?: "portal" | "project"
 *   pageTitle?: string
 * }
 *
 * const projectRoute = createRoute({
 *   getParentRoute: () => root,
 *   path: "project",
 *   component: ProjectPage,
 *   staticData: {
 *     HeaderActions: ProjectActions,      // → useZones<AppZones>()
 *     headerVariant: "project" as const,  // → useRouteData<AppRouteData>()
 *   },
 * })
 * ```
 *
 * Merge semantics match `useZones`: walks matched routes root-to-leaf,
 * deepest match wins per key, `undefined` values at a deeper level don't
 * override an ancestor's value.
 *
 * ## Returned object contains all staticData keys, not just declared ones
 *
 * The returned object is the raw merged `staticData` — TypeScript narrows
 * what you can *access* via `TRouteData`, but every key present across
 * matches is still there at runtime. If a route declared a component zone
 * (e.g. `HeaderActions`) on the same `staticData` object, it appears here
 * too. Read by declared key, not by `Object.keys()` iteration.
 *
 * ## Return value identity
 *
 * A fresh object is produced on every render — the hook cannot memoize
 * safely because the `matches` array from TanStack Router is itself freshly
 * allocated per render. Destructure the fields you need (field values are
 * stable across renders when the route hierarchy is unchanged); do **not**
 * pass the whole returned object into a `useEffect` / `useMemo` dependency
 * array or it will re-fire every render.
 */
export function useRouteData<TRouteData extends object>(): Partial<TRouteData> {
  return mergeRouteStaticData<TRouteData>(
    useMatches(),
    (match) => (match as { staticData?: unknown }).staticData,
  );
}
