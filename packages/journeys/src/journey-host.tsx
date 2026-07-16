import { createElement, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type {
  InstanceId,
  JourneyHandle,
  JourneyInstance,
  JourneyRuntime,
} from "@modular-frontend/journeys-engine";
import { useInstanceSnapshot } from "./instance-hooks.js";
import { JourneyOutlet } from "./outlet.js";
import type { JourneyOutletProps } from "./outlet.js";
import { useJourneyContext } from "./provider.js";

export interface UseJourneyHostOptions {
  /**
   * Runtime to start the journey on. Optional when a `<JourneyProvider>` is
   * mounted above — the hook reads the runtime from context in that case.
   */
  readonly runtime?: JourneyRuntime;
}

export interface JourneyHostState {
  /**
   * The instance this host owns, or `null` on the very first render — the
   * journey is started from an effect, so it does not exist yet. Hosts
   * typically render a fallback for that one render; `<JourneyHost>` renders
   * `loadingFallback` for you.
   */
  readonly instanceId: InstanceId | null;
  readonly instance: JourneyInstance | null;
  /**
   * The runtime this host pinned on its first render — the one `instanceId`
   * is meaningful to, and the one the host's own `<JourneyOutlet>` is given.
   *
   * Normally identical to whatever a `<JourneyProvider>` above you would hand
   * out, so a hand-placed outlet can keep resolving from context. It is
   * exposed for the case where those two could differ: a shell that swaps its
   * provider value mid-flight. The host does not follow such a swap (see
   * "The instance is fixed"), so this is the runtime to use if you want to be
   * certain you are talking about the same journey the host started.
   */
  readonly runtime: JourneyRuntime;
  /**
   * How many steps the user has completed — `history.length`, so `0` on the
   * first step. Stable across re-renders of the same step, and it rewinds
   * when the journey does.
   *
   * There is deliberately no `stepCount` here. The total is not knowable from
   * a running instance: a journey's next step is computed by a transition
   * handler from live state, so nothing short of walking the transition graph
   * can count the steps ahead — and a hand-passed total is exactly the
   * duplicated flow encoding this API exists to remove. Deriving it from the
   * graph is tracked separately.
   */
  readonly stepIndex: number;
}

/**
 * Own a journey instance for the lifetime of a component: start it on mount,
 * end and forget it on unmount.
 *
 * This is the lifecycle half of "mount a journey"; {@link useJourneySync} is
 * the URL half, and `<JourneyOutlet>` is the rendering half.
 * {@link JourneyHost} packages the first and the last together.
 *
 * **The instance is fixed for the component's lifetime.** `handle`, `input`
 * and `runtime` are read once, at mount; changing them later does not restart
 * the journey, because silently abandoning a half-finished flow because a prop
 * identity changed is never what the caller meant. To run a different journey
 * — or to run it on a different runtime — remount:
 * `<JourneyHost key={journeyId} …>`. The Vue binding resolves its runtime the
 * same way, once at setup.
 *
 * **Start means resume, when persistence is configured.** `runtime.start()`
 * with a `persistence` adapter returns the in-flight instance for the same
 * `keyFor(input)` rather than minting a new one, so a host that remounts
 * (a route change, a tab switch) picks the journey back up where it was.
 * Without persistence every mount starts a fresh instance.
 *
 * @example
 * ```tsx
 * function CheckoutRoute() {
 *   const { instanceId, stepIndex } = useJourneyHost(checkoutHandle, { cartId });
 *   if (!instanceId) return <Skeleton />;
 *   return (
 *     <>
 *       <Progress step={stepIndex} />
 *       <JourneyOutlet instanceId={instanceId} />
 *     </>
 *   );
 * }
 * ```
 */
export function useJourneyHost<TInput>(
  handle: JourneyHandle<string, TInput, unknown>,
  input: TInput,
  options: UseJourneyHostOptions = {},
): JourneyHostState {
  const context = useJourneyContext();
  // Pinned on first render, like `handle` / `input` below. The instance this
  // host owns lives on exactly one runtime, so re-resolving mid-flight could
  // only strand it: the id is meaningless to a different runtime, and the
  // start is latched against StrictMode's remount, which is indistinguishable
  // from a genuine swap by the time the effect re-runs. Reading once makes the
  // effect's `runtime` dep constant and matches the Vue binding, which
  // resolves its runtime once at setup.
  const runtimeRef = useRef(options.runtime ?? context?.runtime);
  const runtime = runtimeRef.current;
  if (!runtime) {
    throw new Error(
      "[@modular-react/journeys] useJourneyHost needs a runtime. Either pass `runtime` or mount a <JourneyProvider>.",
    );
  }

  // Read once, at mount — see "The instance is fixed" above. Refs (not deps)
  // so a caller passing an inline `input` object literal does not thrash.
  const startRef = useRef({ handle, input });
  const [instanceId, setInstanceId] = useState<InstanceId | null>(null);
  const idRef = useRef<InstanceId | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    // Latched on a ref rather than started in render: `runtime.start()`
    // mutates the runtime (and may write to persistence), which a render
    // React discards or replays would duplicate. The latch survives
    // StrictMode's mount/unmount/mount, so the second mount reuses the
    // instance the first one started instead of minting a second.
    if (idRef.current === null) {
      const { handle: h, input: i } = startRef.current;
      // The string-id overload: the handle form's `...rest` tuple cannot be
      // satisfied from a generic `TInput` without widening the call site.
      // `h.id` is the same value the handle overload reads.
      idRef.current = runtime.start(h.id, i);
    }
    setInstanceId(idRef.current);

    return () => {
      mountedRef.current = false;
      const id = idRef.current;
      if (!id) return;
      // Deferred one microtask, matching `<JourneyOutlet>`: StrictMode fires
      // cleanup synchronously and then remounts the same component, and
      // tearing the journey down on its first visit would be a regression a
      // user only sees in dev.
      queueMicrotask(() => {
        if (mountedRef.current) return;
        idRef.current = null;
        // `end` first, then `forget`: `forget` is a no-op on an instance that
        // is still active, and `end` is synchronous, so this ordering both
        // aborts the run and drops the record. An inner `<JourneyOutlet>` may
        // have already ended it — `end` no-ops on a terminal instance, so the
        // race is harmless in either order.
        runtime.end(id, { reason: "unmounted" });
        runtime.forget(id);
      });
    };
  }, [runtime]);

  const instance = useInstanceSnapshot(runtime, instanceId);

  return {
    instanceId,
    instance,
    runtime,
    stepIndex: instance ? instance.history.length : 0,
  };
}

