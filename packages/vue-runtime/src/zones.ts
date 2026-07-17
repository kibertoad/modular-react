import { computed, type ComputedRef } from "vue";
import { useRoute } from "vue-router";
import { createRouteDataOverrideWarner, mergeRouteStaticData } from "@modular-frontend/core";
import type { ZoneMapOf } from "@modular-vue/core";

/**
 * Read zone components contributed by the currently matched route hierarchy.
 *
 * Zones are set via vue-router's `meta` on individual routes (the analog of
 * React Router's `handle` channel). This composable walks all matched routes
 * from root to leaf — `useRoute().matched` — and returns a reactive map where
 * the deepest match wins for each zone key. The returned `ComputedRef`
 * recomputes when the active route changes, so a layout re-renders its zones
 * as the user navigates.
 *
 * @example
 * // In the shell layout (`<script setup>`):
 * const zones = useZones<AppZones>()
 * // template:
 * // <main><router-view /></main>
 * // <aside><component :is="zones.detailPanel" v-if="zones.detailPanel" /></aside>
 *
 * @example
 * // In a module's createRoutes():
 * {
 *   path: ':userId',
 *   component: UserDetailPage,
 *   meta: {
 *     detailPanel: UserDetailSidebar,
 *   } satisfies ModuleRouteMeta<AppZones>,
 * }
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
 * In dev (NODE_ENV !== "production"), this composable logs a deduped
 * `console.warn` whenever a deeper match overrides a zone already set by
 * an ancestor. Use that warning to catch unintended clobbers; if the
 * override is intentional you can ignore it.
 *
 * To **inherit** an ancestor's zone, omit the key (or set to `undefined`).
 * To **explicitly clear** an ancestor's zone at a deeper route, set the
 * key to `null`. Don't redeclare a shell-owned zone "just to be safe" —
 * that's exactly the pattern the override warning is designed to flag.
 */
const onOverride = createRouteDataOverrideWarner("@modular-vue/runtime", "useZones", "meta");

export function useZones<TZones extends ZoneMapOf<TZones>>(): ComputedRef<Partial<TZones>> {
  const route = useRoute();
  return computed(() =>
    mergeRouteStaticData<TZones>(route.matched, (match) => (match as { meta?: unknown }).meta, {
      onOverride,
    }),
  );
}
