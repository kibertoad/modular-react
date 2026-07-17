// Vue module descriptor fixture. It eagerly imports a `.vue` single-file
// component, so loading it through the harvester's SSR path only succeeds when
// `@vitejs/plugin-vue` is forwarded via the catalog config's `plugins` option.
// Without the plugin, Vite has no transform for `.vue` and the load fails
// (surfaced as a non-fatal HarvestError).
//
// Kept as a plain object — matching the other fixtures — so the fixture stays
// free of a `@modular-vue/core` dependency: `defineModule` is an identity
// function and the descriptor shape is what the duck-typed detector keys on.
import InsightsPage from "./InsightsPage.vue";

export default {
  id: "insights",
  version: "2.0.0",
  meta: {
    name: "Insights",
    description: "Vue analytics dashboard module.",
    ownerTeam: "growth",
    domain: "analytics",
    tags: ["reporting"],
    status: "stable" as const,
  },
  requires: ["auth"] as const,
  navigation: [{ label: "Insights", to: "/insights" }],
  createRoutes: () => ({
    path: "insights",
    component: InsightsPage,
    meta: { pageTitle: "Insights" },
  }),
};
