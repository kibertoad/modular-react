import { useMatches } from "react-router";
import { mergeRouteStaticData } from "@modular-react/core";
import type { ZoneMapOf } from "@react-router-modules/core";

/**
 * Read zone components contributed by the currently matched route hierarchy.
 *
 * Zones are set via React Router's `handle` on individual routes.
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
 * {
 *   path: ':userId',
 *   Component: UserDetailPage,
 *   handle: {
 *     detailPanel: UserDetailSidebar,
 *   },
 * }
 *
 * A fresh object is returned on every render — destructure the zones you
 * need at the top of your layout rather than passing the whole result into
 * a `useEffect` / `useMemo` dependency array.
 */
export function useZones<TZones extends ZoneMapOf<TZones>>(): Partial<TZones> {
  return mergeRouteStaticData<TZones>(
    useMatches(),
    (match) => (match as { handle?: unknown }).handle,
  );
}
