import type { ZoneMapOf } from "@modular-frontend/core";

/**
 * The convention for carrying module route statics on an Angular Router route's
 * `data`.
 *
 * The React Router family attaches zone components and per-route static data to
 * a route's arbitrary `handle` field; the vue-router equivalent is `meta`.
 * Angular Router's equivalent channel is `data`, whose built-in type is
 * `{ [key: string | symbol]: any }` — so, exactly like the React `handle`
 * channel, a route contributes zones and static data by placing them directly
 * on its `data`:
 *
 * ```ts
 * // In a module's createRoutes():
 * {
 *   path: ':userId',
 *   component: UserDetailPage,
 *   data: {
 *     detailPanel: UserDetailSidebar,   // a zone component
 *     breadcrumb: 'User',               // arbitrary route data
 *   } satisfies ModuleRouteData<AppZones>,
 * }
 * ```
 *
 * `TZones` types the zone-component keys (each optional, mirroring
 * {@link ZoneMapOf}); any other keys are allowed as arbitrary route data,
 * matching the untyped-`handle`/`data` freedom of the other families.
 *
 * Angular Router's `Route['data']` is a single, non-augmentable `Data` type
 * (unlike vue-router's global `RouteMeta` interface), so this helper is applied
 * per-route with `satisfies` at the authoring site rather than through a global
 * module augmentation. The runtime's `injectZones` / `injectRouteData`
 * accessors (PR-A23) walk `ActivatedRoute.pathFromRoot`, read each route's
 * `data`, and merge deepest-wins via core's `mergeRouteStaticData`.
 */
export type ModuleRouteData<TZones extends ZoneMapOf<TZones> = Record<never, never>> =
  Partial<TZones> & Record<string, unknown>;
