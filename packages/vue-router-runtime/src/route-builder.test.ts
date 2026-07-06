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

    it("retries the load after a failed first attempt", async () => {
      const router = newRouter();
      // Fail the first load (a transient chunk 404), succeed the second.
      const load = vi
        .fn()
        .mockRejectedValueOnce(new Error("network blip"))
        .mockResolvedValueOnce({
          default: {
            id: "billing",
            version: "1.0.0",
            createRoutes: () => ({ path: "/billing", name: "billing", component: Stub }),
          },
        });
      graftModuleRoutes(router, [], [{ id: "billing", basePath: "/billing", load }]);

      // First visit rejects and the subtree is not grafted...
      await expect(router.push("/billing")).rejects.toThrow(/network blip/);
      expect(router.hasRoute("billing")).toBe(false);

      // ...but the guard reset its in-flight promise, so a retry loads again
      // and grafts the real subtree instead of caching the rejection forever.
      await router.push("/billing");
      expect(load).toHaveBeenCalledTimes(2);
      expect(router.hasRoute("billing")).toBe(true);
      expect(router.currentRoute.value.name).toBe("billing");
    });

    it("throws when a loaded lazy descriptor contributes no routes", async () => {
      const router = newRouter();
      const load = vi.fn(async () => ({ default: { id: "headless", version: "1.0.0" } }));
      graftModuleRoutes(router, [], [{ id: "headless", basePath: "/headless", load }]);

      // Rather than silently remove the placeholder and strand the user on a
      // dead route, the guard surfaces the misconfiguration.
      await expect(router.push("/headless")).rejects.toThrow(
        /Lazy module "headless" loaded but contributed no routes/,
      );
    });

    it("grafts a root-mounted lazy module without a malformed double slash", async () => {
      const router = newRouter();
      graftModuleRoutes(
        router,
        [],
        [
          lazyModule("root", "/", () => ({
            path: "/dashboard",
            name: "dashboard",
            component: Stub,
          })),
        ],
      );

      await router.push("/dashboard");

      expect(router.hasRoute("dashboard")).toBe(true);
      expect(router.currentRoute.value.name).toBe("dashboard");
    });
  });
});
