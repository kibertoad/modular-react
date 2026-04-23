import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
});
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { ModuleEntryProps } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { createJourneyRuntime, getInternals } from "./runtime.js";
import { JourneyOutlet } from "./outlet.js";

// --- Modules with real components --------------------------------------------

const accountExits = {
  goNext: defineExit<{ amount: number }>(),
} as const;

function ReviewAccount({
  input,
  exit,
  goBack,
}: ModuleEntryProps<{ customerId: string }, typeof accountExits>) {
  return (
    <div>
      <div data-testid="review-customer">{input.customerId}</div>
      {goBack ? <button onClick={goBack}>back-from-review</button> : null}
      <button
        onClick={() => {
          exit("goNext", { amount: 42 });
        }}
      >
        next
      </button>
    </div>
  );
}

const accountModule = defineModule({
  id: "account",
  version: "1.0.0",
  exitPoints: accountExits,
  entryPoints: {
    review: defineEntry({
      component: ReviewAccount,
      input: schema<{ customerId: string }>(),
    }),
  },
});

const debtsExits = {
  done: defineExit<{ amount: number }>(),
} as const;

function Negotiate({
  input,
  exit,
  goBack,
}: ModuleEntryProps<{ amount: number }, typeof debtsExits>) {
  return (
    <div>
      <div data-testid="negotiate-amount">{input.amount}</div>
      {goBack ? <button onClick={goBack}>back-from-negotiate</button> : null}
      <button
        onClick={() => {
          exit("done", { amount: input.amount });
        }}
      >
        finish
      </button>
    </div>
  );
}

const debtsModule = defineModule({
  id: "debts",
  version: "1.0.0",
  exitPoints: debtsExits,
  entryPoints: {
    negotiate: defineEntry({
      component: Negotiate,
      input: schema<{ amount: number }>(),
      allowBack: "preserve-state",
    }),
  },
});

type Modules = {
  readonly account: typeof accountModule;
  readonly debts: typeof debtsModule;
};

const journey = defineJourney<Modules, { customerId: string }>()({
  id: "demo",
  version: "1.0.0",
  initialState: (input: { customerId: string }) => ({ customerId: input.customerId }),
  start: (s) => ({ module: "account", entry: "review", input: { customerId: s.customerId } }),
  transitions: {
    account: {
      review: {
        goNext: ({ output }) => ({
          next: { module: "debts", entry: "negotiate", input: { amount: output.amount } },
        }),
      },
    },
    debts: {
      negotiate: {
        allowBack: true,
        done: ({ output }) => ({ complete: { amount: output.amount } }),
      },
    },
  },
});

const modules = { account: accountModule, debts: debtsModule };

function makeRuntime() {
  return createJourneyRuntime([{ definition: journey, options: undefined }], {
    modules,
    debug: false,
  });
}

