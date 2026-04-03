import { describe, it, expect } from "vitest";
import { isStore, isStoreApi, isReactiveService, separateDeps } from "./detection.js";
import { createStore } from "./store.js";

describe("isStore", () => {
  it("returns true for a Store instance", () => {
    const store = createStore({ x: 1 });
    expect(isStore(store)).toBe(true);
  });

  it("returns true for a zustand-shaped object", () => {
    const fakeZustand = {
      getState: () => ({}),
      getInitialState: () => ({}),
      setState: () => {},
      subscribe: () => () => {},
    };
    expect(isStore(fakeZustand)).toBe(true);
  });

  it("returns false for an object missing getInitialState", () => {
    const partial = {
      getState: () => ({}),
      setState: () => {},
      subscribe: () => () => {},
    };
    expect(isStore(partial)).toBe(false);
  });

  it("returns false for a ReactiveService", () => {
    const rs = { subscribe: () => () => {}, getSnapshot: () => ({}) };
    expect(isStore(rs)).toBe(false);
  });

  it("returns false for null/undefined/primitives", () => {
    expect(isStore(null)).toBe(false);
    expect(isStore(undefined)).toBe(false);
    expect(isStore("string")).toBe(false);
  });
});

describe("isStoreApi (backward compat)", () => {
  it("is the same function as isStore", () => {
    expect(isStoreApi).toBe(isStore);
  });
});

describe("isReactiveService", () => {
  it("returns true for a ReactiveService", () => {
    const rs = { subscribe: () => () => {}, getSnapshot: () => ({}) };
    expect(isReactiveService(rs)).toBe(true);
  });

  it("returns false for a Store (has setState)", () => {
    const store = createStore({ x: 1 });
    expect(isReactiveService(store)).toBe(false);
  });
});

describe("separateDeps", () => {
  it("separates mixed deps into three buckets", () => {
    const store = createStore({ x: 1 });
    const rs = { subscribe: () => () => {}, getSnapshot: () => "snapshot" };
    const service = { fetch: () => {} };

    const { stores, services, reactiveServices } = separateDeps({
      myStore: store,
      myRS: rs,
      myService: service,
    });

    expect(Object.keys(stores)).toEqual(["myStore"]);
    expect(Object.keys(reactiveServices)).toEqual(["myRS"]);
    expect(Object.keys(services)).toEqual(["myService"]);
  });

  it("skips undefined values", () => {
    const { stores, services, reactiveServices } = separateDeps({
      missing: undefined,
    });
    expect(Object.keys(stores)).toHaveLength(0);
    expect(Object.keys(services)).toHaveLength(0);
    expect(Object.keys(reactiveServices)).toHaveLength(0);
  });
});
