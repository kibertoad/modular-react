import { createRoot } from "react-dom/client";
import { createRegistry } from "@tanstack-react-modules/runtime";
import type { AppDependencies, AppSlots } from "@example-tsr-integration-manager/app-shared";
import contentful from "@example-tsr-integration-manager/contentful";
import github from "@example-tsr-integration-manager/github";
import strapi from "@example-tsr-integration-manager/strapi";
import { Layout } from "./components/Layout.js";
import { Home } from "./components/Home.js";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: {},
  services: { auth: { userId: "demo-user" } },
  slots: { commands: [] },
});

registry.register(contentful);
registry.register(strapi);
registry.register(github);

const { App } = registry.resolve({
  rootComponent: Layout,
  indexComponent: Home,
});

createRoot(document.getElementById("root")!).render(<App />);
