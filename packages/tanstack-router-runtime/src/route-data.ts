import { useMatches } from "@tanstack/react-router";

/**
 * Read merged `staticData` values from the currently matched route
 * hierarchy — the "non-component zone" escape hatch for TanStack Router.
 *
 * Counterpart to {@link useZones} (same merge semantics) but with no type
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
 */
export function useRouteData<TRouteData extends object>(): Partial<TRouteData> {
  const matches = useMatches();
  const merged: Record<string, unknown> = {};
  for (const match of matches) {
    const data = (match as { staticData?: unknown }).staticData;
    if (data && typeof data === "object") {
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (value !== undefined) {
          merged[key] = value;
        }
      }
    }
  }
  return merged as Partial<TRouteData>;
}
