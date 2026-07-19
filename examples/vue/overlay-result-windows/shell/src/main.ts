import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createModularApp, createRegistry } from "@modular-vue/runtime";
import type { AppDependencies, AppSlots } from "@example-vue-overlay-windows/app-shared";
import runCore from "@example-vue-overlay-windows/run-core";
import acmeExtras from "@example-vue-overlay-windows/acme-extras";
import App from "./App.vue";
import ShellLayout from "./components/ShellLayout.vue";
import Home from "./components/Home.vue";

// Base slots declare `resultViews: []`; each registered module concatenates its
// own `OverlayEntry` windows onto it. Both window modules are headless — they
// contribute only slots, no routes — so the whole app renders on the index
// route (`Home`), which mounts the single `<OverlayOutlet>` overlay host.
const registry = createRegistry<AppDependencies, AppSlots>({
  stores: {},
  services: { auth: { userId: "demo-user" } },
  slots: { resultViews: [] },
});

registry.register(runCore);
registry.register(acmeExtras);

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
// The manifest is itself a Vue plugin: installing it wires the modular contexts
// (slots, modules, shared deps) app-wide, so `<OverlayOutlet>` / `useOverlay`
// can inject the slots source and resolve the host's contributed windows.
app.use(manifest);
app.mount("#app");
