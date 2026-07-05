import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import { defineJourney } from "./define-journey.js";
import { simulateJourney } from "./simulate-journey.js";

const exits = {
  pick: defineExit<{ pick: "a" | "b" }>(),
} as const;

const module = defineModule({
  id: "menu",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    choose: defineEntry({
      component: (() => null) as any,
      input: schema<void>(),
    }),
  },
});

type Modules = { readonly menu: typeof module };

const journey = defineJourney<Modules, { selections: string[] }>()({
  id: "pick",
  version: "1.0.0",
  initialState: () => ({ selections: [] }),
  start: () => ({ module: "menu", entry: "choose", input: undefined }),
  transitions: {
    menu: {
      choose: {
        pick: ({ output, state }) =>
          output.pick === "a"
            ? {
                state: { selections: [...state.selections, "a"] },
                next: { module: "menu", entry: "choose", input: undefined },
              }
            : { complete: { chosen: "b" } },
      },
    },
  },
});

describe("simulateJourney", () => {
  it("drives transitions headlessly and exposes state", () => {
    const sim = simulateJourney(journey);
    expect(sim.currentStep).toEqual({ moduleId: "menu", entry: "choose", input: undefined });

    sim.fireExit("pick", { pick: "a" });
    sim.fireExit("pick", { pick: "a" });
    expect(sim.state.selections).toEqual(["a", "a"]);

    sim.fireExit("pick", { pick: "b" });
    expect(sim.status).toBe("completed");
    expect(sim.step).toBeNull();
  });

  it("`currentStep` throws once the journey terminates, with the status in the message", () => {
    const sim = simulateJourney(journey);
    sim.fireExit("pick", { pick: "b" });
    expect(sim.status).toBe("completed");
    expect(() => sim.currentStep).toThrow(/status=completed/);
  });

  it("records every transition event the runtime fires on `sim.transitions`", () => {
    const sim = simulateJourney(journey);
    // Initial transition — start step — is already recorded.
    expect(sim.transitions).toHaveLength(1);
    expect(sim.transitions[0]!.from).toBeNull();
    expect(sim.transitions[0]!.to).toEqual({
      moduleId: "menu",
      entry: "choose",
      input: undefined,
    });

    sim.fireExit("pick", { pick: "a" });
    sim.fireExit("pick", { pick: "b" });
    // Start + two hops (including the terminal one).
    expect(sim.transitions).toHaveLength(3);
    expect(sim.transitions.at(-1)!.to).toBeNull();
    expect(sim.transitions.at(-1)!.exit).toBe("pick");
  });

  it("exposes terminalPayload and a persistence-shaped serialize()", () => {
    const sim = simulateJourney(journey);
    expect(sim.terminalPayload).toBeUndefined();
    const beforeBlob = sim.serialize();
    expect(beforeBlob.status).toBe("active");
    expect(beforeBlob.step).toEqual({ moduleId: "menu", entry: "choose", input: undefined });

    sim.fireExit("pick", { pick: "b" });

    expect(sim.terminalPayload).toEqual({ chosen: "b" });
    const after = sim.serialize();
    expect(after.status).toBe("completed");
    expect(after.step).toBeNull();
    expect(after.terminalPayload).toEqual({ chosen: "b" });
  });

  it("snapshots TransitionEvent.history so later mutations don't leak back", () => {
    const sim = simulateJourney(journey);
    sim.fireExit("pick", { pick: "a" });
    const secondEvent = sim.transitions.at(-1)!;
    const historyLengthAtEmit = secondEvent.history.length;
    // Advancing further grows the runtime's internal history. The captured
    // event must still reflect the history as it was when it fired.
    sim.fireExit("pick", { pick: "a" });
    sim.fireExit("pick", { pick: "b" });
    expect(secondEvent.history.length).toBe(historyLengthAtEmit);
  });

  it("goForward is a no-op when the future stack is empty", () => {
    // Matches the documented contract on JourneySimulator (and the
    // public `runtime.goForward`). The harness throws in this case
    // — the simulator must not propagate that.
    const sim = simulateJourney(journey);
    expect(() => sim.goForward()).not.toThrow();
    expect(sim.currentStep).toEqual({ moduleId: "menu", entry: "choose", input: undefined });
  });

  it("goBack + goForward round-trips through the future stack", () => {
    const exits2 = { next: defineExit() } as const;
    const a = defineModule({
      id: "a",
      version: "1.0.0",
      exitPoints: exits2,
      entryPoints: {
        show: defineEntry({
          component: (() => null) as any,
          input: schema<void>(),
          allowBack: "preserve-state",
        }),
      },
    });
    const b = defineModule({
      id: "b",
      version: "1.0.0",
      exitPoints: exits2,
      entryPoints: {
        show: defineEntry({
          component: (() => null) as any,
          input: schema<void>(),
          allowBack: "preserve-state",
        }),
      },
    });
    type M = { readonly a: typeof a; readonly b: typeof b };
    const twoStep = defineJourney<M, Record<string, never>>()({
      id: "two-step-sim",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "a", entry: "show", input: undefined }),
      transitions: {
        a: {
          show: {
            next: () => ({ next: { module: "b", entry: "show", input: undefined } }),
          },
        },
        b: { show: { allowBack: true, next: () => ({ complete: undefined }) } },
      },
    });

    const sim = simulateJourney(twoStep);
    sim.fireExit("next");
    expect(sim.currentStep.moduleId).toBe("b");

    sim.goBack();
    expect(sim.currentStep.moduleId).toBe("a");

    sim.goForward();
    expect(sim.currentStep.moduleId).toBe("b");
  });
});
