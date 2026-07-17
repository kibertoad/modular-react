import type { ZoneMapOf } from "@modular-frontend/core";

/**
 * The convention for carrying module route statics on a vue-router route's
 * `meta`.
 *
 * The React Router family attaches zone components and per-route static data
 * to a route's arbitrary `handle` field; vue-router's equivalent channel is
 * `meta`. The runtime's `useZones` / `useRouteData` composables (PR-23) walk
 * `useRoute().matched`, read each record's `meta`, and merge deepest-wins.
 * So a route contributes zones and static data by placing them directly on
 * its `meta`:
 *
 * ```ts
 * // In a module's createRoutes():
 * {
 *   path: ':userId',
 *   component: UserDetailPage,
 *   meta: {
 *     detailPanel: UserDetailSidebar,   // a zone component
 *     breadcrumb: 'User',               // arbitrary route data
 *   } satisfies ModuleRouteMeta<AppZones>,
 * }
 * ```
 *
 * `TZones` types the zone-component keys (each optional, mirroring
 * {@link ZoneMapOf}); any other keys are allowed as arbitrary route data,
 * matching the untyped-`handle` freedom of the React side.
 */
export type ModuleRouteMeta<TZones extends ZoneMapOf<TZones> = Record<never, never>> =
  Partial<TZones> & Record<string, unknown>;

/**
 * Augment vue-router's global `RouteMeta` so `route.meta` is typed with your
 * app's zones (and any other statics) everywhere the runtime reads it.
 *
 * vue-router exposes `meta` as a single global `RouteMeta` interface, so the
 * augmentation belongs in the app, not in this library — a library that
 * augmented `RouteMeta` would force its shape on every consumer. Drop this in
 * an app-level `.d.ts` (or `app-shared`):
 *
 * ```ts
 * import type { ModuleRouteMeta } from '@modular-vue/core'
 * import type { AppZones } from '@myorg/app-shared'
 *
 * declare module 'vue-router' {
 *   interface RouteMeta extends ModuleRouteMeta<AppZones> {}
 * }
 * ```
 *
 * `RouteMeta` already extends `Record<string | number | symbol, unknown>` in
 * vue-router, so this augmentation is additive: it narrows the keys you name
 * and leaves arbitrary route data untouched.
 */
