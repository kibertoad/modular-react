import { describe, it, expect, vi } from "vitest";
import type { ComponentType } from "react";
import { resolveEntryComponent } from "@modular-react/react";
import type {
  LazyModuleEntryPoint,
  ModuleDescriptor,
  ModuleEntryProps,
} from "@modular-react/core";
import { preloadEntries } from "./preload-entries.js";

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
