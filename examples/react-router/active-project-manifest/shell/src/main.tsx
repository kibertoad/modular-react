import { createRoot } from "react-dom/client";
import { createRegistry } from "@react-router-modules/runtime";
import type { AppDependencies, AppSlots } from "@example-active/app-shared";
import integrationsModule from "@example-active/integrations-module";
import { createIntegrationsStore } from "./stores/integrations.js";
import { createIntegrationsClient } from "./services/integrations-client.js";
import { RootLayout } from "./components/RootLayout.js";
import { ShellLayout } from "./components/ShellLayout.js";
import { Home } from "./components/Home.js";

// Client first — the store closes over it so async actions can call the API
// without UI code having to plumb the service through.
const integrationsClient = createIntegrationsClient();
const integrationsStore = createIntegrationsStore(integrationsClient);

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { integrations: integrationsStore },
  services: { integrationsClient },
  slots: { integration: [] },
});

registry.register(integrationsModule);

const { App, recalculateSlots } = registry.resolve({
  rootComponent: RootLayout,
  indexComponent: Home,
  authenticatedRoute: {
    loader: () => null,
    Component: ShellLayout,
  },
});

// Swap topology: the module's `dynamicSlots` reads `activeManifest` directly,
// so we need to re-merge whenever the store changes (pick, fetch complete,
// error). Same wiring as the cumulative example — the library doesn't care
// which topology the app picked.
integrationsStore.subscribe(recalculateSlots);

createRoot(document.getElementById("root")!).render(<App />);
