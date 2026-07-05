import type { RuntimeMountAdapter } from "@modular-react/core";
import { JourneyOutlet } from "./outlet.js";
import type { JourneyRuntime } from "@modular-frontend/journeys-engine";

/**
 * Adapt a {@link JourneyRuntime} to the generic
 * {@link RuntimeMountAdapter} shape so other packages can embed journeys
 * without depending on this package directly. Today the only consumer is
 * `@modular-react/compositions` (zones with `kind: "journey"`):
 *
 * ```ts
 * import { createJourneyMountAdapter } from "@modular-react/journeys";
 *
 * const manifest = registry.resolve();
 * manifest.extensions.compositions.registerMountAdapter(
 *   "journey",
 *   createJourneyMountAdapter(manifest.extensions.journeys),
 * );
 * ```
 *
 * The wiring happens once after `resolve()` and before mounting React,
 * so the composition outlet finds the adapter the first time a zone
 * returns a `kind: "journey"` resolution. If the wiring is omitted, the
 * zone renders its `errorComponent` with a clear "no adapter
 * registered" message instead of throwing.
 */
export function createJourneyMountAdapter(runtime: JourneyRuntime): RuntimeMountAdapter {
  return {
    start(definitionId, input) {
      // The runtime's `start(journeyId, input)` overload accepts a bare
      // id string for dynamic dispatch — exactly what the adapter
      // receives from the composition outlet (which dereferences
      // `handle.id` before calling).
      return runtime.start(definitionId, input);
    },
    end(instanceId) {
      // Cooperative cleanup: when the composition's per-zone cache
      // evicts a journey instance it minted, route through `end()` so
      // the journey runtime cascades into its own teardown rather than
      // leaking the record until the host process exits.
      runtime.end(instanceId, { reason: "adapter-end" });
    },
    Outlet: JourneyOutlet,
  };
}
