import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createStore } from "@modular-react/core";
import type { ReactiveService } from "@modular-react/core";
import { SharedDependenciesContext, createSharedHooks } from "./context.js";

interface TestDeps {
  auth: { user: string };
  httpClient: { get: () => string };
  presence: { status: string };
}

const { useStore, useService, useReactiveService, useOptional } = createSharedHooks<TestDeps>();

function createWrapper(deps: {
  stores?: Record<string, any>;
  services?: Record<string, any>;
  reactiveServices?: Record<string, any>;
}) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SharedDependenciesContext
        value={{
          stores: deps.stores ?? {},
          services: deps.services ?? {},
          reactiveServices: deps.reactiveServices ?? {},
        }}
      >
        {children}
      </SharedDependenciesContext>
    );
  };
}

describe("useStore", () => {
  it("returns store state", () => {
    const authStore = createStore({ user: "alice" });
    const wrapper = createWrapper({ stores: { auth: authStore } });

    const { result } = renderHook(() => useStore("auth"), { wrapper });
    expect(result.current).toEqual({ user: "alice" });
  });

  it("supports selectors", () => {
    const authStore = createStore({ user: "alice" });
    const wrapper = createWrapper({ stores: { auth: authStore } });

    const { result } = renderHook(() => useStore("auth", (s) => s.user), { wrapper });
    expect(result.current).toBe("alice");
  });

  it("re-renders on state change", () => {
    const authStore = createStore({ user: "alice" });
    const wrapper = createWrapper({ stores: { auth: authStore } });

    const { result } = renderHook(() => useStore("auth", (s) => s.user), { wrapper });
    expect(result.current).toBe("alice");

    act(() => authStore.setState({ user: "bob" }));
    expect(result.current).toBe("bob");
  });

  it("throws when key is not registered", () => {
    const wrapper = createWrapper({});
    expect(() => renderHook(() => useStore("auth"), { wrapper })).toThrow(/not registered/);
  });
});

describe("useService", () => {
  it("returns the service", () => {
    const httpClient = { get: () => "data" };
    const wrapper = createWrapper({ services: { httpClient } });

    const { result } = renderHook(() => useService("httpClient"), { wrapper });
    expect(result.current).toBe(httpClient);
  });

  it("throws with hint when key exists in wrong bucket", () => {
    const authStore = createStore({ user: "alice" });
    const wrapper = createWrapper({ stores: { auth: authStore } });

    expect(() => renderHook(() => useService("auth" as any), { wrapper })).toThrow(
      /not a service.*useStore/,
    );
  });
});

describe("useReactiveService", () => {
  it("returns snapshot from reactive service", () => {
    // getSnapshot must return a stable reference — useSyncExternalStore
    // will infinite-loop if a new object is created on each call.
    const snapshot = { status: "online" };
    const rs: ReactiveService<{ status: string }> = {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
    };
    const wrapper = createWrapper({ reactiveServices: { presence: rs } });

    const { result } = renderHook(() => useReactiveService("presence"), { wrapper });
    expect(result.current).toEqual({ status: "online" });
  });
});

describe("useOptional", () => {
  it("returns store state when key is a store", () => {
    const authStore = createStore({ user: "alice" });
    const wrapper = createWrapper({ stores: { auth: authStore } });

    const { result } = renderHook(() => useOptional("auth"), { wrapper });
    expect(result.current).toEqual({ user: "alice" });
  });

  it("returns service when key is a service", () => {
    const httpClient = { get: () => "data" };
    const wrapper = createWrapper({ services: { httpClient } });

    const { result } = renderHook(() => useOptional("httpClient"), { wrapper });
    expect(result.current).toBe(httpClient);
  });

  it("returns null when key is not registered", () => {
    const wrapper = createWrapper({});

    const { result } = renderHook(() => useOptional("auth"), { wrapper });
    expect(result.current).toBeNull();
  });
});
