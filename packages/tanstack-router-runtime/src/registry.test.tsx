import { describe, it, expect, vi } from "vitest";
import { createRegistry } from "./registry.js";
import { createStore } from "zustand/vanilla";
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";

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

function createTestAuthStore() {
  return createStore<TestAuth>(() => ({
    user: null,
    login: () => {},
  }));
}

function testModuleWithRoutes(id: string, path: string) {
  return {
    id,
    version: "1.0.0",
    createRoutes: (parent: AnyRoute) =>
      createRoute({ getParentRoute: () => parent, path, component: () => <></> }),
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
  it("resolves with module routes and headless modules together", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
      slots: { commands: [] },
    });

    registry.register(testModuleWithRoutes("billing", "/billing"));
    registry.register(headlessModule("analytics"));

    const { App, slots } = registry.resolve({
      indexComponent: () => <></>,
    });

    expect(App).toBeDefined();
    expect(slots.commands).toEqual([{ id: "analytics:cmd", label: "analytics command" }]);
  });

  it("runs onRegister lifecycle hooks with deps snapshot", () => {
    const onRegister = vi.fn();
    const authStore = createTestAuthStore();

    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: authStore },
      services: { api: { baseUrl: "http://test" } },
    });

    registry.register({
      id: "test",
      version: "1.0.0",
      lifecycle: { onRegister },
    });

    registry.resolve();

    expect(onRegister).toHaveBeenCalledOnce();
    const deps = onRegister.mock.calls[0]![0];
    expect(deps.auth).toEqual({ user: null, login: expect.any(Function) });
    expect(deps.api).toEqual({ baseUrl: "http://test" });
  });

  it("passes providers to the App component", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    const TestProvider = ({ children }: { children: React.ReactNode }) => children;

    const { App } = registry.resolve({
      providers: [TestProvider],
    });

    expect(App).toBeDefined();
  });

  it("throws on duplicate module IDs", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    registry.register(headlessModule("same"));
    registry.register(headlessModule("same"));

    expect(() => registry.resolve()).toThrow(/Duplicate module ID "same"/);
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

    expect(() => registry.resolve()).toThrow(/Module "test" requires dependencies not provided/);
  });

  it("prevents registration after resolve", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    registry.resolve();

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

    // Should NOT throw
    const { App } = registry.resolve();
    expect(App).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("optional dependencies not provided: api"),
    );

    warnSpy.mockRestore();
  });

  it("prevents calling resolve twice", () => {
    const registry = createRegistry<TestDeps, TestSlots>({
      stores: { auth: createTestAuthStore() },
      services: { api: { baseUrl: "http://test" } },
    });

    registry.resolve();

    expect(() => registry.resolve()).toThrow(/resolve\(\) can only be called once/);
  });
});
