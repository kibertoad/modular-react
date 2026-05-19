import { useEffect, useRef } from "react";
import type { ExitFn, ExitPointMap, ExitPointSchema } from "@modular-react/core";

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
 * yet, and is a no-op otherwise. The subscriber returns its own teardown.
 */
export type WaitForExitSubscribeChannel<TExits extends ExitPointMap> = (
  resolve: ExitFn<TExits>,
) => () => void;

/**
 * Periodic check that fires when the answer is ready. The runtime guarantees
 * a tick that arrives after another channel has already won is a no-op
 * (whatever it calls on `resolve` is dropped by the latch), but `check`
 * should still cancel its own outstanding work on unmount where applicable.
 */
export interface WaitForExitPollChannel<TExits extends ExitPointMap> {
  readonly intervalMs: number;
  readonly check: (resolve: ExitFn<TExits>) => void | Promise<void>;
}

/**
 * Deadline arm. The simple form fires a named exit; the function form runs
 * arbitrary code (e.g. dispatches a different exit based on `input`). Pass
 * `0` or a negative `ms` to disable the timeout for a render without
 * conditionally calling the hook.
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
 * declarative.
 *
 * Channel callbacks (`subscribe`, `poll.check`, `timeout.fire`) and the
 * `exit` dispatcher are captured by ref, so changing their identity
 * between renders does NOT restart the wait. The wait restarts on changes
 * to scalar configuration (`poll.intervalMs`, `timeout.ms`, the timeout's
 * named-exit form) so a deadline that genuinely shifts mid-wait is
 * honored.
 *
 * Conventions:
 *
 * - At least one of `subscribe`, `poll`, `timeout` should be present.
 *   With none, the hook is a no-op until the component unmounts.
 *
 * - `resolve(name, output)` is the *latched* exit dispatcher. The latch
 *   is local to one `useWaitForExit` call; the runtime's step-token
 *   mechanism is the global backstop (an exit dispatched after the step
 *   has advanced is dropped by the runtime even if the local latch were
 *   missing).
 *
 * - The hook does not own the journey-level "what does each exit mean"
 *   decision. That lives in the journey's `transitions` map. The hook
 *   only marshals the channels.
 */
export function useWaitForExit<TExits extends ExitPointMap>(
  exit: ExitFn<TExits>,
  channels: WaitForExitChannels<TExits>,
): void {
  // Latest-callback refs so changing identities don't churn the effect.
  const exitRef = useRef(exit);
  const subscribeRef = useRef(channels.subscribe);
  const pollCheckRef = useRef(channels.poll?.check);
  const timeoutFireRef = useRef(channels.timeout?.fire);

  exitRef.current = exit;
  subscribeRef.current = channels.subscribe;
  pollCheckRef.current = channels.poll?.check;
  timeoutFireRef.current = channels.timeout?.fire;

  // Restart-the-wait deps: presence of each channel, plus scalar values
  // that change the wait's shape. `subscribe`/`poll.check` callback
  // identity is deliberately excluded — see ref hoisting above.
  const hasSubscribe = channels.subscribe != null;
  const hasPoll = channels.poll != null;
  const hasTimeout = channels.timeout != null;
  const pollInterval = channels.poll?.intervalMs;
  const timeoutMs = channels.timeout?.ms;
  const timeoutNamedExit =
    channels.timeout && typeof channels.timeout.fire === "string"
      ? channels.timeout.fire
      : undefined;

  useEffect(() => {
    let settled = false;

    // The latched dispatcher every channel calls. `args` is typed loosely
    // here because `ExitFn` is variadic on the schema — the surrounding
    // `ExitFn<TExits>` signature gives consumers the strict type.
    const resolve: ExitFn<TExits> = ((name: Parameters<ExitFn<TExits>>[0], ...args: unknown[]) => {
      if (settled) return;
      settled = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (exitRef.current as (n: any, ...a: unknown[]) => void)(name, ...args);
    }) as ExitFn<TExits>;

    const teardowns: Array<() => void> = [];

    if (hasSubscribe) {
      const unsubscribe = subscribeRef.current?.(resolve);
      if (typeof unsubscribe === "function") teardowns.push(unsubscribe);
    }

    if (hasPoll && pollInterval !== undefined && pollInterval > 0) {
      const id = setInterval(() => {
        if (settled) return;
        try {
          const result = pollCheckRef.current?.(resolve);
          if (result && typeof (result as Promise<void>).then === "function") {
            (result as Promise<void>).catch(() => {
              // Polling failures are non-fatal: the next tick gets another
              // chance, and the push channel / timeout still race. Swallowing
              // here mirrors the runtime's stance on transition-handler
              // throws being instance-level concerns, not per-tick fatal.
            });
          }
        } catch {
          // Sync-throw from `check` — same rationale as the async catch.
        }
      }, pollInterval);
      teardowns.push(() => clearInterval(id));
    }

    if (hasTimeout && timeoutMs !== undefined && timeoutMs > 0) {
      const id = setTimeout(() => {
        if (settled) return;
        const fire = timeoutFireRef.current;
        if (typeof fire === "string") {
          // Sound because the named form's type is constrained to
          // `VoidExitName<TExits>` — exits whose schema is `void`. The
          // cast collapses the resolved variadic tuple back to a
          // zero-arg call from the runtime's perspective.
          (resolve as unknown as (n: string) => void)(fire);
        } else if (typeof fire === "function") {
          fire(resolve);
        }
      }, timeoutMs);
      teardowns.push(() => clearTimeout(id));
    }

    return () => {
      settled = true;
      for (const td of teardowns) {
        try {
          td();
        } catch {
          // A misbehaving channel teardown shouldn't block sibling teardowns
          // or prevent unmount. Swallowed for the same reason `setInterval`
          // errors are: the wait is over either way.
        }
      }
    };
    // The named-exit form of `timeout.fire` is part of the dep set because
    // changing it changes what the deadline fires; the function form is
    // ref'd above. Same logic for `pollInterval` and `timeoutMs`.
  }, [hasSubscribe, hasPoll, hasTimeout, pollInterval, timeoutMs, timeoutNamedExit]);
}
