import { defineModule } from "@modular-react/core";
import type { RouteObject } from "react-router";
import type { AppDependencies, AppSlots } from "@example-active/app-shared";

/**
 * The local module that owns the "active integration" surface.
 *
 * Swap topology: `dynamicSlots` reads directly from the active manifest —
 * no `mergeRemoteManifests` call, no array concatenation. When
 * `integrations.selectProject(id)` writes a new manifest into the store,
 * the shell's `recalculateSlots()` subscription re-runs `dynamicSlots(deps)`
 * and the new integration's slot items replace the old ones.
 *
 * No `onRegister` hook: there's nothing to fetch at boot. Fetching happens
 * on demand when the UI calls `selectProject`.
 */
export default defineModule<AppDependencies, AppSlots>({
  id: "integrations",
  version: "1.0.0",
  requires: ["integrations"],

  meta: {
    name: "Active integration",
    description: "The integration configured for the currently active project.",
    category: "system",
  },

  createRoutes: (): RouteObject => ({
    path: "integration",
    lazy: () => import("./pages/IntegrationPage.js").then((m) => ({ Component: m.default })),
  }),

  navigation: [{ label: "Integration", to: "/integration", group: "project", order: 10 }],

  // The manifest's `slots` is already shaped as `{ integration: [...] }` on
  // the wire — read it straight through. Falls back to an empty slot map
  // while no project is selected or the fetch is in flight.
  dynamicSlots: (deps) => deps.integrations.activeManifest?.slots ?? {},
});
