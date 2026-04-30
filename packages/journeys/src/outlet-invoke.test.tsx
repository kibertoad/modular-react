// React-level tests for the outlet's behavior around invoke/resume:
//   - leafOnly default renders the leaf step (parent's component is hidden
//     while the child is in flight, then resurfaces after resume).
//   - leafOnly={false} stays on the parent's step so a second outlet (or
//     custom layered presentation) can render the child.
//   - useJourneyCallStack returns root-to-leaf and updates on transitions.
//   - onFinished fires for the root only — not for child terminations.
//   - Abandon-on-unmount targets the root and cascades to the child.

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { ModuleEntryProps } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { defineJourneyHandle, invoke } from "./handle.js";
import { createJourneyRuntime } from "./runtime.js";
import { JourneyOutlet, useJourneyCallStack } from "./outlet.js";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Components and modules — parent has a "review" step that invokes a child;
// child has a "verify" step that completes; parent has a "confirm" step it
// reaches via the resume.
// ---------------------------------------------------------------------------

const childExits = { done: defineExit<{ token: string }>() } as const;
function VerifyComponent({
  input,
  exit,
}: ModuleEntryProps<{ subject: string }, typeof childExits>) {
  return createElement(
    "div",
    null,
    createElement("div", { "data-testid": "verify-subject" }, input.subject),
    createElement(
      "button",
      {
        "data-testid": "verify-done",
        onClick: () => exit("done", { token: `T-${input.subject}` }),
      },
      "verify-done",
    ),
  );
}
const childMod = defineModule({
  id: "verifier",
  version: "1.0.0",
  exitPoints: childExits,
  entryPoints: {
    review: defineEntry({
      component: VerifyComponent,
      input: schema<{ subject: string }>(),
    }),
  },
});

const childJourney = defineJourney<
  { verifier: typeof childMod },
  { subject: string },
  { token: string }
>()({
  id: "verify",
  version: "1.0.0",
  initialState: (input: { subject: string }) => ({ subject: input.subject }),
  start: (s) => ({ module: "verifier", entry: "review", input: { subject: s.subject } }),
  transitions: {
    verifier: {
      review: { done: ({ output }) => ({ complete: { token: output.token } }) },
    },
  },
});
const childHandle = defineJourneyHandle(childJourney);

const parentExits = { pickPlan: defineExit() } as const;
function ReviewComponent({
  input,
  exit,
}: ModuleEntryProps<{ orderId: string }, typeof parentExits>) {
  return createElement(
    "div",
    null,
    createElement("div", { "data-testid": "review-order" }, input.orderId),
    createElement(
      "button",
      { "data-testid": "review-pick", onClick: () => exit("pickPlan") },
      "pick",
    ),
  );
}
function ConfirmComponent({ input }: ModuleEntryProps<{ orderId: string; token: string }, never>) {
  return createElement("div", { "data-testid": "confirm" }, `${input.orderId}:${input.token}`);
}

const parentMod = defineModule({
  id: "checkout",
  version: "1.0.0",
  exitPoints: parentExits,
  entryPoints: {
    review: defineEntry({
      component: ReviewComponent,
      input: schema<{ orderId: string }>(),
    }),
    confirm: defineEntry({
      component: ConfirmComponent,
      input: schema<{ orderId: string; token: string }>(),
    }),
  },
});

interface ParentState {
  readonly orderId: string;
  readonly token: string | null;
}

const parentJourney = defineJourney<{ checkout: typeof parentMod }, ParentState>()({
  id: "checkout",
  version: "1.0.0",
  initialState: (input: { orderId: string }) => ({ orderId: input.orderId, token: null }),
  start: (s) => ({ module: "checkout", entry: "review", input: { orderId: s.orderId } }),
  transitions: {
    checkout: {
      review: {
        pickPlan: ({ state }) =>
          invoke({
            handle: childHandle,
            input: { subject: state.orderId },
            resume: "afterVerify",
          }),
      },
    },
  },
  resumes: {
    checkout: {
      review: {
        afterVerify: ({ state, outcome }) =>
          outcome.status === "completed"
            ? {
                state: { ...state, token: outcome.payload.token },
                next: {
                  module: "checkout",
                  entry: "confirm",
                  input: { orderId: state.orderId, token: outcome.payload.token },
                },
              }
            : { abort: { reason: "verify-aborted" } },
      },
    },
  },
});
const parentHandle = defineJourneyHandle(parentJourney);

function buildRuntime() {
  return createJourneyRuntime(
    [
      { definition: parentJourney, options: undefined },
      { definition: childJourney, options: undefined },
    ],
    { modules: { checkout: parentMod, verifier: childMod }, debug: false },
  );
}

// ---------------------------------------------------------------------------
// Leaf-walk default
// ---------------------------------------------------------------------------

