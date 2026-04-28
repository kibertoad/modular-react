import { createRoot } from "react-dom/client";
import { Outlet } from "@tanstack/react-router";
import { createRegistry } from "@tanstack-react-modules/runtime";
import { journeysPlugin } from "@modular-react/journeys";
import type { AppDependencies, AppSlots } from "@example-tsr-integration-setup/app-shared";
import integrationPickerModule from "@example-tsr-integration-setup/integration-picker";
import githubModule from "@example-tsr-integration-setup/github-module";
import strapiModule from "@example-tsr-integration-setup/strapi-module";
import genericIntegrationModule from "@example-tsr-integration-setup/generic-integration";
import contentfulModule from "@example-tsr-integration-setup/contentful";
import notionModule from "@example-tsr-integration-setup/notion";
import { integrationSetupJourney } from "@example-tsr-integration-setup/integration-setup-journey";
import { Home } from "./Home.js";

// Minimal root layout — TanStack Router needs an `<Outlet />` host so the
// indexComponent can render. Nothing else lives here; visual structure
// belongs in `Home`.
function Root() {
  return <Outlet />;
}

const registry = createRegistry<AppDependencies, AppSlots>({
  services: { tenantId: "tenant-demo" },
  // Pre-seed the slot so `buildSlotsManifest` always exposes the array,
  // even before any module contributes — keeps the chooser's
  // `useSlots<AppSlots>()` call type-narrowed without a null check.
  slots: { integrations: [] },
}).use(journeysPlugin());

// Specific modules: these own UI for their integration's auth/data shape.
registry.register(integrationPickerModule);
registry.register(githubModule);
registry.register(strapiModule);
registry.register(genericIntegrationModule);

// Headless slot-only modules: surface Contentful + Notion to the chooser
// without an associated component. The journey's selectModuleOrDefault
// fallback routes both through the generic configure form.
registry.register(contentfulModule);
registry.register(notionModule);

// Single journey — all the branching behaviour we want to demo lives in
// the journey's `chosen` transition handler.
registry.registerJourney(integrationSetupJourney);

const { App } = registry.resolve({
  rootComponent: Root,
  indexComponent: Home,
});

createRoot(document.getElementById("root")!).render(<App />);
