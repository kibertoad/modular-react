import { toValue, watch, watchEffect, type MaybeRefOrGetter } from "vue";
import {
  isDevEnv,
  type ExitFn,
  type ExitPointMap,
  type ExitPointSchema,
} from "@modular-frontend/core";

/**
 * Exit names whose schema declares a `void` output. The named-exit form
 * of {@link WaitForExitTimeoutChannel} narrows to these so a deadline
 * dispatching `resolve(name)` without an output is sound. Exits that
 * require a payload must use the function form
 * (`fire: (resolve) => resolve("name", payload)`).
 */
type VoidExitName<TExits extends ExitPointMap> = {
  [K in keyof TExits & string]: TExits[K] extends ExitPointSchema<infer T>
    ? [T] extends [void]
      ? K
      : never
    : never;
}[keyof TExits & string];

/**
 * One channel that races against the others. `resolve` is the wrapped exit
 * dispatcher: calling it fires the named exit if no other channel has fired
 * yet, and is a no-op otherwise. The subscriber returns its own teardown,
 * which the composable calls **immediately** when any channel wins (not just on
 * unmount) so the losing channels stop doing wakeups between dispatch and
 * unmount.
 *
 * @example
 * ```ts
 * subscribe: (resolve) => {
 *   const handler = (msg: WsFrame) => {
 *     if (msg.type === "process-ready") resolve("ready", { process: msg.payload });
 *   };
 *   ws.on("message", handler);
 *   return () => ws.off("message", handler);
 * }
 * ```
 */
export type WaitForExitSubscribeChannel<TExits extends ExitPointMap> = (
  resolve: ExitFn<TExits>,
) => () => void;

/**
 * Periodic check that fires when the answer is ready. The interval is torn
 * down the moment any channel wins, so `check` is not invoked again after
 * settle. `check` itself should still cancel its own outstanding async
 * work on unmount where applicable (e.g. via `AbortController`).
 *
 * @example
 * ```ts
 * poll: {
 *   intervalMs: 3000,
 *   check: async (resolve) => {
 *     const process = await api.getTranslationProcess(projectId);
 *     if (process) resolve("ready", { process });
 *   },
 * }
 * ```
 */
export interface WaitForExitPollChannel<TExits extends ExitPointMap> {
  readonly intervalMs: number;
  readonly check: (resolve: ExitFn<TExits>) => void | Promise<void>;
}

/**
 * Deadline arm. The simple form fires a named exit; the function form runs
 * arbitrary code (e.g. dispatches a different exit based on `input`). Pass
 * `0` or a negative `ms` to disable the timeout for a render without
 * conditionally calling the composable.
 *
 * @example
 * ```ts
 * // Named form — exit must have a `void` output schema.
 * timeout: { ms: 60_000, fire: "timedOut" }
 *
 * // Function form — choose the exit (and its payload) at deadline time.
 * timeout: {
 *   ms: 60_000,
 *   fire: (resolve) => resolve("failed", { reason: "deadline-exceeded" }),
 * }
 * ```
 */
export type WaitForExitTimeoutChannel<TExits extends ExitPointMap> = {
  readonly ms: number;
} & (
  | { readonly fire: VoidExitName<TExits> }
  | { readonly fire: (resolve: ExitFn<TExits>) => void }
);

export interface WaitForExitChannels<TExits extends ExitPointMap> {
  /** Push channel — websocket, SSE, push notification, server-sent intent. */
  readonly subscribe?: WaitForExitSubscribeChannel<TExits>;
  /** Polling fallback. Omit when the push channel is reliable. */
  readonly poll?: WaitForExitPollChannel<TExits>;
  /** Deadline arm. Omit when no fallback is needed. */
  readonly timeout?: WaitForExitTimeoutChannel<TExits>;
}

