import { describe, it, expectTypeOf } from "vitest";
import { createApp } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { createStore } from "@modular-frontend/core";
import { createRegistry, type ApplicationManifest } from "@modular-vue/runtime";
import { installModularApp, type InstallModularAppOptions, type NuxtAppLike } from "./install.js";

interface Deps {
  auth: { user: string | null };
}
interface Slots {
  commands: { id: string; label: string }[];
  [key: string]: readonly unknown[];
}

describe("installModularApp types", () => {
  it("returns an ApplicationManifest typed by the registry generics", () => {
    const registry = createRegistry<Deps, Slots>({
      stores: { auth: createStore<Deps["auth"]>({ user: null }) },
      slots: { commands: [] },
    });
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const nuxtApp: NuxtAppLike = { vueApp: createApp({}), $router: router };

    const manifest = installModularApp(nuxtApp, registry);
    expectTypeOf(manifest).toMatchTypeOf<ApplicationManifest<Slots>>();
    expectTypeOf(manifest.slots).toMatchTypeOf<Slots>();
  });

  it("types the slotFilter over the registry's deps and slots", () => {
    expectTypeOf<InstallModularAppOptions<Deps, Slots>["slotFilter"]>().toMatchTypeOf<
      ((slots: Slots, deps: Deps) => Slots) | undefined
    >();
  });
});
