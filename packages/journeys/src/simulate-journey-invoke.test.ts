// Simulator-level tests for invoke/resume — both modes:
//   1. Drive the real child sub-simulator end-to-end.
//   2. Mock the child's terminal outcome (completeChild / abortChild)
//      to unit-test the parent's resume handler in isolation.

import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { defineJourneyHandle } from "./handle.js";
import { simulateJourney } from "./simulate-journey.js";

const childExits = {
  done: defineExit<{ token: string }>(),
  failed: defineExit<{ code: string }>(),
} as const;
const childMod = defineModule({
  id: "verifier",
  version: "1.0.0",
  exitPoints: childExits,
  entryPoints: {
    review: defineEntry({
      component: (() => null) as never,
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
      review: {
        done: ({ output }) => ({ complete: { token: output.token } }),
        failed: ({ output }) => ({ abort: { code: output.code } }),
      },
    },
  },
});
const childHandle = defineJourneyHandle(childJourney);

const parentExits = { pickPlan: defineExit() } as const;
const parentMod = defineModule({
  id: "checkout",
  version: "1.0.0",
  exitPoints: parentExits,
  entryPoints: {
    review: defineEntry({
      component: (() => null) as never,
      input: schema<{ orderId: string }>(),
    }),
    confirm: defineEntry({
      component: (() => null) as never,
      input: schema<{ orderId: string; token: string }>(),
    }),
  },
});

interface ParentState {
  readonly orderId: string;
  readonly token: string | null;
  readonly aborted?: { readonly code: string };
}

const parentJourney = defineJourney<{ checkout: typeof parentMod }, ParentState>()({
  id: "checkout",
  version: "1.0.0",
  initialState: (input: { orderId: string }) => ({ orderId: input.orderId, token: null }),
  start: (s) => ({ module: "checkout", entry: "review", input: { orderId: s.orderId } }),
  transitions: {
    checkout: {
      review: {
        pickPlan: ({ state }) => ({
          invoke: {
            handle: childHandle,
            input: { subject: state.orderId },
            resume: "afterVerify",
          },
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
            : {
                state: {
                  ...state,
                  aborted: { code: String((outcome.reason as { code?: string })?.code ?? "x") },
                },
                abort: { reason: "verify-aborted" },
              },
      },
    },
  },
});

describe("simulateJourney — invoke/resume", () => {
  it("requires children to be registered explicitly via options.children", () => {
    // No children registered → invoke fails with the documented abort.
    const sim = simulateJourney(parentJourney, { orderId: "O-1" });
    sim.fireExit("pickPlan");
    expect(sim.status).toBe("aborted");
    expect((sim.terminalPayload as { reason: string }).reason).toBe("invoke-unknown-journey");
  });

  it("drives a real child sub-sim end-to-end and resumes the parent", () => {
    const sim = simulateJourney(parentJourney, { orderId: "O-2" }, { children: [childJourney] });
    expect(sim.activeChildId).toBeNull();
    sim.fireExit("pickPlan");
    expect(sim.activeChildId).not.toBeNull();

    const child = sim.activeChild!;
    expect(child).not.toBeNull();
    expect(child.currentStep).toEqual({
      moduleId: "verifier",
      entry: "review",
      input: { subject: "O-2" },
    });

    child.fireExit("done", { token: "T-A" });

    expect(sim.activeChildId).toBeNull();
    expect(sim.state.token).toBe("T-A");
    expect(sim.currentStep.entry).toBe("confirm");
  });

  it("propagates child abort through the parent's resume handler", () => {
    const sim = simulateJourney(parentJourney, { orderId: "O-3" }, { children: [childJourney] });
    sim.fireExit("pickPlan");
    sim.activeChild!.fireExit("failed", { code: "denied" });
    expect(sim.status).toBe("aborted");
    expect(sim.state.aborted).toEqual({ code: "denied" });
  });

  it("completeChild() synthesizes the child's terminal without enumerating its steps", () => {
    const sim = simulateJourney(parentJourney, { orderId: "O-4" }, { children: [childJourney] });
    sim.fireExit("pickPlan");
    expect(sim.activeChildId).not.toBeNull();

    sim.completeChild({ token: "T-MOCK" });

    expect(sim.activeChildId).toBeNull();
    expect(sim.state.token).toBe("T-MOCK");
    expect(sim.currentStep.entry).toBe("confirm");
  });

  it("abortChild() drives the child to aborted via the runtime's normal end path", () => {
    const sim = simulateJourney(parentJourney, { orderId: "O-5" }, { children: [childJourney] });
    sim.fireExit("pickPlan");
    sim.abortChild({ code: "timeout" });
    expect(sim.status).toBe("aborted");
    // `runtime.end` wraps the supplied reason inside its default-abort
    // `{ reason }` shape, so the parent's `outcome.reason` here is
    // `{ reason: { code: "timeout" } }` — one level deeper than what a
    // child's own `{ abort: { code: ... } }` transition would produce.
    // The parent's handler reads `outcome.reason.code` which is therefore
    // undefined and falls back to "x". Test pins this current behavior;
    // a more ergonomic invariant would have abortChild bypass the wrap,
    // but doing so would diverge from real `runtime.end` semantics that
    // shells observe in production.
    expect(sim.state.aborted).toEqual({ code: "x" });
  });

  it("completeChild / abortChild throw when no child is in flight", () => {
    const sim = simulateJourney(parentJourney, { orderId: "O-6" }, { children: [childJourney] });
    expect(() => sim.completeChild({ token: "x" })).toThrow(/no child is in flight/);
    expect(() => sim.abortChild()).toThrow(/no child is in flight/);
  });

  it("tags TransitionEvent.kind so telemetry can distinguish step / invoke / resume hops", () => {
    const sim = simulateJourney(parentJourney, { orderId: "O-K" }, { children: [childJourney] });
    sim.fireExit("pickPlan");
    sim.activeChild!.fireExit("done", { token: "T-K" });
    expect(sim.status).toBe("active");

    const eventsForParent = sim.transitions.filter((ev) => ev.journeyId === "checkout");
    // Expected sequence on the parent:
    //   1. step (initial step on start)
    //   2. invoke (parent fires `pickPlan`, transitions to invoke)
    //   3. resume (child completes, parent's afterVerify resumes into "confirm")
    expect(eventsForParent.map((ev) => ev.kind)).toEqual(["step", "invoke", "resume"]);

    const invokeEv = eventsForParent.find((ev) => ev.kind === "invoke")!;
    expect(invokeEv.child?.journeyId).toBe("verify");

    const resumeEv = eventsForParent.find((ev) => ev.kind === "resume")!;
    expect(resumeEv.resume).toBe("afterVerify");
    expect(resumeEv.outcome).toEqual({ status: "completed", payload: { token: "T-K" } });
  });
});
