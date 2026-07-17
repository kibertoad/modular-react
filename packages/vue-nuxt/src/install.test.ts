import { describe, it, expect, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  type NavigationGuard,
  type Router,
  type RouteRecordRaw,
} from "vue-router";
import { createStore } from "@modular-frontend/core";
import { useModules, useNavigation, useSlots } from "@modular-vue/vue";
import { createRegistry } from "@modular-vue/runtime";
import { installModularApp, type NuxtAppLike } from "./install.js";

interface TestAuth {
  user: string | null;
}
interface TestDeps {
  auth: TestAuth;
  api: { baseUrl: string };
}
interface TestSlots {
  commands: { id: string; label: string }[];
  [key: string]: readonly unknown[];
}

function newRegistry(user: string | null = null) {
  return createRegistry<TestDeps, TestSlots>({
    stores: { auth: createStore<TestAuth>({ user }) },
    services: { api: { baseUrl: "http://test" } },
    slots: { commands: [] },
  });
}

// A page that prints its own label plus what the modular contexts injected, so
// tests assert both routing and provider wiring from the rendered DOM.
function page(id: string): RouteRecordRaw {
  return {
    path: `/${id}`,
    name: id,
    component: defineComponent({
      name: `${id}Page`,
      setup() {
        const nav = useNavigation();
        const modules = useModules();
        return () =>
          h("div", { class: id }, [
            h("h1", `page:${id}`),
            h("p", { class: "nav" }, nav.items.map((i) => String(i.label)).join(",")),
            h("p", { class: "modules" }, modules.map((m) => m.id).join(",")),
          ]);
      },
    }),
  };
}

function routedModule(id: string, navLabel: string) {
  return {
    id,
    version: "1.0.0",
    navigation: [{ label: navLabel, to: `/${id}` }],
    createRoutes: (): RouteRecordRaw => page(id),
  };
}

const Root = defineComponent({ name: "Root", render: () => h(RouterView) });

// Build the minimal NuxtApp slice `installModularApp` consumes. We don't mount
// through this `vueApp` (test-utils' mount creates its own app); we assert that
// the manifest was installed on it, and we mount `Root` with the manifest as a
// plugin to exercise the injected contexts end-to-end.
function nuxtAppFor(router: Router): NuxtAppLike & { vueApp: ReturnType<typeof createApp> } {
  return { vueApp: createApp({ render: () => null }), $router: router };
}

