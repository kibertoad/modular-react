import { describe, it, expect, vi } from "vitest";
import { defineComponent } from "vue";
import type { RouteRecordRaw } from "vue-router";
import { createStore } from "@modular-frontend/core";
import { createRegistry } from "./registry.js";

interface TestAuth {
  user: string | null;
  login: () => void;
}

interface TestDeps {
  auth: TestAuth;
  api: { baseUrl: string };
}

interface TestSlots {
  commands: { id: string; label: string }[];
  [key: string]: readonly unknown[];
}

const Empty = defineComponent({ render: () => null });

function createTestAuthStore() {
  return createStore<TestAuth>({ user: null, login: () => {} });
}

function testModuleWithRoutes(id: string, path: string) {
  return {
    id,
    version: "1.0.0",
    createRoutes: (): RouteRecordRaw => ({ path, component: Empty }),
    requires: ["auth"] as const,
  };
}

function headlessModule(id: string) {
  return {
    id,
    version: "1.0.0",
    slots: { commands: [{ id: `${id}:cmd`, label: `${id} command` }] } as TestSlots,
    requires: ["auth"] as const,
  };
}

describe("createRegistry", () => {
  it("resolves route-owning and headless modules together", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
      slots: { commands: [] },
    });

    registry.register(testModuleWithRoutes("billing", "/billing"));
    registry.register(headlessModule("analytics"));

    const { slots, modules } = registry.resolveManifest();

    expect(slots.commands).toEqual([{ id: "analytics:cmd", label: "analytics command" }]);
    expect(modules.map((m) => m.id)).toEqual(["billing", "analytics"]);
  });

  it("runs onRegister lifecycle hooks with a deps snapshot", () => {
    const onRegister = vi.fn();

    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    registry.register({
      id: "test",
      version: "1.0.0",
      lifecycle: { onRegister },
    });

    registry.resolveManifest();

    expect(onRegister).toHaveBeenCalledOnce();
    const deps = onRegister.mock.calls[0]![0];
    expect(deps.auth).toEqual({ user: null, login: expect.any(Function) });
    expect(deps.api).toEqual({ baseUrl: "http://test" });
  });

  it("runs onRegister at most once across repeated resolveManifest() calls", () => {
    const onRegister = vi.fn();

    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    registry.register({ id: "test", version: "1.0.0", lifecycle: { onRegister } });

    registry.resolveManifest();
    registry.resolveManifest();

    expect(onRegister).toHaveBeenCalledOnce();
  });

  it("throws on duplicate module IDs", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    registry.register(headlessModule("same"));
    registry.register(headlessModule("same"));

    expect(() => registry.resolveManifest()).toThrow(/Duplicate module ID "same"/);
  });

  it("throws on missing required dependencies", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: {},
    });

    registry.register({
      id: "test",
      version: "1.0.0",
      requires: ["api"] as any,
    });

    expect(() => registry.resolveManifest()).toThrow(
      /Module "test" requires dependencies not provided/,
    );
  });

  it("prevents registration after resolveManifest", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    registry.resolveManifest();

    expect(() => registry.register(headlessModule("late"))).toThrow(
      /Cannot register modules after resolve/,
    );
  });

  it("warns on missing optional dependencies without throwing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: {},
    });

    registry.register({
      id: "test",
      version: "1.0.0",
      optionalRequires: ["api"] as any,
    });

    const manifest = registry.resolveManifest();
    expect(manifest.navigation.items).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("optional dependencies not provided: api"),
    );

    warnSpy.mockRestore();
  });

  it("is idempotent — returns the cached manifest and rejects options on later calls", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    registry.register(headlessModule("m"));

    const first = registry.resolveManifest();
    const second = registry.resolveManifest();

    expect(second).toBe(first);
    expect(() => registry.resolveManifest({ slotFilter: (s) => s })).toThrow(
      /options may only be passed on the first call/,
    );
  });

  it("exposes moduleDescriptors keyed by id", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    const mod = headlessModule("catalog");
    registry.register(mod);

    const { moduleDescriptors } = registry.resolveManifest();
    expect(moduleDescriptors.catalog).toBe(mod);
  });

  it("returns recalculateSlots as a function", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    const { recalculateSlots } = registry.resolveManifest();

    expect(recalculateSlots).toBeTypeOf("function");
    recalculateSlots();
  });

  it("recalculateSlots is a no-op when no dynamic slots or slotFilter exist", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    registry.register(headlessModule("static"));

    const { recalculateSlots } = registry.resolveManifest();

    recalculateSlots();
    recalculateSlots();
  });

  it("collects static slots from modules with dynamicSlots", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
      slots: { commands: [] },
    });

    registry.register({
      id: "dynamic-mod",
      version: "1.0.0",
      slots: { commands: [{ id: "static-cmd", label: "Static" }] },
      dynamicSlots: (deps) => ({
        commands: deps.auth.user ? [{ id: "dyn-cmd", label: "Dynamic" }] : [],
      }),
    });

    const { slots } = registry.resolveManifest();
    expect(slots.commands).toEqual([{ id: "static-cmd", label: "Static" }]);
  });

  it("returns a callable recalculateSlots when dynamicSlots are present", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
      slots: { commands: [] },
    });

    registry.register({
      id: "dynamic-mod",
      version: "1.0.0",
      dynamicSlots: () => ({ commands: [{ id: "dyn", label: "Dynamic" }] }),
    });

    const { recalculateSlots } = registry.resolveManifest();

    expect(recalculateSlots).toBeTypeOf("function");
    recalculateSlots();
  });

  it("returns a callable recalculateSlots when only slotFilter is present", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
      slots: { commands: [] },
    });

    registry.register(headlessModule("static"));

    const { recalculateSlots } = registry.resolveManifest({
      slotFilter: (slots) => slots,
    });

    expect(recalculateSlots).toBeTypeOf("function");
    recalculateSlots();
  });

  it("forwards onModuleExit on the manifest", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    const onModuleExit = () => {};
    const manifest = registry.resolveManifest({ onModuleExit });
    expect(manifest.onModuleExit).toBe(onModuleExit);
  });

  it("warns that registered lazy modules are not yet wired into the manifest", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    registry.registerLazy({
      id: "lazy-billing",
      basePath: "/billing",
      load: async () => ({ default: { id: "lazy-billing", version: "1.0.0" } }),
    });

    const manifest = registry.resolveManifest();

    // Lazy modules contribute nothing to the resolved manifest in PR-21 …
    expect(manifest.modules).toEqual([]);
    expect(manifest.moduleDescriptors["lazy-billing"]).toBeUndefined();
    // … but they do not vanish silently.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("lazy-module routing is not wired"),
    );

    warnSpy.mockRestore();
  });
});
