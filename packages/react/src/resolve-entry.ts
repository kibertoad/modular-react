import { lazy } from "react";
import type { ComponentType } from "react";
import type {
  EagerModuleEntryPoint,
  ExitPointMap,
  LazyModuleEntryPoint,
  ModuleEntryPoint,
  ModuleEntryProps,
} from "@modular-react/core";

/** Per-entry resolved render surface used by hosts (JourneyOutlet, ModuleTab). */
export interface ResolvedEntry {
  /**
   * Renderable component for the entry. For lazy entries this is a
   * `React.lazy(...)` wrapper — hosts must render it inside a `<Suspense>`
   * boundary. The host's existing fallback path applies.
   */
  readonly Component: ComponentType<ModuleEntryProps<unknown, ExitPointMap>>;
  /**
   * Idempotent prefetch. Eager entries resolve immediately; lazy entries
   * trigger the dynamic import once and return the cached promise on every
   * subsequent call. Safe to call from idle callbacks, hover handlers, etc.
   */
  readonly preload: () => Promise<unknown>;
}

const cache = new WeakMap<ModuleEntryPoint<any>, ResolvedEntry>();

const normalize = (
  mod: unknown,
): { default: ComponentType<ModuleEntryProps<unknown, ExitPointMap>> } => {
  if (mod && typeof mod === "object" && "default" in (mod as Record<string, unknown>)) {
    return mod as { default: ComponentType<ModuleEntryProps<unknown, ExitPointMap>> };
  }
  return {
    default: mod as ComponentType<ModuleEntryProps<unknown, ExitPointMap>>,
  };
};

/**
 * Normalize a module entry point into a `{ Component, preload }` pair. Both
 * the `component` (eager) and `lazy` (dynamic-import) shapes are supported;
 * the lazy form is wrapped with `React.lazy` and exposes an idempotent
 * `preload()` so hosts can speculatively warm the chunk during idle time.
 *
 * Memoized by entry-object identity via a process-local `WeakMap` — repeated
 * calls return the same pair (so the lazy wrapper and import promise are
 * stable across re-renders and StrictMode double-mount).
 */
export function resolveEntryComponent(entry: ModuleEntryPoint<any>): ResolvedEntry {
  const existing = cache.get(entry);
  if (existing) return existing;

  let resolved: ResolvedEntry;
  const eager = (entry as EagerModuleEntryPoint<unknown>).component;
  const importer = (entry as LazyModuleEntryPoint<unknown>).lazy;

  if (typeof eager === "function") {
    resolved = {
      Component: eager as ComponentType<ModuleEntryProps<unknown, ExitPointMap>>,
      preload: () => Promise.resolve(),
    };
  } else if (typeof importer === "function") {
    type Resolved = { default: ComponentType<ModuleEntryProps<unknown, ExitPointMap>> };
    let cached: Resolved | undefined;
    let inflight: Promise<Resolved> | undefined;

    // The cached path returns a SYNCHRONOUS thenable instead of a real
    // promise once the import has settled. React.lazy's `_init` flow does:
    //
    //   const thenable = ctor()
    //   thenable.then(setResolved, setRejected)
    //   if (payload._status === Uninitialized) payload._status = Pending
    //   if (payload._status === Resolved) return moduleObject.default
    //   throw payload._result
    //
    // With a real (already-resolved) promise, `.then(setResolved)` schedules
    // its callback on the microtask queue, so the status check below
    // still sees `Uninitialized` → flips to `Pending` → throws → Suspense
    // shows the fallback for one microtask. With a synchronous thenable,
    // `setResolved` runs inside the `.then(...)` call, the status flips to
    // `Resolved` before the check runs, and the component renders without
    // crossing a microtask boundary — eliminating the post-preload
    // fallback flash. Promise A+ only requires `.then` to *schedule* its
    // callback; React.lazy doesn't depend on the deferral.
    //
    // Both `Component` (via `React.lazy`) and `preload` go through the
    // same `cachedImport` closure so the `cached` slot populated by an
    // explicit `preload()` is visible to the subsequent lazy-render.
    const cachedImport = (): Promise<Resolved> => {
      if (cached !== undefined) {
        const value = cached;
        return {
          // oxlint-disable-next-line no-thenable -- synchronous thenable for React.lazy fast-path; see block comment above
          then(onFulfilled?: (m: Resolved) => unknown) {
            return onFulfilled ? onFulfilled(value) : value;
          },
        } as unknown as Promise<Resolved>;
      }
      if (inflight) return inflight;
      // try/catch converts a sync-throwing importer into a cached rejected
      // promise — without it, a sync throw would skip the assignment and
      // the next call would re-invoke the broken importer instead of
      // replaying the failure (and consumers would never see the error
      // via Suspense).
      try {
        inflight = Promise.resolve(importer())
          .then(normalize)
          .then((m) => {
            cached = m;
            return m;
          });
      } catch (err) {
        inflight = Promise.reject(err);
      }
      return inflight;
    };
    const Component = lazy(cachedImport) as unknown as ComponentType<
      ModuleEntryProps<unknown, ExitPointMap>
    >;
    resolved = { Component, preload: cachedImport };
  } else {
    throw new Error(
      "[@modular-react/react] resolveEntryComponent: entry has neither `component` nor `lazy`. " +
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
