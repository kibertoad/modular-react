import { defineComponent, nextTick, shallowRef } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExitFn } from "@modular-frontend/core";
import { defineExit } from "@modular-frontend/core";

import { useWaitForExit, type WaitForExitChannels } from "./use-wait-for-exit.js";

const waitExits = {
  ready: defineExit<{ token: string }>(),
  timedOut: defineExit(),
} as const;
type WaitExits = typeof waitExits;

/**
 * Mount a component that drives `useWaitForExit` off a reactive `channels` ref.
 * `rerender` swaps the channels (the Vue analog of the React test re-rendering
 * the harness with fresh channels) so the ref-stability / restart-on-scalar
 * behaviors can be exercised.
 */
function renderHarness(exit: ExitFn<WaitExits>, initial: WaitForExitChannels<WaitExits>) {
  const channels = shallowRef<WaitForExitChannels<WaitExits>>(initial);
  const Harness = defineComponent({
    setup() {
      useWaitForExit<WaitExits>(
        () => exit,
        () => channels.value,
      );
      return () => null;
    },
  });
  const wrapper = mount(Harness);
  const rerender = async (next: WaitForExitChannels<WaitExits>) => {
    channels.value = next;
    await nextTick();
  };
  return { wrapper, rerender };
}

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
      pushReady?.("T-1");
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "T-1" });
    });

    it("calls the subscribe teardown on unmount", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const unsubscribe = vi.fn();
      const { wrapper } = renderHarness(exit, {
        subscribe: () => unsubscribe,
      });

      expect(unsubscribe).not.toHaveBeenCalled();
      wrapper.unmount();
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

      vi.advanceTimersByTime(60);
      expect(exit).toHaveBeenCalledExactlyOnceWith("timedOut");

      pushReady?.("T-late");
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

      vi.advanceTimersByTime(250);
      expect(exit).not.toHaveBeenCalled();

      answer = "T-poll";
      vi.advanceTimersByTime(100);
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "T-poll" });
    });

    it("tears down the interval inside resolve so check stops firing", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const check = vi.fn((resolve: ExitFn<WaitExits>) => {
        resolve("ready", { token: "T-poll" });
      });
      renderHarness(exit, { poll: { intervalMs: 50, check } });

      vi.advanceTimersByTime(200);
      // First tick: check runs, resolve fires, the interval is cleared inside
      // resolve. Subsequent advances find no live interval.
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

      vi.advanceTimersByTime(60);
      expect(exit).not.toHaveBeenCalled();

      throws = false;
      vi.advanceTimersByTime(60);
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

      await vi.advanceTimersByTimeAsync(60);
      expect(exit).not.toHaveBeenCalled();

      shouldReject = false;
      await vi.advanceTimersByTimeAsync(60);
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "ok" });
    });

    it("clears the interval on unmount", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const check = vi.fn();
      const { wrapper } = renderHarness(exit, {
        poll: { intervalMs: 50, check },
      });
      vi.advanceTimersByTime(60);
      const ticksBeforeUnmount = check.mock.calls.length;
      wrapper.unmount();
      vi.advanceTimersByTime(500);
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

      vi.advanceTimersByTime(99);
      expect(exit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
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
      vi.advanceTimersByTime(100);
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "fallback" });
    });

    it("clears the timeout on unmount", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const { wrapper } = renderHarness(exit, {
        timeout: { ms: 100, fire: "timedOut" },
      });
      wrapper.unmount();
      vi.advanceTimersByTime(500);
      expect(exit).not.toHaveBeenCalled();
    });

    it("treats ms <= 0 as 'no timeout'", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      renderHarness(exit, { timeout: { ms: 0, fire: "timedOut" } });
      vi.advanceTimersByTime(10_000);
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

      pushReady?.("T-push");
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "T-push" });
      // First-wins teardown is immediate: the winning push drains every live
      // teardown, including subscribe's own unsubscribe.
      expect(unsubscribe).toHaveBeenCalledTimes(1);

      const pollTicksAtWin = pollCheck.mock.calls.length;
      vi.advanceTimersByTime(500);
      expect(exit).toHaveBeenCalledTimes(1);
      // Poll interval was torn down inside resolve, so no further ticks.
      expect(pollCheck.mock.calls.length).toBe(pollTicksAtWin);
      expect(unsubscribe).toHaveBeenCalledTimes(1);
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
      vi.advanceTimersByTime(40);
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "T-poll" });
      vi.advanceTimersByTime(200);
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

    it("does not restart the wait when callback identities change between renders", async () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const subscribeStarts: number[] = [];
      const teardowns: number[] = [];

      const buildChannels = (): WaitForExitChannels<WaitExits> => ({
        subscribe: () => {
          subscribeStarts.push(1);
          return () => {
            teardowns.push(1);
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

      await rerender(buildChannels());
      await rerender(buildChannels());
      await rerender(buildChannels());

      // Subscribe and its teardown ran exactly once across all the re-renders —
      // the closure identity churn didn't restart the channel.
      expect(subscribeStarts).toHaveLength(1);
      expect(teardowns).toHaveLength(0);
    });

    it("restarts the wait when poll.intervalMs changes", async () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const check = vi.fn();
      const { rerender } = renderHarness(exit, {
        poll: { intervalMs: 100, check },
      });

      vi.advanceTimersByTime(100);
      expect(check).toHaveBeenCalledTimes(1);

      await rerender({ poll: { intervalMs: 25, check } });

      const callsAfterRerender = check.mock.calls.length;
      vi.advanceTimersByTime(100);
      // At the new 25ms cadence, 100ms gives ~4 ticks.
      expect(check.mock.calls.length - callsAfterRerender).toBeGreaterThanOrEqual(3);
    });

    it("restarts the wait when timeout.ms changes", async () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const { rerender } = renderHarness(exit, {
        timeout: { ms: 200, fire: "timedOut" },
      });
      vi.advanceTimersByTime(100);

      await rerender({ timeout: { ms: 30, fire: "timedOut" } });

      vi.advanceTimersByTime(40);
      expect(exit).toHaveBeenCalledExactlyOnceWith("timedOut");
    });
  });

  describe("empty channels", () => {
    it("is a no-op when no channels are configured", () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
      const { wrapper } = renderHarness(exit, {});
      wrapper.unmount();
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
      // Subscribe sync-resolved during setup; its own unsubscribe is called
      // immediately (returned after resolve had drained the teardown list).
      expect(unsubscribe).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      expect(exit).toHaveBeenCalledTimes(1);
      expect(pollCheck).not.toHaveBeenCalled();
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
          check: (resolve) => {
            if (answer) resolve("ready", { token: answer });
            return 42 as unknown as void;
          },
        },
      });

      vi.advanceTimersByTime(60);
      expect(exit).not.toHaveBeenCalled();

      answer = "ok";
      vi.advanceTimersByTime(60);
      expect(exit).toHaveBeenCalledExactlyOnceWith("ready", { token: "ok" });
    });

    it("does not depend on the returned thenable having a .catch method", async () => {
      const exit = vi.fn<ExitFn<WaitExits>>();
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

      await vi.advanceTimersByTimeAsync(60);
      // Rejection from the bare thenable is swallowed; no exit fires.
      expect(exit).not.toHaveBeenCalled();
    });
  });
});
