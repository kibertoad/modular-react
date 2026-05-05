import { useMatches } from "@tanstack/react-router";
import { createRouteDataOverrideWarner, mergeRouteStaticData } from "@modular-react/core";
import type { ZoneMapOf } from "@tanstack-react-modules/core";

/**
 * Read zone components contributed by the currently matched route hierarchy.
 *
 * Zones are set via TanStack Router's `staticData` on individual routes.
 * This hook walks all matched routes from root to leaf and returns a merged
 * map where the deepest match wins for each zone key.
 *
 * @example
 * // In the shell layout:
 * const zones = useZones<AppZones>()
 * const DetailPanel = zones.detailPanel
 *
 * return (
 *   <div className="grid">
 *     <main><Outlet /></main>
 *     <aside>{DetailPanel && <DetailPanel />}</aside>
 *   </div>
 * )
 *
 * @example
 * // In a module's route definition:
 * const userDetail = createRoute({
 *   getParentRoute: () => usersRoot,
 *   path: '$userId',
 *   component: UserDetailPage,
 *   staticData: {
 *     detailPanel: UserDetailSidebar,
 *   },
 * })
 *
 * ## Ownership and overrides
 *
 * Zones merge with deepest-wins semantics: a descendant route that declares
 * the same zone key as an ancestor silently replaces it. That is the
 * intended escape hatch for "this section overrides the default panel" —
 * but it is also the failure mode when a descendant route accidentally
 * declares a zone key the shell layout owns (e.g. `HeaderTitle`,
 * `HeaderActions`).
 *
 * In dev (NODE_ENV !== "production"), this hook logs a deduped
 * `console.warn` whenever a deeper match overrides a zone already set by
 * an ancestor. Use that warning to catch unintended clobbers; if the
 * override is intentional you can ignore it.
 *
 * To **inherit** an ancestor's zone, omit the key (or set to `undefined`).
 * To **explicitly clear** an ancestor's zone at a deeper route, set the
 * key to `null`. Don't redeclare a shell-owned zone "just to be safe" —
 * that's exactly the pattern the override warning is designed to flag.
 *
 * A fresh object is returned on every render — destructure the zones you
 * need at the top of your layout rather than passing the whole result into
 * a `useEffect` / `useMemo` dependency array.
 */
const onOverride = createRouteDataOverrideWarner(
  "@tanstack-react-modules/runtime",
  "useZones",
  "staticData",
);

export function useZones<TZones extends ZoneMapOf<TZones>>(): Partial<TZones> {
  return mergeRouteStaticData<TZones>(
    useMatches(),
    (match) => (match as { staticData?: unknown }).staticData,
    { onOverride },
  );
}