/**
 * Wait for one of several async channels to fire and dispatch a journey
 * exit when the first one resolves. Encapsulates the cancellation latch,
 * channel teardown, and first-wins coordination so step components stay
 * declarative. The Vue analog of the React `useWaitForExit` hook.
 *
 * Channel callbacks (`subscribe`, `poll.check`, `timeout.fire`) and the
 * `exit` dispatcher are captured live, so changing their identity between
 * renders does NOT restart the wait. The wait restarts on changes to scalar
 * configuration (`poll.intervalMs`, `timeout.ms`, the timeout's named-exit
 * form) so a deadline that genuinely shifts mid-wait is honored.
 *
 * Both `exit` and `channels` accept a plain value, a ref, or a getter
 * ({@link MaybeRefOrGetter}) — because `setup` runs once, a caller whose
 * channel configuration changes on the same instance should pass a getter (or
 * a ref) so the wait re-arms on scalar changes and picks up the latest
 * callbacks; plain values still work for hosts whose configuration is fixed for
 * the mount. This mirrors how the React hook re-reads its props on re-render.
 *
 * Conventions:
 *
 * - At least one of `subscribe`, `poll`, `timeout` should be present.
 *   With none, the composable is a no-op until the component unmounts.
 *
 * - `resolve(name, output)` is the *latched* exit dispatcher. The latch
 *   is local to one arm cycle; the runtime's step-token mechanism is the
 *   global backstop (an exit dispatched after the step has advanced is
 *   dropped by the runtime even if the local latch were missing).
 *
 * - The composable does not own the journey-level "what does each exit mean"
 *   decision. That lives in the journey's `transitions` map. It only marshals
 *   the channels.
 *
 * - **First-wins teardown is immediate.** When any channel calls `resolve`,
 *   the *other* channels' teardowns run before the exit dispatches. A subscribe
 *   that synchronously calls `resolve` during setup still has its `unsubscribe`
 *   invoked; poll / timeout are not armed at all in that case.
 *
 * - The arm cycle is monolithic: changing any scalar dep (`pollInterval`,
 *   `timeoutMs`, the timeout's named-exit form) tears down *all* live channels
 *   and re-arms them. Callers that need independent per-channel lifecycles
 *   should split into multiple `useWaitForExit` calls or manage that channel
 *   themselves.
 */
