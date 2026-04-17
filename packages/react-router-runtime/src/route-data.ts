import { useMatches } from "react-router";

/**
 * Read merged `handle` values from the currently matched route hierarchy —
 * the "non-component zone" escape hatch.
 *
 * {@link useZones} is the component-typed channel: each value must be a
 * `ComponentType | undefined` so the shell can render it in a layout
 * region. That constraint is a useful rail 95% of the time, but it gets in
 * the way for non-component metadata the module wants to attach to a route —
 * a header variant enum, a page title string, an analytics event name, a
 * per-route feature flag. `useRouteData` is the relaxed-typing counterpart:
 * same deepest-wins merge over `match.handle`, no constraint on values.
 *
 * Two hooks, two channels: keep components in `handle` fields consumed by
 * `useZones`, keep metadata in fields consumed by `useRouteData`. They can
 * co-exist in the same `handle` object because they read the same match
 * values; each hook only surfaces the keys you've declared in its type.
 *
 * @example
 * ```ts
 * // Declare both shapes explicitly — zones for renderable components,
 * // route data for everything else.
 * interface AppZones {
 *   HeaderActions?: ComponentType
 *   DetailPanel?: ComponentType
 * }
 * interface AppRouteData {
 *   headerVariant?: "portal" | "project" | "setup"
 *   pageTitle?: string
 * }
 *
 * // A route can contribute to both:
 * export const handle = {
 *   HeaderActions: ProjectActions,        // → useZones<AppZones>()
 *   headerVariant: "project" as const,    // → useRouteData<AppRouteData>()
 * }
 *
 * // Layout reads each channel with its own typing:
 * function Shell() {
 *   const { HeaderActions } = useZones<AppZones>()
 *   const { headerVariant, pageTitle } = useRouteData<AppRouteData>()
 *   return (
 *     <AppShell.Header
 *       variant={headerVariant}
 *       title={pageTitle}
 *       actions={HeaderActions ? <HeaderActions /> : undefined}
 *     />
 *   )
 * }
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
    const data = (match as { handle?: unknown }).handle;
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
