import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import type { RouteRecordRaw } from "vue-router";
import { createStore } from "@modular-frontend/core";
import { useModules, useNavigation, useSlots } from "@modular-vue/vue";
import { createRegistry } from "./registry.js";

/**
 * `resolveManifest()` is the framework-mode entry point — the host owns the
 * router, so the registry produces a `Providers` component and the eager module
 * `routes`, but does NOT create a router. These tests port the intent of the
 * React `resolve-manifest.test.tsx` onto the Vue provider component.
 */

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

function createAuthStore() {
  return createStore<TestAuth>({ user: null });
}

function newRegistry() {
  return createRegistry<TestDeps, TestSlots>({
    stores: { auth: createAuthStore() },
    services: { api: { baseUrl: "http://test" } },
    slots: { commands: [] },
  });
}

function headlessModule(id: string, opts?: { navigation?: boolean; slots?: boolean }) {
  return {
    id,
    version: "1.0.0",
    navigation: opts?.navigation ? [{ label: `${id}:nav`, to: `/${id}` }] : undefined,
    slots: opts?.slots
      ? ({ commands: [{ id: `${id}:cmd`, label: `${id} command` }] } as TestSlots)
      : undefined,
  };
}

const Empty = defineComponent({ render: () => null });

function routedModule(id: string, path: string) {
  return {
    id,
    version: "1.0.0",
    createRoutes: (): RouteRecordRaw => ({ path, name: id, component: Empty }),
  };
}

describe("resolveManifest (framework mode)", () => {
  describe("shape", () => {
    it("returns Providers, routes, navigation, slots, modules, recalculateSlots", () => {
      const registry = newRegistry();
      registry.register(headlessModule("m", { navigation: true, slots: true }));

      const manifest = registry.resolveManifest();

      expect(manifest.Providers).toBeTypeOf("object"); // a defineComponent options object
      expect(Array.isArray(manifest.routes)).toBe(true);
      expect(manifest.navigation.items).toHaveLength(1);
      expect(manifest.slots.commands).toHaveLength(1);
      expect(manifest.modules).toHaveLength(1);
      expect(manifest.recalculateSlots).toBeTypeOf("function");
    });

    it("returns eager module routes and an empty array when none declare routes", () => {
      const r1 = newRegistry();
      r1.register(routedModule("a", "/a"));
      r1.register(routedModule("b", "/b"));
      expect(r1.resolveManifest().routes.map((r) => (r as { path: string }).path)).toEqual([
        "/a",
        "/b",
      ]);

      const r2 = newRegistry();
      r2.register(headlessModule("headless"));
      expect(r2.resolveManifest().routes).toEqual([]);
    });

    it("returns the same routes array reference across calls", () => {
      const registry = newRegistry();
      registry.register(routedModule("r", "/r"));

      const first = registry.resolveManifest().routes;
      const second = registry.resolveManifest().routes;
      expect(second).toBe(first);
    });
  });

  describe("Providers component", () => {
    function probe(
      capture: (v: { nav: string[]; slotCount: number; moduleIds: string[] }) => void,
    ) {
      return defineComponent({
        setup() {
          const nav = useNavigation();
          const slots = useSlots<TestSlots>();
          const modules = useModules();
          capture({
            nav: nav.items.map((i) => String(i.label)),
            slotCount: slots.value.commands.length,
            moduleIds: modules.map((m) => m.id),
          });
          return () => h("div");
        },
      });
    }

    it("delivers navigation, slots, and module entries to composables in children", () => {
      const registry = newRegistry();
      registry.register(headlessModule("billing", { navigation: true, slots: true }));

      const { Providers } = registry.resolveManifest();

      let captured: { nav: string[]; slotCount: number; moduleIds: string[] } | null = null;
      mount(
        defineComponent({
          render: () => h(Providers, null, () => h(probe((v) => (captured = v)))),
        }),
      );

      expect(captured).toEqual({ nav: ["billing:nav"], slotCount: 1, moduleIds: ["billing"] });
    });

    it("wraps user-supplied providers around the context stack in order", () => {
      const registry = newRegistry();
      const calls: string[] = [];
      const Outer = defineComponent({
        setup(_, { slots }) {
          calls.push("outer");
          return () => h("div", { class: "outer" }, slots.default?.());
        },
      });
      const Inner = defineComponent({
        setup(_, { slots }) {
          calls.push("inner");
          return () => h("div", { class: "inner" }, slots.default?.());
        },
      });

      const { Providers } = registry.resolveManifest({ providers: [Outer, Inner] });

      const wrapper = mount(
        defineComponent({
          render: () => h(Providers, null, () => h("span", { class: "child" })),
        }),
      );

      // First element is outermost: .outer contains .inner contains .child.
      expect(wrapper.find(".outer > .inner > .child").exists()).toBe(true);
      expect(calls).toEqual(["outer", "inner"]);
    });

    it("applies slotFilter from options to the slots delivered by Providers", () => {
      const registry = newRegistry();
      registry.register({
        id: "dyn",
        version: "1.0.0",
        dynamicSlots: () => ({
          commands: [
            { id: "keep", label: "Keep" },
            { id: "drop", label: "Drop" },
          ],
        }),
      });

      const { Providers } = registry.resolveManifest({
        slotFilter: (slots) => ({
          ...slots,
          commands: slots.commands.filter((c) => c.id !== "drop"),
        }),
      });

      let observed: { id: string; label: string }[] | null = null;
      const Probe = defineComponent({
        setup() {
          observed = useSlots<TestSlots>().value.commands;
          return () => h("div");
        },
      });
      mount(defineComponent({ render: () => h(Providers, null, () => h(Probe)) }));

      expect(observed).toEqual([{ id: "keep", label: "Keep" }]);
    });
  });

  describe("lazy modules", () => {
    it("warns that lazy modules are not wired in framework mode", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const registry = newRegistry();
      registry.registerLazy({
        id: "lazy",
        basePath: "/lazy",
        load: async () => ({ default: { id: "lazy", version: "1.0.0" } }),
      });

      const manifest = registry.resolveManifest();

      expect(manifest.routes).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("lazy-module routing is not wired"),
      );
      warnSpy.mockRestore();
    });
  });
});
