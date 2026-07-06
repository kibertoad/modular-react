import { defineAsyncComponent, type Component } from "vue";
import type {
  EagerModuleEntryPoint,
  LazyModuleEntryPoint,
  ModuleEntryPoint,
} from "@modular-frontend/core";

/** Per-entry resolved render surface used by hosts (the journey outlet, tabs). */
export interface ResolvedEntry {
  /**
   * Renderable component for the entry. For lazy entries this is a
   * `defineAsyncComponent(...)` wrapper — it resolves its chunk on mount and
   * renders nothing until then (wrap it in `<Suspense>` if the host wants a
   * fallback), the Vue analog of React's `React.lazy` + `<Suspense>`.
   */
  readonly Component: Component;
  /**
   * Idempotent prefetch. Eager entries resolve immediately; lazy entries
   * trigger the dynamic import once and return the cached promise on every
   * subsequent call. Safe to call from idle callbacks, hover handlers, etc.
   */
  readonly preload: () => Promise<unknown>;
}

const cache = new WeakMap<ModuleEntryPoint<any>, ResolvedEntry>();

/**
 * Unwrap a `{ default }` module record down to the component. A real dynamic
 * `import()` resolves to a module namespace object with a `default` export;
 * `defineAsyncComponent` unwraps ES-module records itself, but a plain object
 * that merely *has* a `default` key (as tests and some bundler shims produce)
 * is not flagged as a module, so we normalize here to match React's `normalize`
 * and keep both shapes working.
 */
const normalize = (mod: unknown): Component => {
  if (mod && typeof mod === "object" && "default" in (mod as Record<string, unknown>)) {
    return (mod as { default: Component }).default;
  }
  return mod as Component;
};

/**
 * Normalize a module entry point into a `{ Component, preload }` pair. Both
 * the `component` (eager) and `lazy` (dynamic-import) shapes are supported;
 * the lazy form is wrapped with `defineAsyncComponent` and exposes an
 * idempotent `preload()` so hosts can speculatively warm the chunk during
 * idle time.
 *
 * Memoized by entry-object identity via a process-local `WeakMap` — repeated
 * calls return the same pair, so the async wrapper and import promise stay
 * stable across re-renders.
 */
export function resolveEntryComponent(entry: ModuleEntryPoint<any>): ResolvedEntry {
  const existing = cache.get(entry);
  if (existing) return existing;

  let resolved: ResolvedEntry;
  const eager = (entry as EagerModuleEntryPoint<unknown>).component;
  const importer = (entry as LazyModuleEntryPoint<unknown>).lazy;

  if (eager !== undefined) {
    resolved = {
      Component: eager as unknown as Component,
      preload: () => Promise.resolve(),
    };
  } else if (typeof importer === "function") {
    let cached: Component | undefined;
    let inflight: Promise<Component> | undefined;

    // Both `Component` (via `defineAsyncComponent`) and `preload` go through
    // this one closure so the `cached`/`inflight` slot populated by an explicit
    // `preload()` is the same import the async wrapper awaits — hovering primes
    // the chunk and the subsequent mount reuses it instead of re-importing.
    const cachedImport = (): Promise<Component> => {
      if (cached !== undefined) return Promise.resolve(cached);
      if (inflight) return inflight;
      // try/catch converts a sync-throwing importer into a cached rejected
      // promise — without it, a sync throw would skip the assignment and the
      // next call would re-invoke the broken importer instead of replaying
      // the failure. A synchronous throw is a hard authoring bug (broken
      // importer), so it stays cached; an *async* rejection is often transient
      // (a chunk-fetch network blip), so we clear `inflight` on rejection and
      // let a later call retry — otherwise the poisoned promise would replay
      // forever and defeat `defineAsyncComponent`'s own remount-retry path.
      try {
        inflight = Promise.resolve(importer())
          .then(normalize)
          .then((c) => {
            cached = c;
            return c;
          })
          .catch((err: unknown) => {
            inflight = undefined;
            throw err;
          });
      } catch (err) {
        inflight = Promise.reject(err);
      }
      return inflight;
    };

    const Component = defineAsyncComponent(cachedImport);
    resolved = { Component, preload: cachedImport };
  } else {
    throw new Error(
      "[@modular-vue/vue] resolveEntryComponent: entry has neither `component` nor `lazy`. " +
        "Validate modules with `validateModuleEntryExit` before rendering.",
    );
  }

  cache.set(entry, resolved);
  return resolved;
}

/**
 * Convenience wrapper that triggers a lazy entry's dynamic import without
 * materializing its component. Equivalent to
 * `resolveEntryComponent(entry).preload()` and intended for hover-prefetch
 * UIs and other manual warm-up paths. Idempotent across repeated calls.
 */
export function preloadEntry(entry: ModuleEntryPoint<any>): Promise<unknown> {
  return resolveEntryComponent(entry).preload();
}
