import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createScopedStore } from "./scoped-store.js";

describe("createScopedStore", () => {
  it("creates a store on first getOrCreate", () => {
    const scoped = createScopedStore(() => ({ count: 0 }));
    expect(scoped.has("scope-1")).toBe(false);

    const store = scoped.getOrCreate("scope-1");
    expect(scoped.has("scope-1")).toBe(true);
    expect(store.getState()).toEqual({ count: 0 });
  });

  it("returns same store on repeated getOrCreate", () => {
    const scoped = createScopedStore(() => ({ count: 0 }));
    const s1 = scoped.getOrCreate("scope-1");
    const s2 = scoped.getOrCreate("scope-1");
    expect(s1).toBe(s2);
  });

  it("removes a scope", () => {
    const scoped = createScopedStore(() => ({ count: 0 }));
    scoped.getOrCreate("scope-1");
    scoped.remove("scope-1");
    expect(scoped.has("scope-1")).toBe(false);
  });

  it("clears all scopes", () => {
    const scoped = createScopedStore(() => ({ count: 0 }));
    scoped.getOrCreate("a");
    scoped.getOrCreate("b");
    scoped.clear();
    expect(scoped.has("a")).toBe(false);
    expect(scoped.has("b")).toBe(false);
  });

  it("useScoped hook reads state", () => {
    const scoped = createScopedStore(() => ({ count: 0 }));
    const { result } = renderHook(() => scoped.useScoped("scope-1"));
    expect(result.current).toEqual({ count: 0 });
  });

  it("useScoped hook with selector", () => {
    const scoped = createScopedStore(() => ({ count: 42 }));
    const { result } = renderHook(() => scoped.useScoped("scope-1", (s) => s.count));
    expect(result.current).toBe(42);
  });

  it("useScoped re-renders on state change", () => {
    const scoped = createScopedStore(() => ({ count: 0 }));
    const store = scoped.getOrCreate("scope-1");

    const { result } = renderHook(() => scoped.useScoped("scope-1", (s) => s.count));
    expect(result.current).toBe(0);

    act(() => store.setState({ count: 5 }));
    expect(result.current).toBe(5);
  });
});