describe("JourneyOutlet — leaf-walk (default)", () => {
  it("renders the parent's review step before invoke, the child's verify step after, and the parent's confirm after resume", () => {
    const rt = buildRuntime();
    const id = rt.start(parentHandle, { orderId: "O-99" });
    const ui = render(createElement(JourneyOutlet, { runtime: rt, instanceId: id }));

    expect(ui.getByTestId("review-order").textContent).toBe("O-99");

    act(() => {
      ui.getByTestId("review-pick").click();
    });
    expect(ui.queryByTestId("review-order")).toBeNull();
    expect(ui.getByTestId("verify-subject").textContent).toBe("O-99");

    act(() => {
      ui.getByTestId("verify-done").click();
    });
    expect(ui.queryByTestId("verify-subject")).toBeNull();
    expect(ui.getByTestId("confirm").textContent).toBe("O-99:T-O-99");
  });

  it("with leafOnly={false}, stays on the parent step even when a child is in flight", () => {
    const rt = buildRuntime();
    const id = rt.start(parentHandle, { orderId: "O-100" });
    const ui = render(
      createElement(JourneyOutlet, { runtime: rt, instanceId: id, leafOnly: false }),
    );
    act(() => {
      ui.getByTestId("review-pick").click();
    });
    expect(ui.queryByTestId("verify-subject")).toBeNull();
    expect(ui.getByTestId("review-order").textContent).toBe("O-100");
  });
});

// ---------------------------------------------------------------------------
// onFinished fires only for the root
// ---------------------------------------------------------------------------

describe("JourneyOutlet — onFinished binds to the root", () => {
  it("does NOT fire when the child terminates and the parent resumes", () => {
    const rt = buildRuntime();
    const id = rt.start(parentHandle, { orderId: "O-200" });
    const onFinished = vi.fn();
    const ui = render(createElement(JourneyOutlet, { runtime: rt, instanceId: id, onFinished }));
    act(() => {
      ui.getByTestId("review-pick").click();
    });
    act(() => {
      ui.getByTestId("verify-done").click();
    });
    // Parent has resumed and reached confirm — but is NOT terminal yet.
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("fires when the root itself reaches a terminal state", () => {
    // Use a journey that completes at the parent level after resume.
    const j = defineJourney<{ checkout: typeof parentMod }, ParentState>()({
      ...parentJourney,
      id: "checkout-completes",
      resumes: {
        checkout: {
          review: {
            afterVerify: ({ outcome }) =>
              outcome.status === "completed"
                ? { complete: { token: outcome.payload.token } }
                : { abort: { reason: "x" } },
          },
        },
      },
    });
    const rt = createJourneyRuntime(
      [
        { definition: j, options: undefined },
        { definition: childJourney, options: undefined },
      ],
      { modules: { checkout: parentMod, verifier: childMod }, debug: false },
    );
    const id = rt.start(defineJourneyHandle(j), { orderId: "O-300" });
    const onFinished = vi.fn();
    const ui = render(createElement(JourneyOutlet, { runtime: rt, instanceId: id, onFinished }));
    act(() => {
      ui.getByTestId("review-pick").click();
    });
    act(() => {
      ui.getByTestId("verify-done").click();
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
    const [call] = onFinished.mock.calls;
    expect(call?.[0].status).toBe("completed");
    expect(call?.[0].instanceId).toBe(id);
  });
});

// ---------------------------------------------------------------------------
// useJourneyCallStack
// ---------------------------------------------------------------------------

describe("useJourneyCallStack", () => {
  it("returns root-to-leaf instance ids and updates as the chain shifts", () => {
    const rt = buildRuntime();
    const id = rt.start(parentHandle, { orderId: "O-CS" });
    const observed: string[] = [];
    function Probe() {
      const chain = useJourneyCallStack(rt, id);
      observed.push(chain.join(">"));
      return null;
    }
    const ui = render(
      createElement(
        "div",
        null,
        createElement(Probe),
        createElement(JourneyOutlet, { runtime: rt, instanceId: id }),
      ),
    );
    expect(observed.at(-1)).toBe(id);

    act(() => {
      ui.getByTestId("review-pick").click();
    });
    const childId = rt.getInstance(id)!.activeChildId!;
    expect(observed.at(-1)).toBe(`${id}>${childId}`);

    act(() => {
      ui.getByTestId("verify-done").click();
    });
    // After the child resumes, chain collapses back to just the root.
    expect(observed.at(-1)).toBe(id);
  });
});

// ---------------------------------------------------------------------------
// Abandon-on-unmount cascades
// ---------------------------------------------------------------------------

describe("JourneyOutlet — abandon-on-unmount cascades to the active child", () => {
  it("ends both the parent and the child when the outlet unmounts mid-invoke", () =>
    new Promise<void>((resolve, reject) => {
      const rt = buildRuntime();
      const id = rt.start(parentHandle, { orderId: "O-UM" });
      const ui = render(createElement(JourneyOutlet, { runtime: rt, instanceId: id }));
      act(() => {
        ui.getByTestId("review-pick").click();
      });
      const childId = rt.getInstance(id)!.activeChildId!;
      ui.unmount();
      // Fail loudly instead of hanging if the deferred abandon never fires.
      const failTimer = setTimeout(
        () => reject(new Error("abandon microtask did not fire within 1s")),
        1000,
      );
      // Abandon is deferred by a microtask to survive StrictMode mount/unmount.
      queueMicrotask(() => {
        clearTimeout(failTimer);
        try {
          expect(rt.getInstance(id)!.status).toBe("aborted");
          expect(rt.getInstance(childId)!.status).toBe("aborted");
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }));
});