export function useWaitForExit<TExits extends ExitPointMap>(
  exit: MaybeRefOrGetter<ExitFn<TExits>>,
  channels: MaybeRefOrGetter<WaitForExitChannels<TExits>>,
): void {
  // Latest-callback holders so changing identities don't churn the arm cycle.
  // The `watchEffect` keeps them fresh on every reactive change to `exit` /
  // `channels`; the arm cycle reads them at arm time and inside the channel
  // callbacks — never the arguments directly.
  const latest: {
    exit: ExitFn<TExits> | undefined;
    subscribe: WaitForExitChannels<TExits>["subscribe"];
    pollCheck: WaitForExitPollChannel<TExits>["check"] | undefined;
    timeoutFire: WaitForExitTimeoutChannel<TExits>["fire"] | undefined;
  } = {
    exit: undefined,
    subscribe: undefined,
    pollCheck: undefined,
    timeoutFire: undefined,
  };

  watchEffect(() => {
    const ch = toValue(channels);
    latest.exit = toValue(exit);
    latest.subscribe = ch.subscribe;
    latest.pollCheck = ch.poll?.check;
    latest.timeoutFire = ch.timeout?.fire;
  });

  const arm = (onCleanup: (fn: () => void) => void): void => {
    const ch = toValue(channels);
    const hasSubscribe = ch.subscribe != null;
    const hasPoll = ch.poll != null;
    const hasTimeout = ch.timeout != null;
    const pollInterval = ch.poll?.intervalMs;
    const timeoutMs = ch.timeout?.ms;

    let settled = false;
    const teardowns: Array<() => void> = [];

    const safeTeardown = (td: () => void) => {
      try {
        td();
      } catch (err) {
        if (isDevEnv()) {
          // A misbehaving channel teardown shouldn't block sibling teardowns
          // or prevent unmount — but it's almost always a bug worth flagging
          // in dev so the author sees it.
          console.warn("[useWaitForExit] channel teardown threw:", err);
        }
      }
    };

    const drainTeardowns = () => {
      // Drain so a user-supplied teardown never runs twice — websocket
      // close / AbortController.abort / unsubscribe-from-emitter are not
      // always idempotent.
      const list = teardowns.splice(0);
      for (const td of list) safeTeardown(td);
    };

    // First-wins latched dispatcher. On the winning call we tear down every
    // *other* channel before dispatching, so the losing channels can't do
    // wakeups between dispatch and unmount.
    const resolve: ExitFn<TExits> = ((name: Parameters<ExitFn<TExits>>[0], ...args: unknown[]) => {
      if (settled) return;
      settled = true;
      drainTeardowns();
      (latest.exit as unknown as (n: any, ...a: unknown[]) => void)?.(name, ...args);
    }) as ExitFn<TExits>;

    const registerTeardown = (td: () => void) => {
      // A subscribe that synchronously called `resolve` will have drained
      // the (empty-at-that-moment) teardown list before its unsubscribe
      // was returned. We still need to release that listener, just not
      // via the list.
      if (settled) safeTeardown(td);
      else teardowns.push(td);
    };

    if (hasSubscribe) {
      const unsubscribe = latest.subscribe?.(resolve);
      if (typeof unsubscribe === "function") registerTeardown(unsubscribe);
    }

    // If a synchronous subscribe-resolve already won, don't arm the fallback
    // channels at all — the wait is already over.
    if (!settled && hasPoll && pollInterval !== undefined && pollInterval > 0) {
      const id = setInterval(() => {
        if (settled) return;
        try {
          const result = latest.pollCheck?.(resolve);
          if (result && typeof (result as PromiseLike<void>).then === "function") {
            // `Promise.resolve` adopts the thenable into a real Promise, so we
            // don't depend on the user's value having a `.catch`.
            Promise.resolve(result as PromiseLike<void>).catch(() => {
              // Polling failures are non-fatal: the next tick gets another
              // chance, and the push / timeout channels still race.
            });
          }
        } catch {
          // Sync-throw from `check` — same rationale as the async catch.
        }
      }, pollInterval);
      registerTeardown(() => clearInterval(id));
    }

    if (!settled && hasTimeout && timeoutMs !== undefined && timeoutMs > 0) {
      const id = setTimeout(() => {
        if (settled) return;
        const fire = latest.timeoutFire;
        if (typeof fire === "string") {
          // Sound because the named form's type is constrained to
          // `VoidExitName<TExits>` — exits whose schema is `void`.
          (resolve as unknown as (n: string) => void)(fire);
        } else if (typeof fire === "function") {
          fire(resolve);
        }
      }, timeoutMs);
      registerTeardown(() => clearTimeout(id));
    }

    onCleanup(() => {
      settled = true;
      drainTeardowns();
    });
  };

  // Re-arm only when the wait's *shape* changes. The key folds the presence of
  // each channel and the scalar values that change what the wait does; callback
  // identity is deliberately excluded (it lives in `latest`), so a re-render
  // that only hands over fresh closures does not restart. The named-exit form
  // of `timeout.fire` is part of the key because changing it changes what the
  // deadline fires; the function form is read live from `latest`.
  watch(
    () => {
      const ch = toValue(channels);
      const timeoutNamedExit =
        ch.timeout && typeof ch.timeout.fire === "string" ? ch.timeout.fire : undefined;
      return [
        ch.subscribe != null,
        ch.poll != null,
        ch.timeout != null,
        ch.poll?.intervalMs,
        ch.timeout?.ms,
        timeoutNamedExit,
      ].join("|");
    },
    (_key, _old, onCleanup) => {
      arm(onCleanup);
    },
    { immediate: true },
  );
}
