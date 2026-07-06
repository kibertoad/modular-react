import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { EagerModuleEntryPoint, LazyModuleEntryPoint } from "@modular-frontend/core";

import { preloadEntry, resolveEntryComponent } from "./resolve-entry.js";

const Eager = defineComponent({
  name: "Eager",
  setup: () => () => h("span", { "data-testid": "eager" }, "eager"),
});

const Lazy = defineComponent({
  name: "Lazy",
  setup: () => () => h("span", { "data-testid": "lazy" }, "lazy"),
});

describe("resolveEntryComponent — eager", () => {
  it("returns the original component verbatim", () => {
    const entry: EagerModuleEntryPoint<{ value: string }> = { component: Eager };
    const { Component } = resolveEntryComponent(entry);
    expect(Component).toBe(Eager);
  });

  it("preload() is a resolved promise (no-op)", async () => {
    const entry: EagerModuleEntryPoint<{ value: string }> = { component: Eager };
    await expect(resolveEntryComponent(entry).preload()).resolves.toBeUndefined();
  });

  it("memoizes per entry-object identity", () => {
    const entry: EagerModuleEntryPoint<{ value: string }> = { component: Eager };
    expect(resolveEntryComponent(entry)).toBe(resolveEntryComponent(entry));
  });
});

describe("resolveEntryComponent — lazy", () => {
  it("Component is a defineAsyncComponent wrapper", () => {
    const entry: LazyModuleEntryPoint<{ value: string }> = {
      lazy: () => Promise.resolve({ default: Lazy }),
    };
    const { Component } = resolveEntryComponent(entry);
    expect((Component as unknown as { __asyncLoader: unknown }).__asyncLoader).toBeTypeOf(
      "function",
    );
  });

  it("preload() invokes the importer exactly once across N calls", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Lazy }));
    const entry: LazyModuleEntryPoint<{ value: string }> = { lazy: importer };
    const { preload } = resolveEntryComponent(entry);
    await Promise.all([preload(), preload(), preload()]);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("preloadEntry() is equivalent to resolveEntryComponent(...).preload()", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Lazy }));
    const entry: LazyModuleEntryPoint<{ value: string }> = { lazy: importer };
    await preloadEntry(entry);
    await preloadEntry(entry);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("normalizes a module that exports the component directly (no `default`)", async () => {
    const entry: LazyModuleEntryPoint<{ value: string }> = {
      // Importer resolves to the component itself, not `{ default: ... }`.
      lazy: () => Promise.resolve(Lazy as unknown as { default: typeof Lazy }),
    };
    const { Component } = resolveEntryComponent(entry);
    const wrapper = mount(defineComponent({ setup: () => () => h(Component) }));
    await flushPromises();
    expect(wrapper.find("[data-testid=lazy]").exists()).toBe(true);
  });

  it("renders the resolved component after the import settles", async () => {
    let resolveImport!: (mod: { default: typeof Lazy }) => void;
    const entry: LazyModuleEntryPoint<{ value: string }> = {
      lazy: () =>
        new Promise<{ default: typeof Lazy }>((res) => {
          resolveImport = res;
        }),
    };
    const { Component } = resolveEntryComponent(entry);
    const wrapper = mount(defineComponent({ setup: () => () => h(Component) }));
    // The async chunk is still pending — the lazy content is not mounted yet.
    expect(wrapper.find("[data-testid=lazy]").exists()).toBe(false);
    resolveImport({ default: Lazy });
    await flushPromises();
    expect(wrapper.find("[data-testid=lazy]").exists()).toBe(true);
  });

  it("memoizes per entry-object identity (cached lazy wrapper)", () => {
    const entry: LazyModuleEntryPoint<{ value: string }> = {
      lazy: () => Promise.resolve({ default: Lazy }),
    };
    expect(resolveEntryComponent(entry)).toBe(resolveEntryComponent(entry));
  });

  it("dedupes concurrent loader calls so `preload()` and a render share one import", async () => {
    // The cached/inflight pair guarantees `importer` is invoked once even when
    // `preload()` and the component's mount fire back-to-back — the hover-then-
    // click prefetch path funnels through the same fetch.
    const importer = vi.fn(() => Promise.resolve({ default: Lazy }));
    const entry: LazyModuleEntryPoint<{ value: string }> = { lazy: importer };
    const { Component, preload } = resolveEntryComponent(entry);
    const preloading = preload();
    const wrapper = mount(defineComponent({ setup: () => () => h(Component) }));
    await preloading;
    await flushPromises();
    expect(wrapper.find("[data-testid=lazy]").exists()).toBe(true);
    expect(importer).toHaveBeenCalledTimes(1);
  });
});

describe("resolveEntryComponent — invalid input", () => {
  it("throws when the entry declares neither component nor lazy", () => {
    expect(() => resolveEntryComponent({} as unknown as EagerModuleEntryPoint<unknown>)).toThrow(
      /neither `component` nor `lazy`/,
    );
  });

  it("traps a sync-throwing importer as a cached rejected promise", async () => {
    const failure = new Error("module is broken");
    const importer = vi.fn(() => {
      throw failure;
    });
    const entry: LazyModuleEntryPoint<{ value: string }> = { lazy: importer };
    const { preload } = resolveEntryComponent(entry);
    // First call traps the throw and stores a rejected promise.
    await expect(preload()).rejects.toBe(failure);
    // Second call replays the cached rejection — importer is NOT re-invoked.
    await expect(preload()).rejects.toBe(failure);
    expect(importer).toHaveBeenCalledTimes(1);
  });
});
