import { describe, it, expect, vi } from "vitest";
import { createStore } from "./store.js";

describe("createStore with non-object state", () => {
  it("works with a number", () => {
    const store = createStore(0);
    expect(store.getState()).toBe(0);

    store.setState(42);
    expect(store.getState()).toBe(42);
  });

  it("works with a string", () => {
    const store = createStore("hello");
    expect(store.getState()).toBe("hello");

    store.setState("world");
    expect(store.getState()).toBe("world");
  });

  it("works with null", () => {
    const store = createStore<string | null>("initial");
    store.setState(null);
    expect(store.getState()).toBeNull();
  });

  it("notifies on primitive state change", () => {
    const store = createStore(0);
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState(1);
    expect(listener).toHaveBeenCalledWith(1, 0);
  });

  it("skips notification when primitive is same value", () => {
    const store = createStore(42);
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState(42);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("createStore with updater returning full state", () => {
  it("replaces via updater function", () => {
    const store = createStore(10);
    store.setState((s) => s + 5);
    expect(store.getState()).toBe(15);
  });
});
