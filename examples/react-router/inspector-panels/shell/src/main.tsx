import { createRoot } from "react-dom/client";
import { createRegistry } from "@react-router-modules/runtime";
import inspectorCore from "@example-rr-inspector-panels/inspector-core";
import acmeExtras from "@example-rr-inspector-panels/acme-extras";
import type { AppDependencies, AppSlots } from "@example-rr-inspector-panels/app-shared";

import { Layout } from "./components/Layout.js";
import { Home } from "./components/Home.js";

// Base slots declare `inspectorPanels: []`; each registered module concatenates
// its own `PanelEntry` contributions onto it. Both panel modules are headless —
// they contribute only slots, no routes — so the whole app renders on the index
// route (`Home`), which hosts the board and the `<PanelsOutlet>` inspector rail.
const registry = createRegistry<AppDependencies, AppSlots>({
  services: { auth: { userId: "demo-user" } },
  slots: { inspectorPanels: [] },
});

registry.register(inspectorCore);
registry.register(acmeExtras);

const { App } = registry.resolve({
  rootComponent: Layout,
  indexComponent: Home,
});

createRoot(document.getElementById("root")!).render(<App />);
