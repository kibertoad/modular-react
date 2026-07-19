import { createRoot } from "react-dom/client";
import { createRegistry } from "@react-router-modules/runtime";
import runCore from "@example-rr-overlay-windows/run-core";
import acmeExtras from "@example-rr-overlay-windows/acme-extras";
import type { AppDependencies, AppSlots } from "@example-rr-overlay-windows/app-shared";

import { Layout } from "./components/Layout.js";
import { Home } from "./components/Home.js";

// Base slots declare `resultViews: []`; each registered module concatenates its
// own `OverlayEntry` windows onto it. Both window modules are headless — they
// contribute only slots, no routes — so the whole app renders on the index
// route (`Home`), which mounts the single `<OverlayOutlet>` overlay host.
const registry = createRegistry<AppDependencies, AppSlots>({
  services: { auth: { userId: "demo-user" } },
  slots: { resultViews: [] },
});

registry.register(runCore);
registry.register(acmeExtras);

const { App } = registry.resolve({
  rootComponent: Layout,
  indexComponent: Home,
});

createRoot(document.getElementById("root")!).render(<App />);
