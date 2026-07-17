import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createModularApp, createRegistry } from "@modular-vue/runtime";
import type { AppDependencies, AppSlots } from "@example-vue-integration-manager/app-shared";
import contentful from "@example-vue-integration-manager/contentful";
import github from "@example-vue-integration-manager/github";
import strapi from "@example-vue-integration-manager/strapi";
import App from "./App.vue";
import ShellLayout from "./components/ShellLayout.vue";
import Home from "./components/Home.vue";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: {},
  services: { auth: { userId: "demo-user" } },
  slots: { commands: [] },
});

registry.register(contentful);
registry.register(strapi);
registry.register(github);

// The shell owns the router. It declares a layout route at "/" whose nested
// `<router-view>` hosts module routes; the index child renders Home. Module
// routes are grafted under the named "root" route via `parentRouteName`, so
// they render inside `ShellLayout` next to the sidebar + header chrome.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "root",
      component: ShellLayout,
      children: [{ path: "", name: "home", component: Home }],
    },
  ],
});

const manifest = createModularApp(registry, { router, parentRouteName: "root" });

const app = createApp(App);
app.use(router);
// The manifest is itself a Vue plugin: installing it wires the modular
// contexts (navigation, modules, slots, shared deps) app-wide, so every
// `<router-view>`-mounted component can inject them.
app.use(manifest);
app.mount("#app");
