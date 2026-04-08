import { useMatches } from "react-router";
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
 */
export function useZones<TZones extends ZoneMapOf<TZones>>(): Partial<TZones> {
  const matches = useMatches();
  const merged: Record<string, unknown> = {};
  for (const match of matches) {
    const data = (match as any).handle;
    if (data && typeof data === "object") {
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (value !== undefined) {
          merged[key] = value;
        }
      }
    }
  }
  return merged as Partial<TZones>;
}
