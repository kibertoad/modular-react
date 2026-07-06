import { describe, it, expect } from "vitest";
import { nextTick, watch } from "vue";
import { createStore } from "@modular-frontend/core";
import type { ReactiveService, Store } from "@modular-frontend/core";
import { createSharedComposables, sharedDependenciesKey } from "./context.js";
import { renderComposable } from "./test-render.js";

interface TestDeps {
  auth: { user: string };
  httpClient: { get: () => string };
  presence: { status: string };
}

const { useStore, useService, useReactiveService, useOptional } =
  createSharedComposables<TestDeps>();

function provideDeps(deps: {
  stores?: Record<string, any>;
  services?: Record<string, any>;
  reactiveServices?: Record<string, any>;
}) {
  return {
    provide: {
      [sharedDependenciesKey as symbol]: {
        stores: deps.stores ?? {},
        services: deps.services ?? {},
        reactiveServices: deps.reactiveServices ?? {},
      },
    },
  };
}

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

describe("useStore", () => {
  it("returns store state", () => {
    const authStore = createStore({ user: "alice" });
    const { result } = renderComposable(
      () => useStore("auth"),
      provideDeps({
        stores: { auth: authStore },
      }),
    );
    expect(result().value).toEqual({ user: "alice" });
  });

  it("supports selectors", () => {
    const authStore = createStore({ user: "alice" });
    const { result } = renderComposable(
      () => useStore("auth", (s) => s.user),
      provideDeps({
        stores: { auth: authStore },
      }),
    );
    expect(result().value).toBe("alice");
  });

  it("updates on state change", () => {
    const authStore = createStore({ user: "alice" });
    const { result } = renderComposable(
      () => useStore("auth", (s) => s.user),
      provideDeps({
        stores: { auth: authStore },
      }),
    );
    expect(result().value).toBe("alice");

    authStore.setState({ user: "bob" });
    expect(result().value).toBe("bob");
  });

  it("throws when key is not registered", () => {
    expect(() => renderComposable(() => useStore("auth"), provideDeps({}))).toThrow(
      /not registered/,
    );
  });
});

describe("useService", () => {
  it("returns the service", () => {
    const httpClient = { get: () => "data" };
    const { result } = renderComposable(
      () => useService("httpClient"),
      provideDeps({
        services: { httpClient },
      }),
    );
    expect(result()).toBe(httpClient);
  });

  it("throws with hint when key exists in wrong bucket", () => {
    const authStore = createStore({ user: "alice" });
    expect(() =>
      renderComposable(
        () => useService("auth" as any),
        provideDeps({
          stores: { auth: authStore },
        }),
      ),
    ).toThrow(/not a service.*useStore/);
  });
});

describe("useReactiveService", () => {
  it("returns snapshot from reactive service", () => {
    // getSnapshot must return a stable reference — the bridge assigns it into a
    // shallowRef, which dedupes by Object.is, matching React's contract.
    const snapshot = { status: "online" };
    const rs: ReactiveService<{ status: string }> = {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
    };
    const { result } = renderComposable(
      () => useReactiveService("presence"),
      provideDeps({
        reactiveServices: { presence: rs },
      }),
    );
    expect(result().value).toEqual({ status: "online" });
  });
});

describe("useOptional", () => {
  it("returns store state when key is a store", () => {
    const authStore = createStore({ user: "alice" });
    const { result } = renderComposable(
      () => useOptional("auth"),
      provideDeps({
        stores: { auth: authStore },
      }),
    );
    expect(result().value).toEqual({ user: "alice" });
  });

  it("returns service when key is a service", () => {
    const httpClient = { get: () => "data" };
    const { result } = renderComposable(
      () => useOptional("httpClient"),
      provideDeps({
        services: { httpClient },
      }),
    );
    expect(result().value).toBe(httpClient);
  });

  it("returns null when key is not registered", () => {
    const { result } = renderComposable(() => useOptional("auth"), provideDeps({}));
    expect(result().value).toBeNull();
  });
});

describe("useOptional reactivity", () => {
  it("updates when underlying store changes", () => {
    const counterStore = createStore({ count: 0 });
    const composables = createSharedComposables<{ counter: { count: number } }>();
    const { result } = renderComposable(
      () => composables.useOptional("counter"),
      provideDeps({
        stores: { counter: counterStore },
      }),
    );
    expect(result().value).toEqual({ count: 0 });

    counterStore.setState({ count: 5 });
    expect(result().value).toEqual({ count: 5 });
  });

  it("updates when underlying reactive service changes", () => {
    let snapshot = { count: 0 };
    const listeners = new Set<() => void>();
    const rs: ReactiveService<{ count: number }> = {
      subscribe: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      getSnapshot: () => snapshot,
    };
    const composables = createSharedComposables<{ counter: { count: number } }>();
    const { result } = renderComposable(
      () => composables.useOptional("counter"),
      provideDeps({
        reactiveServices: { counter: rs },
      }),
    );
    expect(result().value).toEqual({ count: 0 });

    snapshot = { count: 10 };
    for (const cb of listeners) cb();
    expect(result().value).toEqual({ count: 10 });
  });
});

describe("subscription lifecycle", () => {
  it("subscribes on mount and unsubscribes on unmount", () => {
    const authStore = trackingStore({ user: "alice" });
    const { wrapper } = renderComposable(
      () => useStore("auth"),
      provideDeps({
        stores: { auth: authStore },
      }),
    );
    expect(authStore.listenerCount()).toBe(1);

    wrapper.unmount();
    expect(authStore.listenerCount()).toBe(0);
  });

  it("selector equality: does not notify watchers when the selected value is unchanged", async () => {
    const authStore = createStore({ user: "alice", theme: "dark" });
    const { result } = renderComposable(
      () => useStore("auth", (s) => s.user),
      provideDeps({
        stores: { auth: authStore },
      }),
    );

    let notifications = 0;
    watch(result(), () => {
      notifications++;
    });

    // Change an unrelated field — selected `user` is still "alice".
    authStore.setState({ theme: "light" });
    await nextTick();
    expect(notifications).toBe(0);
    expect(result().value).toBe("alice");

    // Change the selected field — the watcher must fire once.
    authStore.setState({ user: "bob" });
    await nextTick();
    expect(notifications).toBe(1);
    expect(result().value).toBe("bob");
  });
});
