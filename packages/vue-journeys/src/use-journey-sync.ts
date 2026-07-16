import { toRaw, toValue, watch, watchEffect, type MaybeRefOrGetter } from "vue";

import { createJourneySync, defaultStepPath } from "@modular-frontend/journeys-engine";
import type {
  InstanceId,
  JourneyRuntime,
  JourneySyncCallbackCtx,
  JourneySyncOptions,
  JourneySyncPort,
} from "@modular-frontend/journeys-engine";

import { useJourneyContext } from "./provider.js";

export interface UseJourneySyncOptions extends JourneySyncOptions {
  /**
   * Runtime to sync against. Optional when a `<JourneyProvider>` is mounted
   * above — the composable reads the runtime from context in that case. Read
   * once at setup, matching how the other composables in this package resolve
   * their runtime.
   */
  readonly runtime?: JourneyRuntime;
}

/**
 * Keep a journey instance and the browser URL in step, in both directions:
 * the journey advances and the URL follows; the user presses Back or Forward
 * and the journey follows.
 *
 * The reconciler itself is framework- and router-neutral and lives in
 * `@modular-frontend/journeys-engine`; this composable is the Vue lifetime
 * wrapper around it, and the exact analog of the React `useJourneySync`. See
 * `createJourneySync` in the engine for the full semantics (push-vs-replace
 * rules, what a location can and cannot select, why the design is
 * event-sourced rather than a diff).
 *
 * Supply a {@link JourneySyncPort} for vue-router. It is the only router-aware
 * code in the picture:
 *
 * ```ts
 * const router = useRouter();
 * const route = useRoute();
 * const port: JourneySyncPort = {
 *   read: () => String(route.params.step ?? ""),
 *   push: (path) => void router.push({ name: "checkout", params: { step: path } }),
 *   replace: (path) => void router.replace({ name: "checkout", params: { step: path } }),
 *   go: (delta) => router.go(delta),
 *   subscribe: (listener) => router.afterEach(() => listener()),
 * };
 *
 * useJourneySync(instanceId, port, { stepToPath: (step) => step.entry });
 * ```
 *
 * Conventions:
 *
 * - **`instanceId` accepts a plain value, a ref, or a getter**, and may be
 *   `null` — the composable no-ops until an id arrives, so it can be called at
 *   setup before the instance exists (as it must be under `useJourneyHost`,
 *   which starts the journey on mount). The sync re-attaches when the id
 *   changes.
 * - **`port` and `options` may be plain, refs, or getters.** Both are read
 *   through a live holder rather than re-creating the reconciler, because
 *   re-creating it re-runs its initial reconcile — and that reconcile
 *   navigates. Pass a getter when the port itself depends on reactive state.
 * - **The composable never starts or ends the instance.** It only navigates
 *   within a journey that is already running. Pair it with
 *   {@link JourneyHost}, which owns the lifecycle.
 */
export function useJourneySync(
  instanceId: MaybeRefOrGetter<InstanceId | null>,
  port: MaybeRefOrGetter<JourneySyncPort>,
  options: MaybeRefOrGetter<UseJourneySyncOptions> = {},
): void {
  const ctx = useJourneyContext();
  // `toRaw` for the same reason the outlet does it: `getInternals` keys its
  // store on the raw runtime identity handed out by `createJourneyRuntime`,
  // and a value that reached us through a reactive prop is a proxy.
  const runtime = toRaw(toValue(options).runtime ?? ctx?.runtime ?? undefined) ?? null;

  // Live holder — `setup` runs once, so a caller whose port or callbacks
  // depend on reactive state passes a getter and this keeps up. Mirrors the
  // `latest` pattern in `useWaitForExit`.
  const latest = {
    port: toValue(port),
    options: toValue(options),
  };
  watchEffect(() => {
    latest.port = toValue(port);
    latest.options = toValue(options);
  });

  // `go` is optional on the port and its *presence* is load-bearing — the
  // reconciler falls back to `replace` without it — so the proxy has to
  // present `undefined` when the current port has none, not a function that
  // silently does nothing.
  const stablePort: JourneySyncPort = {
    read: () => latest.port.read(),
    push: (path) => latest.port.push(path),
    replace: (path) => latest.port.replace(path),
    get go() {
      return latest.port.go ? (delta: number) => latest.port.go?.(delta) : undefined;
    },
    subscribe: (listener) => latest.port.subscribe(listener),
  };

  watch(
    () => toValue(instanceId),
    (id, _previous, onCleanup) => {
      if (!runtime || !id) return;
      const sync = createJourneySync(runtime, id, stablePort, {
        stepToPath: (step) => (latest.options.stepToPath ?? defaultStepPath)(step),
        onUnresolved: (syncCtx: JourneySyncCallbackCtx) => latest.options.onUnresolved?.(syncCtx),
        onBlocked: (syncCtx: JourneySyncCallbackCtx) => latest.options.onBlocked?.(syncCtx),
      });
      // Runs before the next id's sync is created, and again when the
      // watcher is stopped as the component's scope is disposed.
      onCleanup(() => sync.stop());
    },
    { immediate: true },
  );
}
