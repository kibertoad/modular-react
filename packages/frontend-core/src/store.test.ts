import { describe, it, expect, vi } from "vitest";
import { createStore } from "./store.js";

describe("createStore", () => {
  it("initializes with a plain object", () => {
    const store = createStore({ count: 0 });
    expect(store.getState()).toEqual({ count: 0 });
  });

  it("initializes with a factory function", () => {
    const store = createStore(() => ({ count: 5 }));
    expect(store.getState()).toEqual({ count: 5 });
  });

  it("shallow-merges partial updates", () => {
    const store = createStore({ a: 1, b: 2 });
    store.setState({ a: 10 });
    expect(store.getState()).toEqual({ a: 10, b: 2 });
  });

  it("accepts an updater function", () => {
    const store = createStore({ count: 0 });
    store.setState((s) => ({ count: s.count + 1 }));
    expect(store.getState()).toEqual({ count: 1 });
  });

  it("replaces entire state when replace=true", () => {
    const store = createStore({ a: 1, b: 2 } as Record<string, number>);
    store.setState({ c: 3 }, true);
    expect(store.getState()).toEqual({ c: 3 });
    expect((store.getState() as any).a).toBeUndefined();
  });

  it("getInitialState returns the original state", () => {
    const store = createStore({ count: 0 });
    store.setState({ count: 99 });
    expect(store.getInitialState()).toEqual({ count: 0 });
    expect(store.getState()).toEqual({ count: 99 });
  });

  it("getInitialState works with factory initializer", () => {
    const store = createStore(() => ({ count: 5 }));
    expect(store.getInitialState()).toEqual({ count: 5 });
  });

  it("notifies listeners with state and previousState", () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState({ count: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ count: 1 }, { count: 0 });
  });

  it("skips notification when updater returns same reference", () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    store.subscribe(listener);

    const currentState = store.getState();
    store.setState(() => currentState);
    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribes correctly", () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    const unsub = store.subscribe(listener);

    unsub();
    store.setState({ count: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple listeners", () => {
    const store = createStore({ count: 0 });
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    store.subscribe(listener1);
    store.subscribe(listener2);

    store.setState({ count: 1 });
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });
});
