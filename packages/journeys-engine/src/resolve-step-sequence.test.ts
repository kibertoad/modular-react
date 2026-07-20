import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import { defineJourney } from "./define-journey.js";
import { defineTransition } from "./define-transition.js";
import { resolveStepSequence, resolveStepSequenceResult } from "./resolve-step-sequence.js";

// --- Modules -----------------------------------------------------------------

const profile = defineModule({
  id: "profile",
  version: "1.0.0",
  exitPoints: { done: defineExit() },
  entryPoints: {
    review: defineEntry({
      component: (() => null) as never,
      input: schema<{ readonly customerId: string }>(),
    }),
  },
});

const plan = defineModule({
  id: "plan",
  version: "1.0.0",
  exitPoints: { chosen: defineExit(), premium: defineExit() },
  entryPoints: {
    choose: defineEntry({ component: (() => null) as never, input: schema<{ readonly x: 1 }>() }),
    upsell: defineEntry({ component: (() => null) as never, input: schema<{ readonly x: 1 }>() }),
  },
});

const billing = defineModule({
  id: "billing",
  version: "1.0.0",
  exitPoints: { paid: defineExit() },
  entryPoints: {
    collect: defineEntry({ component: (() => null) as never, input: schema<{ readonly x: 1 }>() }),
  },
});

type Modules = {
  readonly profile: typeof profile;
  readonly plan: typeof plan;
  readonly billing: typeof billing;
};
interface State {
  readonly tier: string | null;
}

const transition = defineTransition<Modules, State>();

// --- A linear journey: profile → plan → billing → complete -------------------

const linear = defineJourney<Modules, State>()({
  id: "linear",
  version: "1.0.0",
  initialState: () => ({ tier: null }),
  start: () => ({ module: "profile", entry: "review", input: { customerId: "c1" } }),
  steps: {
    profile: { review: { path: "welcome", progressLabel: "Welcome" } },
    plan: { choose: { path: "plan", progressLabel: "Pick a plan" } },
    billing: { collect: { progressLabel: "Payment" } },
  },
  transitions: {
    profile: {
      review: {
        done: transition({
          targets: [{ module: "plan", entry: "choose" }],
          handle: () => ({ next: { module: "plan", entry: "choose", input: { x: 1 } } }),
        }),
      },
    },
    plan: {
      choose: {
        chosen: transition({
          targets: [{ module: "billing", entry: "collect" }],
          handle: () => ({ next: { module: "billing", entry: "collect", input: { x: 1 } } }),
        }),
      },
    },
    billing: {
      collect: {
        paid: transition({
          targets: ["complete"],
          handle: () => ({ complete: undefined }),
        }),
      },
    },
  },
});

describe("resolveStepSequence — linear flow", () => {
  it("walks the transition graph from start to the terminal step", () => {
    const seq = resolveStepSequence(linear);
    expect(seq.map((s) => `${s.module}/${s.entry}`)).toEqual([
      "profile/review",
      "plan/choose",
      "billing/collect",
    ]);
  });

  it("attaches per-step path / progressLabel from `steps`", () => {
    const seq = resolveStepSequence(linear);
    expect(seq).toEqual([
      { module: "profile", entry: "review", path: "welcome", progressLabel: "Welcome" },
      { module: "plan", entry: "choose", path: "plan", progressLabel: "Pick a plan" },
      { module: "billing", entry: "collect", progressLabel: "Payment" },
    ]);
  });

  it("yields a total suitable for 'Step X of N'", () => {
    expect(resolveStepSequence(linear).length).toBe(3);
  });

  it("honors an explicit `start` (resolve a sub-sequence mid-flow)", () => {
    const seq = resolveStepSequence(linear, { start: { module: "plan", entry: "choose" } });
    expect(seq.map((s) => `${s.module}/${s.entry}`)).toEqual(["plan/choose", "billing/collect"]);
  });
});

// --- A branching journey: plan.choose forks to billing OR plan.upsell --------

const branching = defineJourney<Modules, State>()({
  id: "branching",
  version: "1.0.0",
  initialState: () => ({ tier: null }),
  start: () => ({ module: "plan", entry: "choose", input: { x: 1 } }),
  transitions: {
    plan: {
      choose: {
        chosen: transition({
          targets: [{ module: "billing", entry: "collect" }],
          handle: () => ({ next: { module: "billing", entry: "collect", input: { x: 1 } } }),
        }),
        premium: transition({
          targets: [{ module: "plan", entry: "upsell" }],
          handle: () => ({ next: { module: "plan", entry: "upsell", input: { x: 1 } } }),
        }),
      },
      upsell: {
        chosen: transition({
          targets: [{ module: "billing", entry: "collect" }],
          handle: () => ({ next: { module: "billing", entry: "collect", input: { x: 1 } } }),
        }),
      },
    },
    billing: {
      collect: {
        paid: transition({ targets: ["complete"], handle: () => ({ complete: undefined }) }),
      },
    },
  },
});

