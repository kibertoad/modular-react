import { createRoot } from "react-dom/client";
import { createRegistry } from "@tanstack-react-modules/runtime";
import { compositionsPlugin } from "@modular-react/compositions";
import editorModule from "@example-tsr-editor-composition/editor";
import contentfulModule from "@example-tsr-editor-composition/contentful";
import strapiModule from "@example-tsr-editor-composition/strapi";
import { editorComposition } from "@example-tsr-editor-composition/editor-composition";
import type { AppDependencies, AppSlots } from "@example-tsr-editor-composition/app-shared";

import { Layout } from "./components/Layout.js";
import { Home } from "./components/Home.js";

// Same wiring as the React Router sibling: register modules, register the
// composition with the plugin, resolve, render. The TSR runtime exposes
// the compositions runtime under `manifest.extensions.compositions` the
// same way the RR runtime does — the plugin is router-agnostic.
const registry = createRegistry<AppDependencies, AppSlots>({
  services: { auth: { userId: "demo-user" } },
  slots: { commands: [] },
}).use(compositionsPlugin());

registry.register(editorModule);
registry.register(contentfulModule);
registry.register(strapiModule);

registry.registerComposition(editorComposition);

const { App } = registry.resolve({
  rootComponent: Layout,
  indexComponent: Home,
});

createRoot(document.getElementById("root")!).render(<App />);
