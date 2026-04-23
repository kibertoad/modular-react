import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
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
    const sim = simulateJourney(journey, undefined as unknown as void);
    expect(sim.step).toEqual({ moduleId: "menu", entry: "choose", input: undefined });

    sim.fireExit("pick", { pick: "a" });
    sim.fireExit("pick", { pick: "a" });
    expect(sim.state.selections).toEqual(["a", "a"]);

    sim.fireExit("pick", { pick: "b" });
    expect(sim.status).toBe("completed");
    expect(sim.step).toBeNull();
  });

  it("records every transition event the runtime fires on `sim.transitions`", () => {
    const sim = simulateJourney(journey, undefined as unknown as void);
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
});
