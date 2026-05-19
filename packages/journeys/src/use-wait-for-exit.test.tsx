import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
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

    it("drops poll ticks after the latch has fired", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const check = vi.fn((resolve: ExitFn<WaitExits>) => {
        resolve("ready", { token: "T-poll" });
      });
      renderHarness(exit, { poll: { intervalMs: 50, check } });

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(exit).toHaveBeenCalledTimes(1);
      // check ran on the first tick (settled), and subsequent ticks may
      // still invoke `check` before the early-return latch is consulted;
      // the contract is that `exit` (the user's dispatcher) is called
      // at most once, not that `check` is.
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

    it("subscribe winning prevents poll and timeout from firing", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      let pushReady: ((token: string) => void) | undefined;
      const pollCheck = vi.fn();

      renderHarness(exit, {
        subscribe: (resolve) => {
          pushReady = (token) => resolve("ready", { token });
          return () => {};
        },
        poll: { intervalMs: 50, check: pollCheck },
        timeout: { ms: 100, fire: "timedOut" },
      });

      act(() => pushReady?.("T-push"));
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "T-push" });

      const ticksAtWin = pollCheck.mock.calls.length;
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(exit).toHaveBeenCalledTimes(1);
      // Poll interval keeps ticking until unmount; `check` may run again
      // but the latch keeps `exit` at one call. The contract is exit-once,
      // not check-never.
      expect(pollCheck.mock.calls.length).toBeGreaterThanOrEqual(ticksAtWin);
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
});
