import { createRoot } from "react-dom/client";
import { createRegistry } from "@react-router-modules/runtime";
import type { AppDependencies, AppSlots } from "@example/app-shared";
import integrationsModule from "@example/integrations-module";
import { integrationsStore } from "./stores/integrations.js";
import { createIntegrationsClient } from "./services/integrations-client.js";
import { RootLayout } from "./components/RootLayout.js";
import { ShellLayout } from "./components/ShellLayout.js";
import { Home } from "./components/Home.js";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { integrations: integrationsStore },
  services: { integrationsClient: createIntegrationsClient() },
  slots: { integrations: [] },
});

registry.register(integrationsModule);

const { App, recalculateSlots } = registry.resolve({
  rootComponent: RootLayout,
  indexComponent: Home,
  // No auth in this example — render the shell chrome under a no-op
  // authenticatedRoute so the sidebar is always visible.
  authenticatedRoute: {
    loader: () => null,
    Component: ShellLayout,
  },
});

// Re-merge slots whenever the integrations store changes. This is what
// turns an async fetch into a live UI update: the integrations module's
// `dynamicSlots(deps)` re-runs, and React re-renders with the new tiles.
integrationsStore.subscribe(recalculateSlots);

createRoot(document.getElementById("root")!).render(<App />);
