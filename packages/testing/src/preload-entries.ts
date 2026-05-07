import { preloadEntry } from "@modular-react/react";
import type { ModuleDescriptor, ModuleEntryPoint } from "@modular-react/core";

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
 * @example For modules built ad-hoc per test, call `preloadEntry` directly:
 * ```ts
 * import { preloadEntry } from "@modular-react/react";
 *
 * await preloadEntry(myEntry);
 * render(<ModuleTab module={mod} entry="x" input={...} />);
 * ```
 */
export function preloadEntries(
  modules: readonly ModuleDescriptor<any, any, any, any>[],
): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  for (const module of modules) {
    if (!module.entryPoints) continue;
    for (const entry of Object.values(module.entryPoints) as ModuleEntryPoint<any>[]) {
      if (typeof (entry as { lazy?: unknown }).lazy === "function") {
        tasks.push(preloadEntry(entry));
      }
    }
  }
  return Promise.all(tasks).then(() => undefined);
}
