import { describe, expect, it } from "vitest";
import { effect, type Provider } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createStore } from "@modular-frontend/core";
import type { ReactiveService } from "@modular-frontend/core";
import { createSharedInjectors, provideSharedDependencies } from "./context.js";
import { renderInContext } from "./test-injector.js";

interface TestDeps {
  auth: { user: string };
  httpClient: { get: () => string };
  presence: { status: string };
}

const { injectStore, injectService, injectReactiveService, injectOptional } =
  createSharedInjectors<TestDeps>();

function provideDeps(deps: {
  stores?: Record<string, any>;
  services?: Record<string, any>;
  reactiveServices?: Record<string, any>;
}): Provider[] {
  return [
    provideSharedDependencies({
      stores: deps.stores ?? {},
      services: deps.services ?? {},
      reactiveServices: deps.reactiveServices ?? {},
    }),
  ];
}

describe("injectStore", () => {
  it("returns store state", () => {
    const authStore = createStore({ user: "alice" });
    const { result } = renderInContext(
      () => injectStore("auth"),
      provideDeps({ stores: { auth: authStore } }),
    );
    expect(result()).toEqual({ user: "alice" });
  });

  it("supports selectors", () => {
    const authStore = createStore({ user: "alice" });
    const { result } = renderInContext(
      () => injectStore("auth", (s) => s.user),
      provideDeps({ stores: { auth: authStore } }),
    );
    expect(result()).toBe("alice");
  });

  it("updates on state change", () => {
    const authStore = createStore({ user: "alice" });
    const { result } = renderInContext(
      () => injectStore("auth", (s) => s.user),
      provideDeps({ stores: { auth: authStore } }),
    );
    expect(result()).toBe("alice");

    authStore.setState({ user: "bob" });
    expect(result()).toBe("bob");
  });

  it("throws when key is not registered", () => {
    expect(() => renderInContext(() => injectStore("auth"), provideDeps({}))).toThrow(
      /not registered/,
    );
  });

  it("throws when used without a modular app provider", () => {
    expect(() => renderInContext(() => injectStore("auth"))).toThrow(/within a modular app/);
  });
});

describe("injectService", () => {
  it("returns the service", () => {
    const httpClient = { get: () => "data" };
    const { result } = renderInContext(
      () => injectService("httpClient"),
      provideDeps({ services: { httpClient } }),
    );
    expect(result).toBe(httpClient);
  });

  it("throws with hint when key exists in wrong bucket", () => {
    const authStore = createStore({ user: "alice" });
    expect(() =>
      renderInContext(
        () => injectService("auth" as any),
        provideDeps({ stores: { auth: authStore } }),
      ),
    ).toThrow(/not a service.*injectStore/);
  });
});

describe("injectReactiveService", () => {
  it("returns snapshot from reactive service", () => {
    const snapshot = { status: "online" };
    const rs: ReactiveService<{ status: string }> = {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
    };
    const { result } = renderInContext(
      () => injectReactiveService("presence"),
      provideDeps({ reactiveServices: { presence: rs } }),
    );
    expect(result()).toEqual({ status: "online" });
  });
});

describe("injectOptional", () => {
  it("returns store state when key is a store", () => {
    const authStore = createStore({ user: "alice" });
    const { result } = renderInContext(
      () => injectOptional("auth"),
      provideDeps({ stores: { auth: authStore } }),
    );
    expect(result()).toEqual({ user: "alice" });
  });

  it("returns service when key is a service", () => {
    const httpClient = { get: () => "data" };
    const { result } = renderInContext(
      () => injectOptional("httpClient"),
      provideDeps({ services: { httpClient } }),
    );
    expect(result()).toBe(httpClient);
  });

  it("returns null when key is not registered", () => {
    const { result } = renderInContext(() => injectOptional("auth"), provideDeps({}));
    expect(result()).toBeNull();
  });
});

describe("injectOptional reactivity", () => {
  it("updates when underlying store changes", () => {
    const counterStore = createStore({ count: 0 });
    const injectors = createSharedInjectors<{ counter: { count: number } }>();
    const { result } = renderInContext(
      () => injectors.injectOptional("counter"),
      provideDeps({ stores: { counter: counterStore } }),
    );
    expect(result()).toEqual({ count: 0 });

    counterStore.setState({ count: 5 });
    expect(result()).toEqual({ count: 5 });
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
    const injectors = createSharedInjectors<{ counter: { count: number } }>();
    const { result } = renderInContext(
      () => injectors.injectOptional("counter"),
      provideDeps({ reactiveServices: { counter: rs } }),
    );
    expect(result()).toEqual({ count: 0 });

    snapshot = { count: 10 };
    for (const cb of listeners) cb();
    expect(result()).toEqual({ count: 10 });
  });
});

describe("subscription lifecycle", () => {
  it("selector equality: does not re-run effects when the selected value is unchanged", () => {
    const authStore = createStore({ user: "alice", theme: "dark" });
    const injectors = createSharedInjectors<{ auth: { user: string; theme: string } }>();
    const { result, injector } = renderInContext(
      () => injectors.injectStore("auth", (s) => s.user),
      provideDeps({ stores: { auth: authStore } }),
    );

    let runs = 0;
    effect(
      () => {
        result();
        runs++;
      },
      { injector },
    );
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
