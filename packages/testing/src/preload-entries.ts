import { preloadEntry } from "@modular-react/react";
import type { ModuleDescriptor } from "@modular-react/core";

/**
 * Eagerly resolves every `lazy:` entry on the given modules so subsequent
 * test renders are synchronous — no `<Suspense>` fallback flash, no
 * `await waitFor(...)`, no `act` choreography.
 *
 * After this resolves, the resolver's per-entry cache is populated for every
 * lazy entry. The cached path returns a synchronous thenable, so
 * `React.lazy`'s `_init` flow flips status to `Resolved` inside the
 * `.then(...)` call without crossing a microtask — host components
 * (`ModuleTab`, `JourneyOutlet`) still wrap in `<Suspense>` but the fallback
 * never mounts. Eager (`component:`) entries are skipped (they're already
 * synchronous), as are modules without an `entryPoints` map.
 *
 * Idempotent: repeated calls reuse the same per-entry import promise via the
 * resolver's `WeakMap` cache, so importers run at most once across the test
 * run.
 *
 * @example In `beforeAll` (the typical setup):
 * ```ts
 * import { preloadEntries } from "@modular-react/testing";
 * import { allModules } from "../src/modules";
 *
 * beforeAll(() => preloadEntries(allModules));
 * ```
 *
 * @example For modules built ad-hoc per test, call `preloadEntry` directly
 * (re-exported from this package for a single import surface):
 * ```ts
 * import { preloadEntry } from "@modular-react/testing";
 *
 * await preloadEntry(myEntry);
 * render(<ModuleTab module={mod} entry="x" input={...} />);
 * ```
 */
export function preloadEntries(
  modules: readonly ModuleDescriptor<any, any, any, any>[],
): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  for (const mod of modules) {
    if (!mod.entryPoints) continue;
    for (const entry of Object.values(mod.entryPoints)) {
      // `"lazy" in entry` narrows the EagerModuleEntryPoint | LazyModuleEntryPoint
      // union to the lazy branch; the typeof check guards against malformed
      // entries that survived validation.
      if ("lazy" in entry && typeof entry.lazy === "function") {
        // Promise.all attaches a handler to every promise it iterates, so a
        // single rejection won't leave the other in-flight imports as
        // unhandled-rejection warnings.
        tasks.push(preloadEntry(entry));
      }
    }
  }
  return Promise.all(tasks).then(() => undefined);
}
