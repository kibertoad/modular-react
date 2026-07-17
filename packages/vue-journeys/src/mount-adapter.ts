import { defineComponent, h, type PropType, type VNode } from "vue";
import type { RuntimeMountAdapter } from "@modular-frontend/core";
import type { InstanceId, JourneyRuntime } from "@modular-frontend/journeys-engine";
import { JourneyOutlet } from "./outlet.js";

/**
 * Adapt a {@link JourneyRuntime} to the generic
 * {@link RuntimeMountAdapter} shape so other packages can embed journeys
 * without depending on this package directly. Today the only consumer is
 * `@modular-vue/compositions` (zones with `kind: "journey"`):
 *
 * ```ts
 * import { createJourneyMountAdapter } from "@modular-vue/journeys";
 *
 * const manifest = registry.resolveManifest();
 * manifest.extensions.compositions.registerMountAdapter(
 *   "journey",
 *   createJourneyMountAdapter(manifest.extensions.journeys),
 * );
 * ```
 *
 * The wiring happens once after `resolveManifest()` and before mounting the
 * app, so the composition outlet finds the adapter the first time a zone
 * returns a `kind: "journey"` resolution. If the wiring is omitted, the
 * zone renders its `errorComponent` with a clear "no adapter registered"
 * message instead of throwing (see `CompositionOutlet`).
 *
 * The Vue analog of `@modular-react/journeys`'s `createJourneyMountAdapter`.
 *
 * Deviation from the React source, and why: React returns the bare
 * `JourneyOutlet` as `Outlet` and lets it read the journey runtime from the
 * `<JourneyProvider>` context that the journeys plugin threads app-wide. The
 * Vue `<CompositionOutlet>` renders `adapter.Outlet` with only
 * `{ instanceId, loadingFallback }` (no `runtime`), so the Vue adapter binds
 * the runtime it was handed into a thin wrapper component. This makes the
 * adapter self-contained — it mounts instances against exactly the runtime
 * passed to `createJourneyMountAdapter`, whether or not a `<JourneyProvider>`
 * sits above the composition outlet — rather than depending on an ambient
 * context that must happen to hold the same runtime.
 */
export function createJourneyMountAdapter(runtime: JourneyRuntime): RuntimeMountAdapter {
  const Outlet = defineComponent({
    name: "JourneyMountAdapterOutlet",
    props: {
      instanceId: { type: String as PropType<InstanceId>, required: true },
      loadingFallback: {
        type: null as unknown as PropType<VNode | (() => VNode)>,
        default: undefined,
      },
    },
    setup(props) {
      // Bind the captured `runtime` explicitly so the embedded journey mounts
      // against the runtime the adapter was built for — not whatever a
      // `<JourneyProvider>` above the composition outlet may (or may not) hold.
      return () =>
        h(JourneyOutlet, {
          runtime,
          instanceId: props.instanceId,
          loadingFallback: props.loadingFallback,
        });
    },
  });

  return {
    start(definitionId, input) {
      // The runtime's `start(journeyId, input)` overload accepts a bare id
      // string for dynamic dispatch — exactly what the adapter receives from
      // the composition outlet (which dereferences `handle.id` before calling).
      return runtime.start(definitionId, input);
    },
    end(instanceId) {
      // Cooperative cleanup: when the composition's per-zone cache evicts a
      // journey instance it minted, route through `end()` so the journey
      // runtime cascades into its own teardown rather than leaking the record
      // until the host process exits.
      runtime.end(instanceId, { reason: "adapter-end" });
    },
    Outlet,
  };
}
