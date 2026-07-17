import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

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
 * - **`onUnresolved` and `onBlocked` need not be memoized** — they are read
 *   through the same latest-value ref. `stepToPath` is the exception: it is
 *   captured once when the sync is created, because the engine needs a stable
 *   step->path mapping to resolve history frames the port already stamped.
 *   A mapping that changes on a later render takes effect only after the sync
 *   is re-created (change `instanceId` or remount).
 * - **The hook never starts or ends the instance.** It only navigates within
 *   a journey that is already running. Pair it with {@link JourneyHost},
 *   which owns the lifecycle.
 *
 * Implementation note: the effect deliberately depends on `runtime` and
 * `instanceId` only. Everything else is reached through refs written in the
 * commit phase (not during render, so a discarded render cannot publish an
 * uncommitted port to the live subscription), because re-creating the sync
 * runs its initial reconcile again — and that reconcile can navigate.
 */
export function useJourneySync(
  instanceId: InstanceId | null,
  port: JourneySyncPort,
  options: UseJourneySyncOptions = {},
): void {
  const context = useJourneyContext();
  const runtime = options.runtime ?? context?.runtime ?? null;

  // Latest-value refs feeding the committed sync's callbacks. Written in the
  // commit phase, **not** during render: the ref object is shared with the
  // committed tree, so mutating it during render would let a render React
  // ultimately discards — a Suspense throw, an abandoned concurrent render —
  // publish an uncommitted port or callback to the live subscription. With an
  // inline port that means navigating through a base path, or even a router,
  // that never made it on screen.
  //
  // Written in a **layout** effect rather than a passive one. A passive effect
  // runs after paint, so it leaves a window — from commit until the passive
  // effects flush — during which a *layout* effect elsewhere in the same commit
  // (a router that navigates from `useLayoutEffect`, say) can drive the live
  // subscription while these refs still hold the previous render's values,
  // firing a stale `onUnresolved`/`onBlocked`. A layout effect updates the refs
  // within the layout phase, before that paint and before passive effects, so a
  // committed render's values are in place before anything downstream can
  // navigate. It still runs only for committed renders, so it keeps the
  // discarded-render guarantee above; and the sync's callbacks only ever fire
  // from router/runtime notifications (never synchronously during render), so a
  // committed value is always safe to read. Declared before the effect that
  // creates the sync, so on mount the refs are populated before
  // `createJourneySync`'s initial reconcile reads them.
  const portRef = useRef(port);
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    portRef.current = port;
    optionsRef.current = options;
  });

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
    // `stepToPath` is captured once per sync, not read live: the engine relies
    // on a stable step->path mapping to resolve the history frames the port has
    // already stamped, so swapping it mid-flight would strand previously
    // visited paths as unresolved. `onUnresolved`/`onBlocked` stay live.
    const stepToPath = optionsRef.current.stepToPath ?? defaultStepPath;
    const sync = createJourneySync(runtime, instanceId, stablePort, {
      stepToPath,
      onUnresolved: (ctx: JourneySyncCallbackCtx) => optionsRef.current.onUnresolved?.(ctx),
      onBlocked: (ctx: JourneySyncCallbackCtx) => optionsRef.current.onBlocked?.(ctx),
    });
    return () => sync.stop();
  }, [runtime, instanceId, stablePort]);
}
