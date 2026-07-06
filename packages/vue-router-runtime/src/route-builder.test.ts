import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { createMemoryHistory, createRouter, type RouteRecordRaw, type Router } from "vue-router";
import type { ModuleDescriptor, LazyModuleDescriptor } from "@modular-vue/core";
import { graftModuleRoutes } from "./route-builder.js";

const Stub = defineComponent({ name: "Stub", render: () => h("div") });

function newRouter(routes: RouteRecordRaw[] = []): Router {
  return createRouter({ history: createMemoryHistory(), routes });
}

function fakeModule(overrides: Partial<ModuleDescriptor> = {}): ModuleDescriptor {
  return { id: overrides.id ?? "test", version: "0.1.0", ...overrides };
}

function moduleWithRoute(id: string, path: string): ModuleDescriptor {
  return fakeModule({ id, createRoutes: () => ({ path, name: id, component: Stub }) });
}

describe("graftModuleRoutes", () => {
  it("grafts each eager module's route onto the router", () => {
    const router = newRouter();
    graftModuleRoutes(router, [moduleWithRoute("billing", "/billing")], []);

    expect(router.hasRoute("billing")).toBe(true);
    expect(router.getRoutes().map((r) => r.path)).toContain("/billing");
  });

  it("skips headless modules (no createRoutes)", () => {
    const router = newRouter();
    graftModuleRoutes(
      router,
      [fakeModule({ id: "headless" }), moduleWithRoute("billing", "/billing")],
      [],
    );

    expect(router.getRoutes().map((r) => r.path)).toEqual(["/billing"]);
  });

  it("supports a module returning an array of routes", () => {
    const router = newRouter();
    const multi = fakeModule({
      id: "multi",
      createRoutes: (): RouteRecordRaw[] => [
        { path: "/one", name: "one", component: Stub },
        { path: "/two", name: "two", component: Stub },
      ],
    });
    graftModuleRoutes(router, [multi], []);

    expect(router.hasRoute("one")).toBe(true);
    expect(router.hasRoute("two")).toBe(true);
  });

  it("throws with the module id when createRoutes() returns a falsy value", () => {
    const router = newRouter();
    const bad = fakeModule({ id: "bad", createRoutes: () => null as unknown as RouteRecordRaw });

    expect(() => graftModuleRoutes(router, [bad], [])).toThrow(
      /Module "bad" createRoutes\(\) returned a falsy value/,
    );
  });

  it("propagates a thrown error from createRoutes() unchanged", () => {
    const router = newRouter();
    const throws = fakeModule({
      id: "throws",
      createRoutes: () => {
        throw new Error("boom from module");
      },
    });

    expect(() => graftModuleRoutes(router, [throws], [])).toThrow(/boom from module/);
  });

  it("grafts module routes under a named parent route when parentName is set", () => {
    const router = newRouter([{ path: "/app", name: "app", component: Stub, children: [] }]);
    graftModuleRoutes(router, [moduleWithRoute("billing", "billing")], [], { parentName: "app" });

    // The child resolves under the parent's path.
    const resolved = router.resolve("/app/billing");
    expect(resolved.matched.map((m) => m.name)).toEqual(["app", "billing"]);
  });

  describe("lazy modules", () => {
    function lazyModule(
      id: string,
      basePath: string,
      routes: () => RouteRecordRaw | RouteRecordRaw[],
    ): LazyModuleDescriptor {
      return {
        id,
        basePath,
        load: async () => ({ default: { id, version: "1.0.0", createRoutes: routes } }),
      };
    }

    it("loads the descriptor and grafts its subtree on first visit into basePath", async () => {
      const router = newRouter();
      const load = vi.fn(async () => ({
        default: {
          id: "billing",
          version: "1.0.0",
          createRoutes: () => ({ path: "/billing", name: "billing", component: Stub }),
        },
      }));
      graftModuleRoutes(router, [], [{ id: "billing", basePath: "/billing", load }]);

      // Not loaded until navigated into.
      expect(load).not.toHaveBeenCalled();
      expect(router.hasRoute("billing")).toBe(false);

      await router.push("/billing");

      expect(load).toHaveBeenCalledOnce();
      expect(router.hasRoute("billing")).toBe(true);
      expect(router.currentRoute.value.name).toBe("billing");
    });

    it("resolves a nested path inside the lazy subtree", async () => {
      const router = newRouter();
      graftModuleRoutes(
        router,
        [],
        [
          lazyModule("billing", "/billing", () => ({
            path: "/billing",
            name: "billing",
            component: Stub,
            children: [{ path: "invoices", name: "invoices", component: Stub }],
          })),
        ],
      );

      await router.push("/billing/invoices");

      expect(router.currentRoute.value.name).toBe("invoices");
      expect(router.currentRoute.value.matched.map((m) => m.name)).toEqual(["billing", "invoices"]);
    });

    it("loads the descriptor only once across repeated visits", async () => {
      const router = newRouter();
      const load = vi.fn(async () => ({
        default: {
          id: "billing",
          version: "1.0.0",
          createRoutes: () => ({ path: "/billing", name: "billing", component: Stub }),
        },
      }));
      graftModuleRoutes(router, [], [{ id: "billing", basePath: "/billing", load }]);

      await router.push("/billing");
      await router.push("/");
      await router.push("/billing");

      expect(load).toHaveBeenCalledOnce();
    });
  });
});
