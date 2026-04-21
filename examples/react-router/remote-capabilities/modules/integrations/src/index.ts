import { defineModule, mergeRemoteManifests } from "@modular-react/core";
import type { RouteObject } from "react-router";
import type { AppDependencies, AppSlots } from "@example/app-shared";

/**
 * The one local module that owns every remote manifest.
 *
 *  1. `lifecycle.onRegister` kicks off the fetch at boot and writes the
 *     result into the integrations store.
 *  2. `dynamicSlots(deps)` exposes the fetched manifests' slot contributions
 *     to the rest of the app via the registry's standard dynamic-slots path.
 *
 * When the store updates, the shell's wiring (main.tsx) fires
 * `manifest.recalculateSlots()`, which re-runs `dynamicSlots(deps)` and the
 * shell re-renders with the new tiles. No new module registration happens.
 */
export default defineModule<AppDependencies, AppSlots>({
  id: "integrations",
  version: "1.0.0",
  requires: ["integrations", "integrationsClient"],

  meta: {
    name: "Integrations",
    description: "Generic integrations catalog driven by backend manifests.",
    category: "system",
  },

  createRoutes: (): RouteObject => ({
    path: "integrations",
    lazy: () => import("./pages/IntegrationsPage.js").then((m) => ({ Component: m.default })),
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
          console.error("[integrations] failed to fetch manifests:", err);
        });
    },
  },

  dynamicSlots: (deps) => mergeRemoteManifests<AppSlots>(deps.integrations.manifests).slots,
});
