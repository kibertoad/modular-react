import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  type NavigationGuard,
  type RouteRecordRaw,
} from "vue-router";
import { createStore } from "@modular-frontend/core";
import { useModules, useNavigation, useSlots } from "@modular-vue/vue";
import { createRegistry } from "./registry.js";
import { createModularApp } from "./app.js";

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

function createAuthStore(user: string | null = null) {
  return createStore<TestAuth>({ user });
}

function newRegistry(overrides?: Partial<TestDeps>) {
  return createRegistry<TestDeps, TestSlots>({
    stores: { auth: createAuthStore(overrides?.auth?.user) },
    services: { api: { baseUrl: "http://test" } },
    slots: { commands: [] },
  });
}

// A page that prints its own label plus what the modular contexts injected, so
// tests can assert both routing and provider wiring from the rendered DOM.
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

describe("createModularApp (router-owning integration)", () => {
  it("boots a memory router with two modules and navigates between them", async () => {
    const registry = newRegistry();
    registry.register(routedModule("billing", "Billing"));
    registry.register(routedModule("users", "Users"));

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const manifest = createModularApp(registry, { router });

    await router.push("/billing");
    const wrapper = mount(Root, { global: { plugins: [router, manifest] } });
    await router.isReady();
    await flushPromises();

    // First module renders, and it can read the injected navigation + modules.
    expect(wrapper.find("h1").text()).toBe("page:billing");
    expect(wrapper.find(".nav").text()).toBe("Billing,Users");
    expect(wrapper.find(".modules").text()).toBe("billing,users");

    // Navigate to the second module.
    await router.push("/users");
    await flushPromises();
    expect(wrapper.find("h1").text()).toBe("page:users");
  });

  it("exercises lazy module mounting after createRouter", async () => {
    const registry = newRegistry();
    registry.register(routedModule("home", "Home"));

    const load = vi.fn(async () => ({
      default: {
        id: "reports",
        version: "1.0.0",
        createRoutes: (): RouteRecordRaw => page("reports"),
      },
    }));
    registry.registerLazy({ id: "reports", basePath: "/reports", load });

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const manifest = createModularApp(registry, { router });

    await router.push("/home");
    const wrapper = mount(Root, { global: { plugins: [router, manifest] } });
    await router.isReady();
    await flushPromises();
    expect(load).not.toHaveBeenCalled();

    // First visit into the lazy basePath loads the descriptor, grafts the
    // subtree via router.addRoute(), and re-resolves onto the real page.
    await router.push("/reports");
    await flushPromises();

    expect(load).toHaveBeenCalledOnce();
    expect(router.hasRoute("reports")).toBe(true);
    expect(wrapper.find("h1").text()).toBe("page:reports");
  });

  it("installs the auth guard via router.beforeEach", async () => {
    const registry = newRegistry();
    registry.register(routedModule("dashboard", "Dashboard"));
    registry.register(routedModule("login", "Login"));

    // A metadata-free guard that redirects everything except /login to /login.
    const guard: NavigationGuard = (to) => (to.path === "/login" ? true : "/login");
    const spy = vi.fn(guard);

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const manifest = createModularApp(registry, { router, authGuard: spy });

    const wrapper = mount(Root, { global: { plugins: [router, manifest] } });
    await router.push("/dashboard");
    await flushPromises();

    expect(spy).toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe("/login");
    expect(wrapper.find("h1").text()).toBe("page:login");
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
    const manifest = createModularApp(registry, { router });

    await router.push("/commands");
    const wrapper = mount(Root, { global: { plugins: [router, manifest] } });
    await router.isReady();
    await flushPromises();

    expect(wrapper.find(".cmd").text()).toBe("Command One");
  });

  it("returns the router and resolved data on the manifest", () => {
    const registry = newRegistry();
    registry.register(routedModule("billing", "Billing"));

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const manifest = createModularApp(registry, { router });

    expect(manifest.router).toBe(router);
    expect(manifest.navigation.items.map((i) => i.label)).toEqual(["Billing"]);
    expect(manifest.modules.map((m) => m.id)).toEqual(["billing"]);
    expect(manifest.recalculateSlots).toBeTypeOf("function");
  });

  it("installs extra Vue plugins after the modular contexts", async () => {
    const registry = newRegistry();
    registry.register(routedModule("home", "Home"));

    const installed: string[] = [];
    const extra = { install: () => installed.push("extra") };

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const manifest = createModularApp(registry, { router, providers: [extra] });

    await router.push("/home");
    mount(Root, { global: { plugins: [router, manifest] } });
    await flushPromises();

    expect(installed).toEqual(["extra"]);
  });
});

describe("resolve() single-use and mode exclusivity", () => {
  it("throws when resolve() is called twice", () => {
    const registry = newRegistry();
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    registry.resolve({ router });

    expect(() => registry.resolve({ router })).toThrow(/resolve\(\) can only be called once/);
  });

  it("throws when resolve() is called after resolveManifest()", () => {
    const registry = newRegistry();
    registry.resolveManifest();

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    expect(() => registry.resolve({ router })).toThrow(/already in framework-mode/);
  });

  it("throws when resolveManifest() is called after resolve()", () => {
    const registry = newRegistry();
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    registry.resolve({ router });

    expect(() => registry.resolveManifest()).toThrow(/already owns a router/);
  });

  it("refuses further registration after resolve()", () => {
    const registry = newRegistry();
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    registry.resolve({ router });

    expect(() => registry.register(routedModule("late", "Late"))).toThrow(
      /Cannot register modules after resolve/,
    );
  });
});
