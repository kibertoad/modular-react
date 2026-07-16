import { useEffect, useMemo, useRef } from "react";

import { createJourneySync, defaultStepPath } from "@modular-frontend/journeys-engine";
import type {
  InstanceId,
  JourneyRuntime,
  JourneySyncCallbackCtx,
  JourneySyncOptions,
  JourneySyncPort,
  JourneyStep,
} from "@modular-frontend/journeys-engine";
import { useJourneyContext } from "./provider.js";

export interface UseJourneySyncOptions extends JourneySyncOptions {
  /**
   * Runtime to sync against. Optional when a `<JourneyProvider>` is mounted
   * above — the hook reads the runtime from context in that case. Explicit
   * option overrides context, matching `<JourneyOutlet>`'s `runtime` prop.
   */
  readonly runtime?: JourneyRuntime;
}

/**
 * Keep a journey instance and the browser URL in step, in both directions:
 * the journey advances and the URL follows; the user presses Back or Forward
 * and the journey follows.
 *
 * The reconciler itself is framework- and router-neutral and lives in
 * `@modular-frontend/journeys-engine` — this hook is the React lifetime
 * wrapper around it. See `createJourneySync` there for the full semantics
 * (push-vs-replace rules, what a location can and cannot select, why the
 * design is event-sourced rather than a diff).
 *
 * Pass a {@link JourneySyncPort} for your router. It is the only router-aware
 * code in the picture, and it is small — read the step out of the location,
 * navigate to a step, subscribe to changes:
 *
 * ```tsx
 * const router = useRouter();
 * const port = useMemo<JourneySyncPort>(
 *   () => ({
 *     read: () => router.state.location.pathname.replace(/^\/checkout\//, ""),
 *     push: (path) => router.navigate({ to: `/checkout/${path}` }),
 *     replace: (path) => router.navigate({ to: `/checkout/${path}`, replace: true }),
 *     go: (delta) => router.history.go(delta),
 *     subscribe: (listener) => router.subscribe("onResolved", listener),
 *   }),
 *   [router],
 * );
 *
 * useJourneySync(instanceId, port, {
 *   stepToPath: (step) => step.entry,
 *   onUnresolved: () => navigate({ to: "/" }),
 * });
 * ```
 *
 * Conventions:
 *
 * - **`instanceId` may be `null`.** The hook no-ops, so it can be called
 *   unconditionally above an early return — including on `<JourneyHost>`'s
 *   first render, before the instance exists.
 * - **The `port` need not be memoized.** `read`, `push`, `replace` and `go`
 *   call through to whatever you passed on the latest render, so an inline
 *   object literal will not tear down and rebuild the reconciler (which would
 *   re-navigate) on every render. Whether the port supplies `go` *is* read
 *   reactively, since it changes the rewind strategy. The one exception is
 *   `subscribe`: it is called once, when the sync is created, so the
 *   subscription belongs to the port that was current at that moment. That is
 *   invisible for the normal case — a port over a stable router — but a port
 *   that subscribes to a *different* source on a later render will not be
 *   re-subscribed. Change `instanceId` (or remount) to re-attach.
 * - **Callbacks need not be memoized** either — `stepToPath`, `onUnresolved`
 *   and `onBlocked` are read through the same latest-value ref.
 * - **The hook never starts or ends the instance.** It only navigates within
 *   a journey that is already running. Pair it with {@link JourneyHost},
 *   which owns the lifecycle.
 *
 * Implementation note: the effect deliberately depends on `runtime` and
 * `instanceId` only. Everything else is reached through refs written on every
 * render, because re-creating the sync runs its initial reconcile again — and
 * that reconcile can navigate.
 */
export function useJourneySync(
  instanceId: InstanceId | null,
  port: JourneySyncPort,
  options: UseJourneySyncOptions = {},
): void {
  const context = useJourneyContext();
  const runtime = options.runtime ?? context?.runtime ?? null;

  // Latest-value refs, written unconditionally during render. Safe for the
  // same reason `useWaitForExit` documents: nothing reads them during render,
  // only from effects and from callbacks the effect installs, so a render
  // React later discards leaves no trace.
  const portRef = useRef(port);
  portRef.current = port;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // `go` is optional on the port and its *presence* is load-bearing — the
  // reconciler falls back to `replace` without it — so the proxy has to
  // present `undefined` when the current port has none, not a function that
  // silently does nothing. A getter keeps that faithful while the proxy
  // identity stays stable across renders.
  const stablePort = useMemo<JourneySyncPort>(
    () => ({
      read: () => portRef.current.read(),
      push: (path) => portRef.current.push(path),
      replace: (path) => portRef.current.replace(path),
      get go() {
        return portRef.current.go ? (delta: number) => portRef.current.go?.(delta) : undefined;
      },
      subscribe: (listener) => portRef.current.subscribe(listener),
    }),
    [],
  );

  useEffect(() => {
    if (!runtime || !instanceId) return;
    const sync = createJourneySync(runtime, instanceId, stablePort, {
      stepToPath: (step: JourneyStep) => (optionsRef.current.stepToPath ?? defaultStepPath)(step),
      onUnresolved: (ctx: JourneySyncCallbackCtx) => optionsRef.current.onUnresolved?.(ctx),
      onBlocked: (ctx: JourneySyncCallbackCtx) => optionsRef.current.onBlocked?.(ctx),
    });
    return () => sync.stop();
  }, [runtime, instanceId, stablePort]);
}
