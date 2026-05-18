import { createRoot } from "react-dom/client";
import { createRegistry } from "@react-router-modules/runtime";
import { compositionsPlugin } from "@modular-react/compositions";
import editorModule from "@example-rr-editor-composition/editor";
import contentfulModule from "@example-rr-editor-composition/contentful";
import strapiModule from "@example-rr-editor-composition/strapi";
import { editorComposition } from "@example-rr-editor-composition/app-shared";
import type { AppDependencies, AppSlots } from "@example-rr-editor-composition/app-shared";

import { Layout } from "./components/Layout.js";
import { Home } from "./components/Home.js";

// Build the registry with the compositions plugin wired in. The plugin
// contributes `registerComposition` onto the registry and exposes the
// runtime on `manifest.extensions.compositions` after `.resolve()`.
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
