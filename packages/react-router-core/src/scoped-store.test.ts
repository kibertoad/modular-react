import { describe, it, expect, vi } from "vitest";
import { createScopedStore } from "./scoped-store.js";

interface TabState {
  tabs: string[];
  activeTabId: string;
}

function createTestStore() {
  return createScopedStore<TabState>(() => ({
    tabs: ["directory"],
    activeTabId: "directory",
  }));
}

describe("createScopedStore", () => {
  describe("getOrCreate", () => {
    it("creates a new store on first access", () => {
      const scoped = createTestStore();
      const store = scoped.getOrCreate("interaction-1");

      expect(store.getState()).toEqual({
        tabs: ["directory"],
        activeTabId: "directory",
      });
    });

    it("returns the same store instance on subsequent access", () => {
      const scoped = createTestStore();
      const store1 = scoped.getOrCreate("interaction-1");
      const store2 = scoped.getOrCreate("interaction-1");

      expect(store1).toBe(store2);
    });

    it("creates independent stores for different scope IDs", () => {
      const scoped = createTestStore();
      const store1 = scoped.getOrCreate("interaction-1");
      const store2 = scoped.getOrCreate("interaction-2");

      expect(store1).not.toBe(store2);

      store1.setState({ activeTabId: "billing" });
      expect(store1.getState().activeTabId).toBe("billing");
      expect(store2.getState().activeTabId).toBe("directory");
    });

    it("calls initializer once per scope", () => {
      const initializer = vi.fn(() => ({ tabs: ["directory"], activeTabId: "directory" }));
      const scoped = createScopedStore(initializer);

      scoped.getOrCreate("a");
      scoped.getOrCreate("a");
      scoped.getOrCreate("b");

      expect(initializer).toHaveBeenCalledTimes(2);
    });
  });

  describe("has", () => {
    it("returns false for non-existent scope", () => {
      const scoped = createTestStore();
      expect(scoped.has("nope")).toBe(false);
    });

    it("returns true after scope is created", () => {
      const scoped = createTestStore();
      scoped.getOrCreate("interaction-1");
      expect(scoped.has("interaction-1")).toBe(true);
    });

    it("returns false after scope is removed", () => {
      const scoped = createTestStore();
      scoped.getOrCreate("interaction-1");
      scoped.remove("interaction-1");
      expect(scoped.has("interaction-1")).toBe(false);
    });
  });

  describe("remove", () => {
    it("removes a scope so next getOrCreate creates a fresh store", () => {
      const scoped = createTestStore();
      const store1 = scoped.getOrCreate("interaction-1");
      store1.setState({ activeTabId: "billing" });

      scoped.remove("interaction-1");

      const store2 = scoped.getOrCreate("interaction-1");
      expect(store2).not.toBe(store1);
      expect(store2.getState().activeTabId).toBe("directory"); // fresh default
    });

    it("is a no-op for non-existent scope", () => {
      const scoped = createTestStore();
      expect(() => scoped.remove("nope")).not.toThrow();
    });
  });

  describe("clear", () => {
    it("removes all scopes", () => {
      const scoped = createTestStore();
      scoped.getOrCreate("a");
      scoped.getOrCreate("b");
      scoped.getOrCreate("c");

      scoped.clear();

      expect(scoped.has("a")).toBe(false);
      expect(scoped.has("b")).toBe(false);
      expect(scoped.has("c")).toBe(false);
    });
  });

  describe("setState / getState on scoped stores", () => {
    it("supports functional setState updates", () => {
      const scoped = createTestStore();
      const store = scoped.getOrCreate("interaction-1");

      store.setState((prev) => ({
        tabs: [...prev.tabs, "billing"],
        activeTabId: "billing",
      }));

      expect(store.getState().tabs).toEqual(["directory", "billing"]);
      expect(store.getState().activeTabId).toBe("billing");
    });

    it("supports subscribe for external reactivity", () => {
      const scoped = createTestStore();
      const store = scoped.getOrCreate("interaction-1");
      const listener = vi.fn();

      store.subscribe(listener);
      store.setState({ activeTabId: "billing" });

      expect(listener).toHaveBeenCalledOnce();
    });
  });
});
