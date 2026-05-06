import { createRoot } from "react-dom/client";
import { createRegistry } from "@tanstack-react-modules/runtime";
import { journeysPlugin } from "@modular-react/journeys";
import type { AppDependencies, AppSlots } from "@example-tsr-remote-capabilities/app-shared";
import integrationCatalogModule from "@example-tsr-remote-capabilities/integration-catalog";
import salesforceModule from "@example-tsr-remote-capabilities/salesforce";
import hubspotModule from "@example-tsr-remote-capabilities/hubspot";
import genericIntegrationModule from "@example-tsr-remote-capabilities/generic-integration";
import { integrationSetupJourney } from "@example-tsr-remote-capabilities/integration-setup-journey";

import { integrationsStore } from "./stores/integrations.js";
import { createIntegrationsClient } from "./services/integrations-client.js";
import { RootLayout } from "./components/RootLayout.js";
import { ShellLayout } from "./components/ShellLayout.js";
import { Home } from "./components/Home.js";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { integrations: integrationsStore },
  services: {
    integrationsClient: createIntegrationsClient(),
    tenantId: "tenant-demo",
  },
  // Pre-seed the slot so `useSlots<AppSlots>().integrations` is always
  // type-narrowed without a null check, even before the fetch resolves.
  slots: { integrations: [] },
}).use(journeysPlugin());

// Catalog module: owns /integrations + dynamicSlots(deps) reading from the
// integrations store.
registry.register(integrationCatalogModule);

// Journey-step modules: own configure entry points only — no routes, no
// slot contributions. The journey reaches them by id via
// selectModuleOrDefault against the integration's `id`.
registry.register(salesforceModule);
registry.register(hubspotModule);
registry.register(genericIntegrationModule);

registry.registerJourney(integrationSetupJourney);

const { App, recalculateSlots } = registry.resolve({
  rootComponent: RootLayout,
  indexComponent: Home,
  // No auth boundary — the catalog page is publicly visible.
  authenticatedRoute: {
    beforeLoad: () => {
      // No-op guard: ShellLayout renders the sidebar + outlet under this
      // pathless layout route. Apps with real auth would `throw redirect()`
      // here when no user is signed in.
    },
    component: ShellLayout,
  },
});

// Re-merge slots whenever the integrations store changes — both the async
// manifest fetch and a journey terminating (which calls `markConnected`)
// flow through the same path.
integrationsStore.subscribe(recalculateSlots);

createRoot(document.getElementById("root")!).render(<App />);
