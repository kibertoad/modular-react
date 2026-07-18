import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, defineStore, setActivePinia } from "pinia";

import { createPiniaStoreAdapter } from "./pinia-store.js";

interface CounterState {
  count: number;
  label: string;
}

const useCounter = defineStore("counter", {
  state: (): CounterState => ({ count: 0, label: "a" }),
});

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("createPiniaStoreAdapter", () => {
  it("reads live state via getState when unsubscribed", () => {
    const adapted = createPiniaStoreAdapter(useCounter());
    expect(adapted.getState()).toEqual({ count: 0, label: "a" });

    useCounter().count = 5;
    expect(adapted.getState()).toEqual({ count: 5, label: "a" });
  });

  it("getInitialState returns the snapshot captured at creation", () => {
    const store = useCounter();
    const adapted = createPiniaStoreAdapter(store);
    store.count = 9;
    expect(adapted.getInitialState()).toEqual({ count: 0, label: "a" });
  });

  it("setState merges a partial via $patch, visible synchronously", () => {
    const store = useCounter();
    const adapted = createPiniaStoreAdapter(store);

    adapted.setState({ count: 3 });
    expect(store.count).toBe(3);
    expect(store.label).toBe("a"); // merge, not replace
    expect(adapted.getState()).toEqual({ count: 3, label: "a" });
  });

  it("setState with an updater fn receives the current state", () => {
    const adapted = createPiniaStoreAdapter(useCounter());
    adapted.setState({ count: 2 });
    adapted.setState((s) => ({ count: s.count + 1 }));
    expect(useCounter().count).toBe(3);
  });

  it("setState with replace overwrites the whole state", () => {
    const store = useCounter();
    const adapted = createPiniaStoreAdapter(store);
    adapted.setState({ count: 10, label: "z" }, true);
    expect(store.$state).toEqual({ count: 10, label: "z" });
  });

  it("subscribe fires synchronously with (state, previousState)", () => {
    const adapted = createPiniaStoreAdapter(useCounter());
    const spy = vi.fn();
    const unsub = adapted.subscribe(spy);

    adapted.setState({ count: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    const [state, previous] = spy.mock.calls[0]!;
    expect(state.count).toBe(1);
    expect(previous.count).toBe(0);
    // Fresh snapshot identity per change — this is what gives storeRef /
    // useSyncExternalStore consumers a real change signal.
    expect(state).not.toBe(previous);

    unsub();
    adapted.setState({ count: 2 });
    expect(spy).toHaveBeenCalledTimes(1); // no callbacks after unsubscribe
  });

  it("reflects a direct Pinia mutation to subscribers", () => {
    const store = useCounter();
    const adapted = createPiniaStoreAdapter(store);
    const spy = vi.fn();
    adapted.subscribe(spy);

    store.count = 42; // mutate the Pinia store directly
    expect(spy).toHaveBeenCalled();
    expect(adapted.getState().count).toBe(42);
  });

  it("keeps getState identity stable between changes while subscribed", () => {
    const adapted = createPiniaStoreAdapter(useCounter());
    adapted.subscribe(() => {});

    const a = adapted.getState();
    expect(adapted.getState()).toBe(a);

    adapted.setState({ count: 1 });
    expect(adapted.getState()).not.toBe(a);
  });

  it("re-syncs the cache to live state when a subscription starts", () => {
    const store = useCounter();
    const adapted = createPiniaStoreAdapter(store);
    store.count = 7; // mutate while unsubscribed
    adapted.subscribe(() => {});
    expect(adapted.getState().count).toBe(7);
  });
});
