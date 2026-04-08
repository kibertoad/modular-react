import { describe, it, expect } from "vitest";
import { createRegistry } from "./registry.js";
import { createStore } from "zustand/vanilla";
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";

interface TestDeps {
  auth: { user: string | null };
}

function createTestStore() {
  return createStore<TestDeps["auth"]>(() => ({ user: null }));
}

function DummyComponent() {
  return null;
}

describe("module entries", () => {
  it("collects meta and component from registered modules", () => {
    const registry = createRegistry<TestDeps>({
      stores: { auth: createTestStore() },
    });

    registry.register({
      id: "billing",
      version: "1.0.0",
      meta: { name: "Billing", category: "finance", icon: "credit-card" },
      component: DummyComponent,
    });

    registry.register({
      id: "users",
      version: "2.0.0",
      meta: { name: "Users", category: "admin" },
    });

    const { modules } = registry.resolve();

    expect(modules).toHaveLength(2);
    expect(modules[0]).toEqual({
      id: "billing",
      version: "1.0.0",
      meta: { name: "Billing", category: "finance", icon: "credit-card" },
      component: DummyComponent,
    });
    expect(modules[1]).toEqual({
      id: "users",
      version: "2.0.0",
      meta: { name: "Users", category: "admin" },
      component: undefined,
    });
  });

  it("includes modules without meta or component", () => {
    const registry = createRegistry<TestDeps>({
      stores: { auth: createTestStore() },
    });

    registry.register({
      id: "headless",
      version: "1.0.0",
    });

    const { modules } = registry.resolve();

    expect(modules).toHaveLength(1);
    expect(modules[0]).toEqual({
      id: "headless",
      version: "1.0.0",
      meta: undefined,
      component: undefined,
    });
  });

  it("preserves module registration order", () => {
    const registry = createRegistry<TestDeps>({
      stores: { auth: createTestStore() },
    });

    registry.register({ id: "c", version: "1.0.0", meta: { name: "C" } });
    registry.register({ id: "a", version: "1.0.0", meta: { name: "A" } });
    registry.register({ id: "b", version: "1.0.0", meta: { name: "B" } });

    const { modules } = registry.resolve();

    expect(modules.map((m) => m.id)).toEqual(["c", "a", "b"]);
  });

  it("works alongside routes, navigation, and slots", () => {
    const registry = createRegistry<TestDeps>({
      stores: { auth: createTestStore() },
    });

    registry.register({
      id: "full",
      version: "1.0.0",
      meta: { name: "Full Module" },
      component: DummyComponent,
      createRoutes: (parent: AnyRoute) =>
        createRoute({ getParentRoute: () => parent, path: "/full", component: () => <></> }),
      navigation: [{ label: "Full", to: "/full" }],
    });

    const { modules, navigation } = registry.resolve();

    expect(modules).toHaveLength(1);
    expect(modules[0].meta).toEqual({ name: "Full Module" });
    expect(modules[0].component).toBe(DummyComponent);
    expect(navigation.items).toHaveLength(1);
  });
});
