import { useMatches } from "react-router";
import { mergeRouteStaticData } from "@modular-react/core";

/**
 * Read merged `handle` values from the currently matched route hierarchy —
 * the "non-component zone" escape hatch.
 *
 * `useZones` is the component-typed channel: each value must be a
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
 *
 * ## Returned object contains all handle keys, not just declared ones
 *
 * The returned object is the raw merged `handle` — TypeScript narrows what
 * you can *access* via `TRouteData`, but every key present across matches
 * is still there at runtime. If a route declared a component zone (e.g.
 * `HeaderActions`) on the same `handle` object, it appears here too.
 *
 * This is intentional: the two hooks (`useZones` / `useRouteData`) don't
 * have to coordinate on key sets, so a migration can split handle fields
 * between them incrementally. The consequence is that code that iterates
 * the return value (`Object.keys(useRouteData())`, `JSON.stringify`, etc.)
 * will see component entries mixed with data entries — read by declared
 * key, not by iteration.
 *
 * ## Return value identity
 *
 * A fresh object is produced on every render — the hook cannot memoize
 * safely because the `matches` array from React Router is itself freshly
 * allocated per render. Destructure the fields you need (field values are
 * stable across renders when the route hierarchy is unchanged); do **not**
 * pass the whole returned object into a `useEffect` / `useMemo` dependency
 * array or it will re-fire every render.
 */
export function useRouteData<TRouteData extends object>(): Partial<TRouteData> {
  return mergeRouteStaticData<TRouteData>(
    useMatches(),
    (match) => (match as { handle?: unknown }).handle,
  );
}
