import { describe, it, expect } from "vitest";
import { createScopedStore } from "./scoped-store.js";
import { renderComposable } from "./test-render.js";

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

  it("useScoped composable reads state", () => {
    const scoped = createScopedStore(() => ({ count: 0 }));
    const { result } = renderComposable(() => scoped.useScoped("scope-1"));
    expect(result().value).toEqual({ count: 0 });
  });

  it("useScoped composable with selector", () => {
    const scoped = createScopedStore(() => ({ count: 42 }));
    const { result } = renderComposable(() => scoped.useScoped("scope-1", (s) => s.count));
    expect(result().value).toBe(42);
  });

  it("useScoped updates on state change", () => {
    const scoped = createScopedStore(() => ({ count: 0 }));
    const store = scoped.getOrCreate("scope-1");

    const { result } = renderComposable(() => scoped.useScoped("scope-1", (s) => s.count));
    expect(result().value).toBe(0);

    store.setState({ count: 5 });
    expect(result().value).toBe(5);
  });
});
