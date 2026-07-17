import { createApp, defineComponent, h } from "vue";
import { createRouter, createWebHistory, RouterView } from "vue-router";
import { createRegistry } from "@modular-vue/runtime";
import { compositionsPlugin } from "@modular-vue/compositions";
import editorModule from "@example-vue-editor/editor";
import contentfulModule from "@example-vue-editor/contentful";
import strapiModule from "@example-vue-editor/strapi";
import { editorComposition } from "@example-vue-editor/editor-composition";
import type { AppDependencies, AppSlots } from "@example-vue-editor/app-shared";
import Layout from "./components/Layout.vue";
import Home from "./components/Home.vue";

// Build the registry with the compositions plugin wired in. The plugin
// contributes `registerComposition` onto the registry and, via
// `resolveManifest()`, threads its <CompositionsProvider> into the Providers
// stack — so a <CompositionOutlet> mounted anywhere under it reads the runtime
// from context.
const registry = createRegistry<AppDependencies, AppSlots>({
  stores: {},
  services: { auth: { userId: "demo-user" } },
  slots: { commands: [] },
}).use(compositionsPlugin());

registry.register(editorModule);
registry.register(contentfulModule);
registry.register(strapiModule);

registry.registerComposition(editorComposition);

const manifest = registry.resolveManifest();

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: Layout, children: [{ path: "", name: "home", component: Home }] },
    ...manifest.routes,
  ],
});

const Root = defineComponent({
  name: "Root",
  setup: () => () => h(manifest.Providers, null, () => h(RouterView)),
});

const app = createApp(Root);
app.use(router);
app.mount("#app");
