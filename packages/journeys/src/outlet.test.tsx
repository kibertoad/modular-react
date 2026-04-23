import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
});
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { ModuleEntryProps } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { createJourneyRuntime } from "./runtime.js";
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

  it("fires onFinished once on completion", () => {
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
      payload: expect.anything(),
    });
  });

  it("abandons the instance on unmount when still active", () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-6" });
    const { unmount } = render(
      <JourneyOutlet runtime={rt} instanceId={id} modules={modules} />,
    );
    unmount();
    expect(rt.getInstance(id)!.status).toBe("aborted");
  });
});
