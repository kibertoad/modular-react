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
    let importPromise:
      | Promise<{ default: ComponentType<ModuleEntryProps<unknown, ExitPointMap>> }>
      | undefined;
    // Importer is invoked synchronously on first call so React.lazy and
    // explicit preload() see the same observable timing. The try/catch
    // converts a sync-throwing importer into a cached rejected promise —
    // without it, a sync throw would skip the assignment and the next
    // call would re-invoke the broken importer instead of replaying the
    // failure (and consumers would never see the error via Suspense).
    const cachedImport = (): Promise<{
      default: ComponentType<ModuleEntryProps<unknown, ExitPointMap>>;
    }> => {
      if (importPromise) return importPromise;
      try {
        importPromise = Promise.resolve(importer()).then(normalize);
      } catch (err) {
        importPromise = Promise.reject(err);
      }
      return importPromise;
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
