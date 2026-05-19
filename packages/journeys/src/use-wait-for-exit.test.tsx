import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, StrictMode } from "react";
import type { ExitFn } from "@modular-react/core";
import { defineExit } from "@modular-react/core";

import { useWaitForExit, type WaitForExitChannels } from "./use-wait-for-exit.js";

afterEach(() => {
  cleanup();
});

const waitExits = {
  ready: defineExit<{ token: string }>(),
  timedOut: defineExit(),
} as const;
type WaitExits = typeof waitExits;

function Harness({
  exit,
  channels,
}: {
  readonly exit: ExitFn<WaitExits>;
  readonly channels: WaitForExitChannels<WaitExits>;
}) {
  useWaitForExit(exit, channels);
  return null;
}

const renderHarness = (exit: ExitFn<WaitExits>, channels: WaitForExitChannels<WaitExits>) =>
  render(createElement(Harness, { exit, channels }));

describe("useWaitForExit", () => {
  describe("subscribe channel", () => {
    it("fires the exit when the subscribe callback resolves", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      let pushReady: ((token: string) => void) | undefined;
      const unsubscribe = vi.fn();

      renderHarness(exit, {
        subscribe: (resolve) => {
          pushReady = (token) => resolve("ready", { token });
          return unsubscribe;
        },
      });

      expect(exit).not.toHaveBeenCalled();
      act(() => pushReady?.("T-1"));
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "T-1" });
    });

    it("calls the subscribe teardown on unmount", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const unsubscribe = vi.fn();
      const { unmount } = renderHarness(exit, {
        subscribe: () => unsubscribe,
      });

      expect(unsubscribe).not.toHaveBeenCalled();
      unmount();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("drops late subscribe pushes that arrive after another channel won", () => {
      vi.useFakeTimers();
      const exit = vi.fn<ExitFn<WaitExits>>();
      let pushReady: ((token: string) => void) | undefined;

      renderHarness(exit, {
        subscribe: (resolve) => {
          pushReady = (token) => resolve("ready", { token });
          return () => {};
        },
        timeout: { ms: 50, fire: "timedOut" },
      });

      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(exit).toHaveBeenCalledExactlyOnceWith("timedOut");

      act(() => pushReady?.("T-late"));
      expect(exit).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe("poll channel", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("fires the exit when poll.check resolves the wait", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      let answer: string | null = null;
      renderHarness(exit, {
        poll: {
          intervalMs: 100,
          check: (resolve) => {
            if (answer) resolve("ready", { token: answer });
          },
        },
      });

      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(exit).not.toHaveBeenCalled();

      answer = "T-poll";
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "T-poll" });
    });

    it("tears down the interval inside resolve so check stops firing", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const check = vi.fn((resolve: ExitFn<WaitExits>) => {
        resolve("ready", { token: "T-poll" });
      });
      renderHarness(exit, { poll: { intervalMs: 50, check } });

      act(() => {
        vi.advanceTimersByTime(200);
      });
      // First tick: check runs, resolve fires, the interval is cleared
      // inside resolve. Subsequent timer advances find no live interval,
      // so check is invoked exactly once and exit exactly once.
      expect(exit).toHaveBeenCalledTimes(1);
      expect(check).toHaveBeenCalledTimes(1);
    });

    it("swallows synchronous throws from poll.check", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      let throws = true;
      renderHarness(exit, {
        poll: {
          intervalMs: 50,
          check: (resolve) => {
            if (throws) throw new Error("boom");
            resolve("ready", { token: "ok" });
          },
        },
      });

      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(exit).not.toHaveBeenCalled();

      throws = false;
      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "ok" });
    });

    it("swallows rejected promises from poll.check", async () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      let shouldReject = true;
      renderHarness(exit, {
        poll: {
          intervalMs: 50,
          check: async (resolve) => {
            if (shouldReject) throw new Error("flake");
            resolve("ready", { token: "ok" });
          },
        },
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });
      expect(exit).not.toHaveBeenCalled();

      shouldReject = false;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "ok" });
    });

    it("clears the interval on unmount", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const check = vi.fn();
      const { unmount } = renderHarness(exit, {
        poll: { intervalMs: 50, check },
      });
      act(() => {
        vi.advanceTimersByTime(60);
      });
      const ticksBeforeUnmount = check.mock.calls.length;
      unmount();
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(check.mock.calls.length).toBe(ticksBeforeUnmount);
    });
  });

  describe("timeout channel", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("fires the named exit when the deadline elapses", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      renderHarness(exit, { timeout: { ms: 100, fire: "timedOut" } });

      act(() => {
        vi.advanceTimersByTime(99);
      });
      expect(exit).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(exit).toHaveBeenCalledExactlyOnceWith("timedOut");
    });

    it("fires the function form so callers can choose the exit", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      renderHarness(exit, {
        timeout: {
          ms: 100,
          fire: (resolve) => resolve("ready", { token: "fallback" }),
        },
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "fallback" });
    });

    it("clears the timeout on unmount", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const { unmount } = renderHarness(exit, {
        timeout: { ms: 100, fire: "timedOut" },
      });
      unmount();
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(exit).not.toHaveBeenCalled();
    });

    it("treats ms <= 0 as 'no timeout'", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      renderHarness(exit, { timeout: { ms: 0, fire: "timedOut" } });
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(exit).not.toHaveBeenCalled();
    });
  });

  describe("first-wins across channels", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("subscribe winning tears down poll and timeout immediately", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      let pushReady: ((token: string) => void) | undefined;
      const pollCheck = vi.fn();
      const unsubscribe = vi.fn();

      renderHarness(exit, {
        subscribe: (resolve) => {
          pushReady = (token) => resolve("ready", { token });
          return unsubscribe;
        },
        poll: { intervalMs: 50, check: pollCheck },
        timeout: { ms: 100, fire: "timedOut" },
      });

      act(() => pushReady?.("T-push"));
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "T-push" });

      // The subscribe channel is the winner — its own unsubscribe is not
      // called by resolve (only the *losing* channels are torn down). It
      // is still called on unmount via the normal cleanup path.
      const pollTicksAtWin = pollCheck.mock.calls.length;
      const unsubsAtWin = unsubscribe.mock.calls.length;
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(exit).toHaveBeenCalledTimes(1);
      // Poll interval was torn down inside resolve, so no further ticks.
      expect(pollCheck.mock.calls.length).toBe(pollTicksAtWin);
      // Subscribe's own unsubscribe is deferred to unmount.
      expect(unsubscribe.mock.calls.length).toBe(unsubsAtWin);
    });

    it("poll winning prevents timeout from firing", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      renderHarness(exit, {
        poll: {
          intervalMs: 30,
          check: (resolve) => resolve("ready", { token: "T-poll" }),
        },
        timeout: { ms: 100, fire: "timedOut" },
      });
      act(() => {
        vi.advanceTimersByTime(40);
      });
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "T-poll" });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(exit).toHaveBeenCalledTimes(1);
    });
  });

  describe("ref-stable callbacks", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not restart the wait when callback identities change between renders", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const subscribeStarts: number[] = [];
      const teardowns: number[] = [];

      const buildChannels = (): WaitForExitChannels<WaitExits> => ({
        subscribe: () => {
          subscribeStarts.push(Date.now());
          return () => {
            teardowns.push(Date.now());
          };
        },
        poll: {
          intervalMs: 50,
          check: () => {
            /* identity-fresh each render */
          },
        },
      });

      const { rerender } = renderHarness(exit, buildChannels());
      expect(subscribeStarts).toHaveLength(1);

      rerender(createElement(Harness, { exit, channels: buildChannels() }));
      rerender(createElement(Harness, { exit, channels: buildChannels() }));
      rerender(createElement(Harness, { exit, channels: buildChannels() }));

      // Subscribe and its teardown ran exactly once across all the
      // re-renders — the closure identity churn didn't unmount the
      // channel.
      expect(subscribeStarts).toHaveLength(1);
      expect(teardowns).toHaveLength(0);
    });

    it("restarts the wait when poll.intervalMs changes", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const check = vi.fn();
      const { rerender } = renderHarness(exit, {
        poll: { intervalMs: 100, check },
      });

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(check).toHaveBeenCalledTimes(1);

      rerender(
        createElement(Harness, {
          exit,
          channels: { poll: { intervalMs: 25, check } },
        }),
      );

      const callsAfterRerender = check.mock.calls.length;
      act(() => {
        vi.advanceTimersByTime(100);
      });
      // At the new 25ms cadence, 100ms gives ~4 ticks. Loose bound: at
      // least 3 to absorb scheduler timing variance, definitely more
      // than the 1 we'd get if the interval were still 100ms.
      expect(check.mock.calls.length - callsAfterRerender).toBeGreaterThanOrEqual(3);
    });

    it("restarts the wait when timeout.ms changes", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const { rerender } = renderHarness(exit, {
        timeout: { ms: 200, fire: "timedOut" },
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      rerender(
        createElement(Harness, {
          exit,
          channels: { timeout: { ms: 30, fire: "timedOut" } },
        }),
      );

      act(() => {
        vi.advanceTimersByTime(40);
      });
      expect(exit).toHaveBeenCalledExactlyOnceWith("timedOut");
    });
  });

  describe("empty channels", () => {
    it("is a no-op when no channels are configured", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const { unmount } = renderHarness(exit, {});
      unmount();
      expect(exit).not.toHaveBeenCalled();
    });
  });

  describe("sync subscribe-resolve", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not arm poll/timeout when subscribe resolves synchronously", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const pollCheck = vi.fn();
      const unsubscribe = vi.fn();

      renderHarness(exit, {
        subscribe: (resolve) => {
          resolve("ready", { token: "T-sync" });
          return unsubscribe;
        },
        poll: { intervalMs: 50, check: pollCheck },
        timeout: { ms: 100, fire: "timedOut" },
      });

      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "T-sync" });
      // Subscribe sync-resolved during setup; the subscribe's own
      // unsubscribe is called immediately (it was returned after resolve
      // had already drained the teardown list, so it doesn't go in the
      // deferred-cleanup queue).
      expect(unsubscribe).toHaveBeenCalledTimes(1);

      // Advance well past both poll and timeout schedules — neither
      // should fire because they were never armed.
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(exit).toHaveBeenCalledTimes(1);
      expect(pollCheck).not.toHaveBeenCalled();
    });
  });

  describe("StrictMode", () => {
    it("survives the dev double-mount sequence (setup → cleanup → setup)", () => {
      // StrictMode double-invokes the effect in dev. The hook's
      // per-effect-run `settled` latch and teardown list are local to
      // each run, so cleanup releases the first run's resources before
      // the second run arms them.
      const exit = vi.fn<ExitFn<WaitExits>>();
      let pushReady: ((token: string) => void) | undefined;

      render(
        createElement(
          StrictMode,
          null,
          createElement(Harness, {
            exit,
            channels: {
              subscribe: (resolve) => {
                pushReady = (token) => resolve("ready", { token });
                return () => {
                  // The previous mount's pushReady reference is
                  // overwritten by the second setup; this teardown nulls
                  // it out only if the latest closure is the active one.
                };
              },
            },
          }),
        ),
      );

      // The most recently committed mount's subscribe is the live one;
      // firing through it fires the exit exactly once.
      act(() => pushReady?.("T-strict"));
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "T-strict" });
    });
  });

  describe("poll.check return-value handling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("treats a truthy non-thenable return as a sync check (no .catch crash)", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      let answer: string | null = null;
      renderHarness(exit, {
        poll: {
          intervalMs: 50,
          // Returning a non-undefined / non-thenable value (e.g. a sentinel
          // some test doubles use) must not be treated as a Promise.
          check: (resolve) => {
            if (answer) resolve("ready", { token: answer });
            return 42 as unknown as void;
          },
        },
      });

      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(exit).not.toHaveBeenCalled();

      answer = "ok";
      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "ok" });
    });

    it("does not depend on the returned thenable having a .catch method", async () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      // A thenable without `.catch` — the implementation routes through
      // Promise.resolve so this should still be safely handled.
      const bareThenable: PromiseLike<void> = {
        then(_resolve, reject) {
          reject?.(new Error("flake"));
        },
      };
      renderHarness(exit, {
        poll: {
          intervalMs: 50,
          check: () => bareThenable,
        },
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });
      // Rejection from the bare thenable is swallowed; no exit fires,
      // no unhandled-rejection crash.
      expect(exit).not.toHaveBeenCalled();
    });
  });
});
