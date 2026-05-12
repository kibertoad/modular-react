import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";

import { defineJourney } from "./define-journey.js";
import { simulateJourney } from "./simulate-journey.js";

interface FormState {
  readonly draftName: string;
  readonly draftEmail: string;
}

interface NameInput {
  readonly previousName: string;
}
interface EmailInput {
  readonly previousEmail: string;
}

const stepExits = {
  next: defineExit<{ name?: string; email?: string }>(),
  back: defineExit(),
} as const;

const nameModule = defineModule({
  id: "name",
  version: "1.0.0",
  exitPoints: stepExits,
  entryPoints: {
    enter: defineEntry({
      component: (() => null) as never,
      input: schema<NameInput>(),
      allowBack: "preserve-state",
      buildInput: (state: FormState) => ({ previousName: state.draftName }),
    }),
  },
});

const emailModule = defineModule({
  id: "email",
  version: "1.0.0",
  exitPoints: stepExits,
  entryPoints: {
    enter: defineEntry({
      component: (() => null) as never,
      input: schema<EmailInput>(),
      allowBack: "preserve-state",
      buildInput: (state: FormState) => ({ previousEmail: state.draftEmail }),
    }),
  },
});

type Modules = { readonly name: typeof nameModule; readonly email: typeof emailModule };

const journey = defineJourney<Modules, FormState>()({
  id: "form",
  version: "1.0.0",
  initialState: () => ({ draftName: "", draftEmail: "" }),
  start: (state) => ({
    module: "name",
    entry: "enter",
    // The handler-supplied input is ignored at runtime because the entry
    // declares `buildInput` — but it still has to be present to satisfy
    // the `StepSpec` shape. Stamping it as `{ previousName: "" }` mirrors
    // what authors actually write at the call site.
    input: { previousName: state.draftName },
  }),
  transitions: {
    name: {
      enter: {
        allowBack: true,
        next: ({ state, output }) => ({
          state: { ...state, draftName: output.name ?? state.draftName },
          next: { module: "email", entry: "enter", input: { previousEmail: "" } },
        }),
      },
    },
    email: {
      enter: {
        allowBack: true,
        next: ({ state, output }) => ({
          state: { ...state, draftEmail: output.email ?? state.draftEmail },
          complete: undefined,
        }),
      },
    },
  },
});

describe("defineEntry({ buildInput })", () => {
  it("derives the initial step's input from journey state instead of the handler-supplied value", () => {
    const sim = simulateJourney(journey, undefined, {
      modules: { name: nameModule, email: emailModule },
    });
    // `buildInput` ran on initial start — and the journey's initial state
    // is empty, so previousName is "".
    expect(sim.currentStep).toEqual({
      moduleId: "name",
      entry: "enter",
      input: { previousName: "" },
    });
  });

  it("rebuilds input from state when navigating back", () => {
    const sim = simulateJourney(journey, undefined, {
      modules: { name: nameModule, email: emailModule },
    });

    sim.fireExit("next", { name: "Ada" });
    expect(sim.currentStep.moduleId).toBe("email");
    expect(sim.currentStep.input).toEqual({ previousEmail: "" });

    sim.goBack();
    // The name step is re-entered. Without buildInput, `input.previousName`
    // would be the empty string captured at first push. With buildInput,
    // it reflects the accumulated draftName.
    expect(sim.currentStep.moduleId).toBe("name");
    expect(sim.currentStep.input).toEqual({ previousName: "Ada" });
  });
});
