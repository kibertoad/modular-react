import { useMatches } from "@tanstack/react-router";
import { createRouteDataOverrideWarner, mergeRouteStaticData } from "@modular-react/core";

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
 * ## Merge semantics
 *
 * Walks matched routes root-to-leaf, deepest match wins per key.
 * `undefined` values at a deeper level don't override an ancestor —
 * **omit the key (or set it to `undefined`) to inherit**. Set the key
 * to `null` to **explicitly clear** an ancestor's value; the consuming
 * shell decides how to render `null` (typically: as if the field was
 * never set, but distinct from "still loading").
 *
 * In dev (NODE_ENV !== "production"), this hook logs a deduped
 * `console.warn` whenever a deeper match overrides a key already set by
 * an ancestor. The warning is intended to catch accidental clobbers of
 * shell-owned route data (e.g. `headerVariant`); ignore it when the
 * override is intentional.
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
const onOverride = createRouteDataOverrideWarner(
  "@tanstack-react-modules/runtime",
  "useRouteData",
  "staticData",
);

export function useRouteData<TRouteData extends object>(): Partial<TRouteData> {
  return mergeRouteStaticData<TRouteData>(
    useMatches(),
    (match) => (match as { staticData?: unknown }).staticData,
    { onOverride },
  );
}
