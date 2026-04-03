import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createStore } from "@modular-react/core";
import { SharedDependenciesContext, createSharedHooks } from "./context.js";

interface TestDeps {
  counter: { count: number };
}

const { useOptional } = createSharedHooks<TestDeps>();

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

describe("useOptional reactivity", () => {
  it("re-renders when underlying store changes", () => {
    const counterStore = createStore({ count: 0 });
    const wrapper = createWrapper({ stores: { counter: counterStore } });

    const { result } = renderHook(() => useOptional("counter"), { wrapper });
    expect(result.current).toEqual({ count: 0 });

    act(() => counterStore.setState({ count: 5 }));
    expect(result.current).toEqual({ count: 5 });
  });

  it("re-renders when underlying reactive service changes", () => {
    let snapshot = { count: 0 };
    const listeners = new Set<() => void>();
    const rs = {
      subscribe: (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      getSnapshot: () => snapshot,
    };
    const wrapper = createWrapper({ reactiveServices: { counter: rs } });

    const { result } = renderHook(() => useOptional("counter"), { wrapper });
    expect(result.current).toEqual({ count: 0 });

    act(() => {
      snapshot = { count: 10 };
      for (const cb of listeners) cb();
    });
    expect(result.current).toEqual({ count: 10 });
  });
});