describe("installModularApp", () => {
  it("grafts module routes onto the Nuxt router and injects the contexts", async () => {
    const registry = newRegistry();
    registry.register(routedModule("billing", "Billing"));
    registry.register(routedModule("users", "Users"));

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const nuxtApp = nuxtAppFor(router);
    const manifest = installModularApp(nuxtApp, registry);

    // Routes were grafted onto the router Nuxt owns.
    expect(router.hasRoute("billing")).toBe(true);
    expect(router.hasRoute("users")).toBe(true);

    await router.push("/billing");
    const wrapper = mount(Root, { global: { plugins: [router, manifest] } });
    await router.isReady();
    await flushPromises();

    expect(wrapper.find("h1").text()).toBe("page:billing");
    expect(wrapper.find(".nav").text()).toBe("Billing,Users");
    expect(wrapper.find(".modules").text()).toBe("billing,users");

    await router.push("/users");
    await flushPromises();
    expect(wrapper.find("h1").text()).toBe("page:users");
  });

  it("installs the resolved manifest on nuxtApp.vueApp", () => {
    const registry = newRegistry();
    registry.register(routedModule("home", "Home"));

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const nuxtApp = nuxtAppFor(router);
    const useSpy = vi.spyOn(nuxtApp.vueApp, "use");

    const manifest = installModularApp(nuxtApp, registry);

    expect(useSpy).toHaveBeenCalledWith(manifest);
  });

  it("returns the manifest with router and resolved data", () => {
    const registry = newRegistry();
    registry.register(routedModule("billing", "Billing"));

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const manifest = installModularApp(nuxtAppFor(router), registry);

    expect(manifest.router).toBe(router);
    expect(manifest.navigation.items.map((i) => i.label)).toEqual(["Billing"]);
    expect(manifest.modules.map((m) => m.id)).toEqual(["billing"]);
    expect(manifest.recalculateSlots).toBeTypeOf("function");
  });

  it("grafts module routes under parentRouteName when given", () => {
    const registry = newRegistry();
    registry.register(routedModule("billing", "Billing"));

    const shell: RouteRecordRaw = {
      path: "/",
      name: "app",
      component: defineComponent({ render: () => h(RouterView) }),
    };
    const router = createRouter({ history: createMemoryHistory(), routes: [shell] });

    installModularApp(nuxtAppFor(router), registry, { parentRouteName: "app" });

    // The billing route is grafted under the "app" shell route, so resolving it
    // matches the shell first, then the module route.
    expect(router.hasRoute("billing")).toBe(true);
    expect(router.resolve({ name: "billing" }).matched.map((m) => m.name)).toEqual([
      "app",
      "billing",
    ]);
  });

  it("installs the auth guard via router.beforeEach", async () => {
    const registry = newRegistry();
    registry.register(routedModule("dashboard", "Dashboard"));
    registry.register(routedModule("login", "Login"));

    const guard: NavigationGuard = (to) => (to.path === "/login" ? true : "/login");
    const spy = vi.fn(guard);

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const manifest = installModularApp(nuxtAppFor(router), registry, { authGuard: spy });

    const wrapper = mount(Root, { global: { plugins: [router, manifest] } });
    await router.push("/dashboard");
    await flushPromises();

    expect(spy).toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe("/login");
    expect(wrapper.find("h1").text()).toBe("page:login");
  });

  it("forwards extra provider plugins and the onModuleExit callback", () => {
    const registry = newRegistry();
    registry.register(routedModule("home", "Home"));

    const installed: string[] = [];
    const extra = { install: () => installed.push("extra") };
    const onModuleExit = vi.fn();

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const nuxtApp = nuxtAppFor(router);
    const manifest = installModularApp(nuxtApp, registry, { providers: [extra], onModuleExit });

    // The provider plugin runs when the manifest is installed on nuxtApp.vueApp.
    expect(installed).toEqual(["extra"]);
    expect(manifest.onModuleExit).toBe(onModuleExit);
  });

  it("delivers static slots to useSlots() in module components", async () => {
    const registry = newRegistry();
    registry.register({
      id: "commands",
      version: "1.0.0",
      slots: { commands: [{ id: "c1", label: "Command One" }] } as TestSlots,
      createRoutes: (): RouteRecordRaw => ({
        path: "/commands",
        name: "commands",
        component: defineComponent({
          setup() {
            const slots = useSlots<TestSlots>();
            return () =>
              h("div", { class: "cmd" }, slots.value.commands.map((c) => c.label).join(","));
          },
        }),
      }),
    });

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const manifest = installModularApp(nuxtAppFor(router), registry);

    await router.push("/commands");
    const wrapper = mount(Root, { global: { plugins: [router, manifest] } });
    await router.isReady();
    await flushPromises();

    expect(wrapper.find(".cmd").text()).toBe("Command One");
  });

  it("propagates the single-use resolve() error for a reused registry", () => {
    const registry = newRegistry();
    registry.register(routedModule("home", "Home"));

    const router1 = createRouter({ history: createMemoryHistory(), routes: [] });
    installModularApp(nuxtAppFor(router1), registry);

    // A second install against the same (singleton) registry must throw — the
    // reason SSR apps build the registry per request.
    const router2 = createRouter({ history: createMemoryHistory(), routes: [] });
    expect(() => installModularApp(nuxtAppFor(router2), registry)).toThrow(
      /resolve\(\) can only be called once/,
    );
  });
});
