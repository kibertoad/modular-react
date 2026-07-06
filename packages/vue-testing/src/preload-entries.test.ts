import { describe, it, expect, vi } from "vitest";
import type { Component } from "vue";
import { preloadEntry as preloadEntryFromVue, resolveEntryComponent } from "@modular-vue/vue";
import type { LazyModuleEntryPoint, ModuleDescriptor } from "@modular-frontend/core";
import { preloadEntries, preloadEntry } from "./index.js";

// Hoisted by vitest above every import in this file. `preloadEntries` walks
// the lazy entry's importer, which calls `import("./preload-entries.fixture")`
// at runtime; that resolution is intercepted here and returns the mock
// factory's value instead of the real on-disk fixture.
vi.mock("./preload-entries.fixture.js", () => {
  const Mocked: { (): null; displayName: string } = () => null;
  Mocked.displayName = "mocked";
  return { default: Mocked };
});

const Stub = (() => null) as unknown as Component;

function lazyEntry(importer: () => Promise<unknown>): LazyModuleEntryPoint<unknown> {
  return { lazy: importer as LazyModuleEntryPoint<unknown>["lazy"] };
}

function module_(
  id: string,
  entryPoints?: Record<string, unknown>,
): ModuleDescriptor<any, any, any, any> {
  return {
    id,
    version: "1.0.0",
    ...(entryPoints !== undefined ? { entryPoints } : {}),
  } as unknown as ModuleDescriptor<any, any, any, any>;
}

describe("preloadEntries", () => {
  it("invokes every lazy importer exactly once across the module set", async () => {
    const importerA = vi.fn(() => Promise.resolve({ default: Stub }));
    const importerB = vi.fn(() => Promise.resolve({ default: Stub }));
    const importerC = vi.fn(() => Promise.resolve({ default: Stub }));
    const modA = module_("a", { x: lazyEntry(importerA), y: lazyEntry(importerB) });
    const modB = module_("b", { z: lazyEntry(importerC) });

    await preloadEntries([modA, modB]);

    expect(importerA).toHaveBeenCalledTimes(1);
    expect(importerB).toHaveBeenCalledTimes(1);
    expect(importerC).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — repeat calls reuse the resolver's per-entry cache", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Stub }));
    const mod = module_("m", { e: lazyEntry(importer) });

    await preloadEntries([mod]);
    await preloadEntries([mod]);
    await preloadEntries([mod]);

    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("skips eager entries (no `lazy:` field)", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Stub }));
    const mod = module_("m", {
      lazy: lazyEntry(importer),
      eager: { component: Stub },
    });

    await preloadEntries([mod]);

    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("ignores modules without an entryPoints map", async () => {
    const mod = module_("headless");
    await expect(preloadEntries([mod])).resolves.toBeUndefined();
  });

  it("returns a resolved promise when given an empty module list", async () => {
    await expect(preloadEntries([])).resolves.toBeUndefined();
  });

  it("propagates the first rejection without leaking unhandled rejections from sibling importers", async () => {
    // Mixed resolve/reject lineup verifies the comment in preload-entries.ts:
    // Promise.all attaches a handler to every iterated promise, so the
    // resolving sibling never surfaces as an unhandledRejection. We back the
    // structural guarantee with a process-level listener.
    const failure = new Error("chunk load failed");
    const success = vi.fn(() => Promise.resolve({ default: Stub }));
    const reject = vi.fn(() => Promise.reject(failure));
    const mod = module_("m", { ok: lazyEntry(success), bad: lazyEntry(reject) });

    const leaks: unknown[] = [];
    const onUnhandled = (reason: unknown) => leaks.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      await expect(preloadEntries([mod])).rejects.toBe(failure);
      // Drain microtasks so any pending unhandled-rejection notifications fire.
      await new Promise((r) => setImmediate(r));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    expect(success).toHaveBeenCalledTimes(1);
    expect(reject).toHaveBeenCalledTimes(1);
    expect(leaks).toEqual([]);
  });

  it("re-exports `preloadEntry` from @modular-vue/vue verbatim", () => {
    expect(preloadEntry).toBe(preloadEntryFromVue);
  });

  it("honors vi.mock — the cached module is the mocked one, not the real fixture", async () => {
    // vitest hoists `vi.mock(...)` above every import in this file, so the
    // dynamic `import("./preload-entries.fixture.js")` triggered by
    // preloadEntries() resolves to the mock factory's return value rather
    // than the on-disk fixture (which exports `displayName: "real"`).
    const importer = vi.fn(() => import("./preload-entries.fixture.js"));
    const entry = lazyEntry(importer);
    const mod = module_("m", { e: entry });

    await preloadEntries([mod]);

    // After preload, the resolver's cached path replays the same import. Vue's
    // `preload()` resolves to the *normalized* component (the unwrapped
    // `default`), so we read `displayName` off it directly — proof the cached
    // value is the mocked component, not the on-disk fixture's "real" one.
    const captured = (await resolveEntryComponent(entry).preload()) as {
      displayName?: string;
    };
    expect(importer).toHaveBeenCalledTimes(1);
    expect(captured?.displayName).toBe("mocked");
  });

  it("after preload, resolveEntryComponent(entry).preload() replays the cached import without re-importing", async () => {
    // The Vue value proposition: preloadEntries() warms the resolver cache, so
    // a host that later resolves and renders the entry reuses the same chunk
    // instead of importing again. (Vue's defineAsyncComponent still resolves
    // through its own async state on mount — the React.lazy synchronous-thenable
    // fast path does not port, so there is no synchronous-resolution assertion
    // here.)
    const importer = vi.fn(() => Promise.resolve({ default: Stub }));
    const entry = lazyEntry(importer);
    const mod = module_("m", { e: entry });

    await preloadEntries([mod]);
    await resolveEntryComponent(entry).preload();
    await resolveEntryComponent(entry).preload();

    expect(importer).toHaveBeenCalledTimes(1);
  });
});
