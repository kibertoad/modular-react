import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import { defineJourney } from "@modular-frontend/journeys-engine";
// Import from the package barrel on purpose: this asserts the public
// `@modular-vue/testing` surface re-exports the framework-neutral simulator
// (PR-43), mirroring `@react-router-modules/testing`.
import { simulateJourney } from "./index.js";
import type { JourneySimulator } from "./index.js";

interface State {
  readonly name: string;
}

// Headless simulation still resolves step types against real module
// descriptors; the components are never rendered, so a `null` component is fine.
const profileModule = defineModule({
  id: "profile",
  version: "1.0.0",
  exitPoints: { save: defineExit<{ name: string }>() },
  entryPoints: {
    edit: defineEntry({ component: (() => null) as never, input: schema<{ name: string }>() }),
  },
});

const planModule = defineModule({
  id: "plan",
  version: "1.0.0",
  exitPoints: { finish: defineExit<{ name: string }>() },
  entryPoints: {
    choose: defineEntry({ component: (() => null) as never, input: schema<{ name: string }>() }),
  },
});

type Modules = { readonly profile: typeof profileModule; readonly plan: typeof planModule };

const journey = defineJourney<Modules, State>()({
  id: "onboarding",
  version: "1.0.0",
  initialState: (input: { name: string }) => ({ name: input.name }),
  start: (s) => ({ module: "profile", entry: "edit", input: { name: s.name } }),
  transitions: {
    profile: {
      edit: {
        save: ({ output }) => ({
          next: { module: "plan", entry: "choose", input: { name: output.name } },
        }),
      },
    },
    plan: {
      choose: {
        finish: ({ output }) => ({ complete: { name: output.name } }),
      },
    },
  },
});

describe("@modular-vue/testing re-exports simulateJourney (PR-43)", () => {
  it("exposes simulateJourney from the package barrel", () => {
    expect(typeof simulateJourney).toBe("function");
  });

  it("drives a journey headlessly to its terminal", () => {
    const sim: JourneySimulator<Modules, State> = simulateJourney(journey, { name: "Ada" });

    expect(sim.status).toBe("active");
    expect(sim.currentStep.moduleId).toBe("profile");

    sim.fireExit("save", { name: "Ada" });
    expect(sim.currentStep.moduleId).toBe("plan");

    sim.fireExit("finish", { name: "Ada" });
    expect(sim.status).toBe("completed");
    expect(sim.terminalPayload).toEqual({ name: "Ada" });
  });
});