describe("resolveStepSequence — branching flow", () => {
  it("stops at a fork when no branch resolver is supplied", () => {
    const seq = resolveStepSequence(branching);
    // `plan/choose` has two distinct forward targets — the walk cannot pick.
    expect(seq.map((s) => `${s.module}/${s.entry}`)).toEqual(["plan/choose"]);
  });

  it("follows the branch the resolver selects", () => {
    const upsellPath = resolveStepSequence(branching, {
      branch: ({ targets }) => targets.find((t) => t.entry === "upsell"),
    });
    expect(upsellPath.map((s) => `${s.module}/${s.entry}`)).toEqual([
      "plan/choose",
      "plan/upsell",
      "billing/collect",
    ]);

    const directPath = resolveStepSequence(branching, {
      branch: ({ targets }) => targets.find((t) => t.module === "billing"),
    });
    expect(directPath.map((s) => `${s.module}/${s.entry}`)).toEqual([
      "plan/choose",
      "billing/collect",
    ]);
  });

  it("stops the sequence when the resolver returns undefined", () => {
    const seq = resolveStepSequence(branching, { branch: () => undefined });
    expect(seq.map((s) => `${s.module}/${s.entry}`)).toEqual(["plan/choose"]);
  });

  it("stops the sequence when the resolver returns a ref that isn't a declared target", () => {
    const seq = resolveStepSequence(branching, {
      // A real journey step, but not one of this fork's targets (billing/collect
      // or plan/upsell) — so it is rejected rather than followed.
      branch: () => ({ module: "profile", entry: "review" }),
    });
    // The returned ref is matched back against the fork's `targets` by
    // module + entry; no match means the walk stops rather than following it.
    expect(seq.map((s) => `${s.module}/${s.entry}`)).toEqual(["plan/choose"]);
  });
});

// --- Edge cases --------------------------------------------------------------

describe("resolveStepSequence — edge cases", () => {
  it("stops at a step whose transitions are bare (unannotated) handlers", () => {
    const bare = defineJourney<Modules, State>()({
      id: "bare",
      version: "1.0.0",
      initialState: () => ({ tier: null }),
      start: () => ({ module: "profile", entry: "review", input: { customerId: "c1" } }),
      transitions: {
        profile: {
          review: {
            // Bare function — no `targets`, so no statically-known next step.
            done: () => ({ next: { module: "plan", entry: "choose", input: { x: 1 } } }),
          },
        },
      },
    });
    expect(resolveStepSequence(bare).map((s) => s.module)).toEqual(["profile"]);
  });

  it("breaks a cycle instead of looping forever", () => {
    const cyclic = defineJourney<Modules, State>()({
      id: "cyclic",
      version: "1.0.0",
      initialState: () => ({ tier: null }),
      start: () => ({ module: "plan", entry: "choose", input: { x: 1 } }),
      transitions: {
        plan: {
          choose: {
            chosen: transition({
              targets: [{ module: "plan", entry: "upsell" }],
              handle: () => ({ next: { module: "plan", entry: "upsell", input: { x: 1 } } }),
            }),
          },
          upsell: {
            chosen: transition({
              targets: [{ module: "plan", entry: "choose" }],
              handle: () => ({ next: { module: "plan", entry: "choose", input: { x: 1 } } }),
            }),
          },
        },
      },
    });
    const seq = resolveStepSequence(cyclic);
    expect(seq.map((s) => `${s.module}/${s.entry}`)).toEqual(["plan/choose", "plan/upsell"]);
  });

  it("respects maxSteps", () => {
    expect(resolveStepSequence(linear, { maxSteps: 2 }).length).toBe(2);
  });
});

// --- resolveStepSequenceResult: `complete` (partial vs. full spine) ----------

describe("resolveStepSequenceResult — completeness", () => {
  it("is complete when the walk reaches a genuine terminal step", () => {
    const result = resolveStepSequenceResult(linear);
    expect(result.complete).toBe(true);
    expect(result.steps.map((s) => `${s.module}/${s.entry}`)).toEqual([
      "profile/review",
      "plan/choose",
      "billing/collect",
    ]);
  });

  it("is incomplete at an unresolved fork (no branch resolver)", () => {
    expect(resolveStepSequenceResult(branching).complete).toBe(false);
  });

  it("is complete again once a branch resolver linearizes the fork to a terminal", () => {
    const result = resolveStepSequenceResult(branching, {
      branch: ({ targets }) => targets.find((t) => t.module === "billing"),
    });
    expect(result.complete).toBe(true);
  });

  it("is incomplete when the branch resolver stops the walk", () => {
    expect(resolveStepSequenceResult(branching, { branch: () => undefined }).complete).toBe(false);
  });

  it("is incomplete at a bare (unannotated) handler — the next step is unknown", () => {
    const bare = defineJourney<Modules, State>()({
      id: "bare-complete",
      version: "1.0.0",
      initialState: () => ({ tier: null }),
      start: () => ({ module: "profile", entry: "review", input: { customerId: "c1" } }),
      transitions: {
        profile: {
          review: {
            done: () => ({ next: { module: "plan", entry: "choose", input: { x: 1 } } }),
          },
        },
      },
    });
    const result = resolveStepSequenceResult(bare);
    expect(result.complete).toBe(false);
    expect(result.steps.map((s) => s.module)).toEqual(["profile"]);
  });

  it("is incomplete when the walk breaks a cycle", () => {
    const cyclic = defineJourney<Modules, State>()({
      id: "cyclic-complete",
      version: "1.0.0",
      initialState: () => ({ tier: null }),
      start: () => ({ module: "plan", entry: "choose", input: { x: 1 } }),
      transitions: {
        plan: {
          choose: {
            chosen: transition({
              targets: [{ module: "plan", entry: "upsell" }],
              handle: () => ({ next: { module: "plan", entry: "upsell", input: { x: 1 } } }),
            }),
          },
          upsell: {
            chosen: transition({
              targets: [{ module: "plan", entry: "choose" }],
              handle: () => ({ next: { module: "plan", entry: "choose", input: { x: 1 } } }),
            }),
          },
        },
      },
    });
    expect(resolveStepSequenceResult(cyclic).complete).toBe(false);
  });

  it("is incomplete when cut short by maxSteps", () => {
    expect(resolveStepSequenceResult(linear, { maxSteps: 2 }).complete).toBe(false);
  });
});
