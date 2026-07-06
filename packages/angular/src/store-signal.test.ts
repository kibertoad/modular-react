import { describe, expect, it } from "vitest";
import { effect } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createStore } from "@modular-frontend/core";
import type { ReactiveService, Store } from "@modular-frontend/core";
import { reactiveServiceSignal, storeSignal } from "./store-signal.js";
import { renderInContext } from "./test-injector.js";

/** A Store wrapper that counts live subscriptions, for leak assertions. */
function trackingStore<T>(initial: T): Store<T> & { listenerCount(): number } {
  const inner = createStore<T>(initial);
  let count = 0;
  return {
    getState: inner.getState,
    getInitialState: inner.getInitialState,
    setState: inner.setState,
    subscribe(listener) {
      count++;
      const unsub = inner.subscribe(listener);
      return () => {
        count--;
        unsub();
      };
    },
    listenerCount: () => count,
  };
}

describe("storeSignal", () => {
  it("returns store state", () => {
    const authStore = createStore({ user: "alice" });
    const { result } = renderInContext(() => storeSignal(authStore));
    expect(result()).toEqual({ user: "alice" });
  });

  it("supports selectors", () => {
    const authStore = createStore({ user: "alice" });
    const { result } = renderInContext(() => storeSignal(authStore, (s) => s.user));
    expect(result()).toBe("alice");
  });

  it("updates on state change", () => {
    const authStore = createStore({ user: "alice" });
    const { result } = renderInContext(() => storeSignal(authStore, (s) => s.user));
    expect(result()).toBe("alice");

    authStore.setState({ user: "bob" });
    expect(result()).toBe("bob");
  });

  it("preserves the store's `this` binding when subscribing (method-based Store)", () => {
    // A Store whose `subscribe`/`getState` are `this`-using methods (not the
    // closure-based built-in). If the bridge passed `store.subscribe` bare it
    // would lose `this` and crash / never subscribe.
    const store = {
      listeners: new Set<() => void>(),
      state: { n: 0 },
      getState() {
        return this.state;
      },
      getInitialState() {
        return this.state;
      },
      setState(next: { n: number }) {
        this.state = next;
        for (const l of this.listeners) l();
      },
      subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => {
          this.listeners.delete(listener);
        };
      },
    } as unknown as Store<{ n: number }> & { setState(next: { n: number }): void };

    const { result } = renderInContext(() => storeSignal(store, (s) => s.n));
    expect(result()).toBe(0);

    store.setState({ n: 3 });
    expect(result()).toBe(3);
  });

  it("throws NG0203-style error outside an injection context", () => {
    const authStore = createStore({ user: "alice" });
    expect(() => storeSignal(authStore)).toThrow(/injection context/i);
  });

  it("runs outside an ambient context when given an explicit injector", () => {
    const authStore = createStore({ user: "alice" });
    const { injector } = renderInContext(() => storeSignal(authStore));
    // Not inside runInInjectionContext here — the injector option is the escape hatch.
    const user = storeSignal(authStore, (s) => s.user, { injector });
    expect(user()).toBe("alice");
  });

  it("subscribes on creation and unsubscribes on injector destroy", () => {
    const authStore = trackingStore({ user: "alice" });
    const { destroy } = renderInContext(() => storeSignal(authStore));
    expect(authStore.listenerCount()).toBe(1);

    destroy();
    expect(authStore.listenerCount()).toBe(0);
  });

  it("selector equality: does not re-run effects when the selected value is unchanged", () => {
    const authStore = createStore({ user: "alice", theme: "dark" });
    const { result, injector } = renderInContext(() => storeSignal(authStore, (s) => s.user));

    let runs = 0;
    runInContextEffect(injector, () => {
      result();
      runs++;
    });
    TestBed.tick();
    expect(runs).toBe(1);

    // Change an unrelated field — selected `user` is still "alice".
    authStore.setState({ theme: "light" });
    TestBed.tick();
    expect(runs).toBe(1);
    expect(result()).toBe("alice");

    // Change the selected field — the effect must re-run once.
    authStore.setState({ user: "bob" });
    TestBed.tick();
    expect(runs).toBe(2);
    expect(result()).toBe("bob");
  });
});

describe("reactiveServiceSignal", () => {
  it("returns snapshot from reactive service", () => {
    // getSnapshot must return a stable reference — the bridge assigns it into a
    // signal, which dedupes by Object.is, matching React's contract.
    const snapshot = { status: "online" };
    const rs: ReactiveService<{ status: string }> = {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
    };
    const { result } = renderInContext(() => reactiveServiceSignal(rs));
    expect(result()).toEqual({ status: "online" });
  });

  it("updates when the snapshot changes", () => {
    let snapshot = { count: 0 };
    const listeners = new Set<() => void>();
    const rs: ReactiveService<{ count: number }> = {
      subscribe: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      getSnapshot: () => snapshot,
    };
    const { result } = renderInContext(() => reactiveServiceSignal(rs, (s) => s.count));
    expect(result()).toBe(0);

    snapshot = { count: 10 };
    for (const cb of listeners) cb();
    expect(result()).toBe(10);
  });
});

// Small local helper so the effect is owned by the same destroyable injector.
function runInContextEffect(injector: import("@angular/core").Injector, fn: () => void): void {
  effect(fn, { injector });
}