describe("JourneyOutlet", () => {
  it("renders the start step's component with its input", () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-1" });
    const { getByTestId } = render(
      <JourneyOutlet runtime={rt} instanceId={id} modules={modules} />,
    );
    expect(getByTestId("review-customer").textContent).toBe("C-1");
  });

  it("re-renders after a transition", () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-2" });
    const { getByText, getByTestId } = render(
      <JourneyOutlet runtime={rt} instanceId={id} modules={modules} />,
    );
    act(() => {
      getByText("next").click();
    });
    expect(getByTestId("negotiate-amount").textContent).toBe("42");
  });

  it("does not render goBack when history is empty", () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-3" });
    const { queryByText } = render(
      <JourneyOutlet runtime={rt} instanceId={id} modules={modules} />,
    );
    expect(queryByText("back-from-review")).toBeNull();
  });

  it("renders goBack on the second step and returns to the first step when clicked", () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-4" });
    const { getByText, getByTestId } = render(
      <JourneyOutlet runtime={rt} instanceId={id} modules={modules} />,
    );
    act(() => {
      getByText("next").click();
    });
    expect(getByTestId("negotiate-amount")).toBeTruthy();
    act(() => {
      getByText("back-from-negotiate").click();
    });
    expect(getByTestId("review-customer").textContent).toBe("C-4");
  });

  it("fires onFinished once on completion with the terminal payload and ids", () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-5" });
    const onFinished = vi.fn();
    const { getByText } = render(
      <JourneyOutlet runtime={rt} instanceId={id} modules={modules} onFinished={onFinished} />,
    );
    act(() => {
      getByText("next").click();
    });
    act(() => {
      getByText("finish").click();
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledWith({
      status: "completed",
      payload: { amount: 42 },
      instanceId: id,
      journeyId: "demo",
    });
  });

  it("abandons the instance on unmount when still active", async () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-6" });
    const { unmount } = render(<JourneyOutlet runtime={rt} instanceId={id} modules={modules} />);
    unmount();
    // Abandon is deferred one microtask so StrictMode's simulated
    // mount/unmount/mount cycle cannot tear the instance down prematurely.
    await Promise.resolve();
    expect(rt.getInstance(id)!.status).toBe("aborted");
  });

  it("survives a StrictMode-style cleanup/remount without aborting", async () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-7" });
    // Render twice with the same instance id — imitates the second mount
    // of React 19 StrictMode after the simulated teardown.
    const first = render(<JourneyOutlet runtime={rt} instanceId={id} modules={modules} />);
    first.unmount();
    render(<JourneyOutlet runtime={rt} instanceId={id} modules={modules} />);
    await Promise.resolve();
    expect(rt.getInstance(id)!.status).toBe("active");
  });

  it("survives outlet-A unmount while outlet-B mounts against the same instance", async () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-7b" });
    // Outlet A mounts, outlet B mounts (both attached), outlet A unmounts.
    // The listener-count check in the cleanup microtask must keep the
    // instance alive because outlet B is still subscribed.
    const outletA = render(<JourneyOutlet runtime={rt} instanceId={id} modules={modules} />);
    render(<JourneyOutlet runtime={rt} instanceId={id} modules={modules} />);
    outletA.unmount();
    await Promise.resolve();
    expect(rt.getInstance(id)!.status).toBe("active");
    // Outlet B is still subscribed, so the record must have a live listener.
    const internals = getInternals(rt);
    expect(internals.__getRecord(id)!.listeners.size).toBeGreaterThan(0);
  });

  it("renders loadingFallback while the instance is in loading status", async () => {
    let resolveLoad: (blob: null) => void = () => {};
    const loadPromise = new Promise<null>((r) => {
      resolveLoad = r;
    });
    const rt = createJourneyRuntime(
      [
        {
          definition: journey,
          options: {
            persistence: {
              keyFor: () => "k",
              load: () => loadPromise,
              save: () => {},
              remove: () => {},
            },
          },
        },
      ],
      { modules, debug: false },
    );
    const id = rt.start("demo", { customerId: "C-8" });
    const { getByText } = render(
      <JourneyOutlet
        runtime={rt}
        instanceId={id}
        modules={modules}
        loadingFallback={<div>please wait</div>}
      />,
    );
    expect(getByText("please wait")).toBeTruthy();
    resolveLoad(null);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("caps onStepError retries before falling back to abort", () => {
    function Throwing(_props: ModuleEntryProps<{ customerId: string }, typeof accountExits>) {
      throw new Error("boom");
    }
    const throwingModule = defineModule({
      id: "account",
      version: "1.0.0",
      exitPoints: accountExits,
      entryPoints: {
        review: defineEntry({
          component: Throwing,
          input: schema<{ customerId: string }>(),
        }),
      },
    });
    const localModules = { account: throwingModule, debts: debtsModule };
    type LocalModules = {
      readonly account: typeof throwingModule;
      readonly debts: typeof debtsModule;
    };
    const throwingJourney = defineJourney<LocalModules, { customerId: string }>()({
      id: "throwing",
      version: "1.0.0",
      initialState: (input: { customerId: string }) => ({ customerId: input.customerId }),
      start: (s) => ({ module: "account", entry: "review", input: { customerId: s.customerId } }),
      transitions: {},
    });
    const rt = createJourneyRuntime(
      [{ definition: throwingJourney as never, options: undefined }],
      { modules: localModules, debug: false },
    );
    const id = rt.start("throwing", { customerId: "C-9" });
    const onStepError = vi.fn(() => "retry" as const);
    // The boundary logs by design; keep test output clean.
    const restoreError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <JourneyOutlet
        runtime={rt}
        instanceId={id}
        modules={localModules}
        onStepError={onStepError}
        retryLimit={1}
      />,
    );
    restoreError.mockRestore();
    // Initial render throws, retry runs once, retry throws, retry budget
    // exhausted, falls back to abort.
    expect(rt.getInstance(id)!.status).toBe("aborted");
    expect(onStepError.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("renders the step-error fallback card when onStepError returns 'ignore'", () => {
    function Throwing(_props: ModuleEntryProps<{ customerId: string }, typeof accountExits>) {
      throw new Error("kaboom");
    }
    const throwingModule = defineModule({
      id: "account",
      version: "1.0.0",
      exitPoints: accountExits,
      entryPoints: {
        review: defineEntry({
          component: Throwing,
          input: schema<{ customerId: string }>(),
        }),
      },
    });
    const localModules = { account: throwingModule, debts: debtsModule };
    type LocalModules = {
      readonly account: typeof throwingModule;
      readonly debts: typeof debtsModule;
    };
    const throwingJourney = defineJourney<LocalModules, { customerId: string }>()({
      id: "ignoring",
      version: "1.0.0",
      initialState: (input: { customerId: string }) => ({ customerId: input.customerId }),
      start: (s) => ({ module: "account", entry: "review", input: { customerId: s.customerId } }),
      transitions: {},
    });
    const rt = createJourneyRuntime(
      [{ definition: throwingJourney as never, options: undefined }],
      { modules: localModules, debug: false },
    );
    const id = rt.start("ignoring", { customerId: "C-ignore" });
    const restoreError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container, getByText } = render(
      <JourneyOutlet
        runtime={rt}
        instanceId={id}
        modules={localModules}
        onStepError={() => "ignore"}
      />,
    );
    restoreError.mockRestore();
    // Instance stays active — `ignore` keeps the boundary UI up without
    // aborting. The fallback card must be visible (the blank-screen bug
    // regression guard).
    expect(rt.getInstance(id)!.status).toBe("active");
    expect(container.querySelector('[data-journey-step-error="account"]')).toBeTruthy();
    expect(getByText(/encountered an error/i)).toBeTruthy();
    expect(getByText(/kaboom/)).toBeTruthy();
  });
});
