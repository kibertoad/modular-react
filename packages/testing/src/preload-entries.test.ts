import { describe, it, expect, vi } from "vitest";
import type { ComponentType } from "react";
import { preloadEntry as preloadEntryFromReact, resolveEntryComponent } from "@modular-react/react";
import type { LazyModuleEntryPoint, ModuleDescriptor, ModuleEntryProps } from "@modular-react/core";
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

const Stub = (() => null) as unknown as ComponentType<ModuleEntryProps<unknown, {}>>;

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

  it("propagates importer rejections", async () => {
    const failure = new Error("chunk load failed");
    const importer = vi.fn(() => Promise.reject(failure));
    const mod = module_("m", { e: lazyEntry(importer) });

    await expect(preloadEntries([mod])).rejects.toBe(failure);
  });

  it("re-exports `preloadEntry` from @modular-react/react verbatim", () => {
    expect(preloadEntry).toBe(preloadEntryFromReact);
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

    // Read the cached resolved module via the synchronous-thenable fast path:
    // after preload, .preload() returns a thenable that fires onFulfilled
    // inline, so we can capture the cached value without await.
    let captured: { default?: { displayName?: string } } | undefined;
    resolveEntryComponent(entry)
      .preload()
      .then((m) => {
        captured = m as typeof captured;
      });
    expect(importer).toHaveBeenCalledTimes(1);
    expect(captured?.default?.displayName).toBe("mocked");
  });

  it("after preload, resolveEntryComponent(entry).preload() resolves SYNCHRONOUSLY", async () => {
    // The end-to-end value proposition: post-preload, the resolver's cached
    // path returns a synchronous thenable (resolve-entry.ts:90-99). React.lazy
    // exploits this to flip status to Resolved without a microtask hop, so a
    // subsequent render commits the component on the first pass with no
    // Suspense fallback flash.
    const importer = vi.fn(() => Promise.resolve({ default: Stub }));
    const entry = lazyEntry(importer);
    const mod = module_("m", { e: entry });

    await preloadEntries([mod]);

    let observed = 0;
    resolveEntryComponent(entry)
      .preload()
      .then(() => {
        observed += 1;
      });
    // No `await`. If the cached path were a real promise, this would be 0
    // until the next microtask. The synchronous thenable fires inline.
    expect(observed).toBe(1);
  });
});