export interface JourneyHostRenderProps {
  readonly instanceId: InstanceId;
  readonly instance: JourneyInstance;
  /** See {@link JourneyHostState.stepIndex}. */
  readonly stepIndex: number;
  /**
   * The `<JourneyOutlet>` for this instance, already built with every outlet
   * prop passed to `<JourneyHost>`. Place it inside your chrome.
   */
  readonly outlet: ReactNode;
}

type JourneyHostBaseProps = Omit<JourneyOutletProps, "instanceId" | "runtime"> & {
  /**
   * Runtime to start the journey on, forwarded to the outlet. Optional when a
   * `<JourneyProvider>` is mounted above.
   */
  readonly runtime?: JourneyRuntime;
  /**
   * Render-prop for chrome around the step — a progress bar, a title, a
   * cancel button. Receives the live instance plus a ready-built `outlet` to
   * place. Omit it and the host renders the outlet bare.
   */
  readonly children?: (host: JourneyHostRenderProps) => ReactNode;
};

/**
 * Mount a journey in one line: `<JourneyHost handle={checkoutHandle} input={{ cartId }} />`.
 *
 * Starts the journey on mount, renders its current step, and ends + forgets
 * the instance on unmount — the wrapper every journey host ends up writing.
 * Every `<JourneyOutlet>` prop is accepted and forwarded, so error and
 * loading policy stay where they were.
 *
 * `loadingFallback` covers the first render too, before the instance exists.
 *
 * For chrome around the step, pass a render-prop child:
 *
 * ```tsx
 * <JourneyHost handle={checkoutHandle} input={{ cartId }} onFinished={goToReceipt}>
 *   {({ stepIndex, outlet }) => (
 *     <Layout title="Checkout" step={stepIndex}>
 *       {outlet}
 *     </Layout>
 *   )}
 * </JourneyHost>
 * ```
 *
 * To deep-link the steps, add {@link useJourneySync} in the same component —
 * the host owns the instance, the sync owns the URL, and neither knows about
 * the other.
 *
 * See {@link useJourneyHost} for the lifecycle rules (the instance is fixed
 * for the host's lifetime; `start` resumes when persistence is configured).
 */
export function JourneyHost<TInput>(props: JourneyHostProps<TInput>): ReactNode {
  // One cast, at the boundary: `JourneyHostProps` makes `input` required
  // exactly when the handle's `TInput` is not `void`, and a deferred
  // conditional type cannot be destructured. The public signature stays
  // precise; everything below sees the resolved shape.
  const {
    handle,
    input,
    runtime: runtimeProp,
    children,
    ...outletProps
  } = props as JourneyHostBaseProps & {
    readonly handle: JourneyHandle<string, TInput, unknown>;
    readonly input: TInput;
  };

  const { instanceId, instance, runtime, stepIndex } = useJourneyHost(handle, input, {
    runtime: runtimeProp,
  });

  if (!instanceId || !instance) return outletProps.loadingFallback ?? null;

  // The pinned runtime, not `runtimeProp`: `instanceId` only means anything on
  // the runtime the host started it on, so forwarding a later prop value would
  // point the outlet at a runtime that has never heard of this instance.
  const outlet = createElement(JourneyOutlet, { ...outletProps, runtime, instanceId });
  if (!children) return outlet;
  return children({ instanceId, instance, stepIndex, outlet });
}

/**
 * Props for {@link JourneyHost}. `input` is required exactly when the
 * handle's `TInput` is not `void`, mirroring `runtime.start`'s overload — so
 * an input-less journey mounts as `<JourneyHost handle={h} />` while a
 * journey that needs input cannot forget to pass it.
 */
export type JourneyHostProps<TInput> = JourneyHostBaseProps & {
  readonly handle: JourneyHandle<string, TInput, unknown>;
} & ([TInput] extends [void] ? { readonly input?: TInput } : { readonly input: TInput });
