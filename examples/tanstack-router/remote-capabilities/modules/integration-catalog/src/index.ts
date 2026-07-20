import { defineModule, mergeRemoteManifests } from "@modular-react/core";
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { AppDependencies, AppSlots } from "@example-tsr-remote-capabilities/app-shared";

/**
 * The local module that drives the catalog page.
 *
 *  1. `lifecycle.onRegister` kicks off the manifest fetch and writes the
 *     result into the integrations store.
 *  2. `dynamicSlots(deps)` exposes the merged manifest contributions to
 *     `<IntegrationsPage>` via the registry's standard dynamic-slots path.
 *  3. `createRoutes` mounts the page at `/integrations` (TanStack Router
 *     freezes its tree at `createRouter` time, so this is an eager route
 *     with a `lazyRouteComponent` for code splitting).
 *
 * When the store updates (fetch resolves OR a journey terminates and
 * marks an integration connected), the shell's `recalculateSlots()` call
 * re-runs `dynamicSlots(deps)` and the page re-renders with the new tiles
 * / connected badges.
 */
export default defineModule<AppDependencies, AppSlots>()({
  id: "integration-catalog",
  version: "1.0.0",
  requires: ["integrations", "integrationsClient"],

  meta: {
    name: "Integration catalog",
    description: "Lists generic integrations sourced from backend manifests.",
    category: "system",
  },

  createRoutes: (parentRoute) =>
    createRoute({
      getParentRoute: () => parentRoute,
      path: "integrations",
      component: lazyRouteComponent(async () => ({
        default: (await import("./pages/IntegrationsPage.js")).default,
      })),
    }),

  navigation: [{ label: "Integrations", to: "/integrations", group: "catalog", order: 10 }],

  lifecycle: {
    onRegister(deps) {
      // Fire-and-forget: the framework does not await onRegister. That's OK —
      // we want the UI to paint immediately with empty slots, then fill in
      // once the fetch resolves and recalculateSlots() runs.
      deps.integrations.setStatus("loading");
      deps.integrationsClient
        .fetchManifests()
        .then((manifests) => {
          deps.integrations.setManifests(manifests);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          deps.integrations.setError(message);
          deps.integrations.setStatus("error");
          // eslint-disable-next-line no-console
          console.error("[integration-catalog] failed to fetch manifests:", err);
        });
    },
  },

  dynamicSlots: (deps) => mergeRemoteManifests<AppSlots>(deps.integrations.manifests).slots,
});
