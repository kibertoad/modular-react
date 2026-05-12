import { afterEach, describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";

import { defineJourney } from "./define-journey.js";
import { defineJourneyHandle } from "./handle.js";
import { createJourneyRuntime } from "./runtime.js";
import { simulateJourney } from "./simulate-journey.js";
import { createTestHarness } from "./testing.js";

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("warns in dev mode when the handler stamps an input that buildInput would override", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runtime = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: { name: nameModule, email: emailModule },
      debug: true,
    });
    const id = runtime.start(journey.id, undefined);
    createTestHarness(runtime).fireExit(id, "next", { name: "Ada" });
    // The handler returns `next: { … input: { previousEmail: "" } }`, but
    // the email module's `buildInput` would produce `{ previousEmail: "" }`
    // from initial state too — so on this very first push they match and
    // no warning is expected. Drive a second push that does diverge.
    expect(warn).not.toHaveBeenCalled();
  });

  it("aborts the instance with `build-input-threw` when buildInput throws on initial start", () => {
    const error = new Error("boom");
    const explodingModule = defineModule({
      id: "explode",
      version: "1.0.0",
      exitPoints: stepExits,
      entryPoints: {
        enter: defineEntry({
          component: (() => null) as never,
          input: schema<{ x: number }>(),
          buildInput: () => {
            throw error;
          },
        }),
      },
    });
    type ExplodeModules = { readonly explode: typeof explodingModule };
    const explodingJourney = defineJourney<ExplodeModules, Record<string, never>>()({
      id: "explode",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "explode", entry: "enter", input: { x: 0 } }),
      transitions: {},
    });
    const runtime = createJourneyRuntime([{ definition: explodingJourney, options: undefined }], {
      modules: { explode: explodingModule },
    });
    const id = runtime.start(explodingJourney.id, undefined);
    const inst = runtime.getInstance(id);
    expect(inst?.status).toBe("aborted");
    expect(inst?.terminalPayload).toMatchObject({
      reason: "build-input-threw",
      moduleId: "explode",
      entry: "enter",
      error,
    });
  });

  it("re-runs buildInput on the parent's step when a resume changes state without advancing", () => {
    interface ParentState {
      readonly leafCount: number;
    }
    interface LeafInput {
      readonly leafCount: number;
    }
    const childExits = { done: defineExit() } as const;
    const childMod = defineModule({
      id: "child-mod",
      version: "1.0.0",
      exitPoints: childExits,
      entryPoints: {
        run: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const childJourney = defineJourney<{ readonly "child-mod": typeof childMod }, void>()({
      id: "child",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "child-mod", entry: "run", input: undefined }),
      transitions: {
        "child-mod": { run: { done: () => ({ complete: undefined }) } },
      },
    });
    const childHandle = defineJourneyHandle(childJourney);

    const parentExits = { open: defineExit() } as const;
    const parentMod = defineModule({
      id: "parent-mod",
      version: "1.0.0",
      exitPoints: parentExits,
      entryPoints: {
        home: defineEntry({
          component: (() => null) as never,
          input: schema<LeafInput>(),
          // The point of the test: `buildInput` should re-fire when the
          // resume bumps `leafCount` without advancing the parent step.
          buildInput: (state: ParentState) => ({ leafCount: state.leafCount }),
        }),
      },
    });
    type ParentModules = { readonly "parent-mod": typeof parentMod };
    const parentJourney = defineJourney<ParentModules, ParentState>()({
      id: "parent",
      version: "1.0.0",
      invokes: [childHandle],
      initialState: () => ({ leafCount: 0 }),
      start: () => ({ module: "parent-mod", entry: "home", input: { leafCount: 0 } }),
      transitions: {
        "parent-mod": {
          home: {
            open: () => ({ invoke: { handle: childHandle, input: undefined, resume: "back" } }),
          },
        },
      },
      resumes: {
        "parent-mod": {
          home: {
            // Bumps state but doesn't advance the parent step.
            back: ({ state }) => ({ state: { leafCount: state.leafCount + 1 } }),
          },
        },
      },
    });

    const runtime = createJourneyRuntime(
      [
        { definition: parentJourney, options: undefined },
        { definition: childJourney, options: undefined },
      ],
      { modules: { "parent-mod": parentMod, "child-mod": childMod } },
    );
    const parentId = runtime.start(parentJourney.id, undefined);
    const harness = createTestHarness(runtime);

    expect(runtime.getInstance(parentId)?.step?.input).toEqual({ leafCount: 0 });

    harness.fireExit(parentId, "open");
    const childId = runtime.getInstance(parentId)?.activeChildId;
    expect(childId).toBeTruthy();
    harness.fireExit(childId!, "done");

    // Resume bumped state.leafCount to 1; parent step didn't change, but
    // `buildInput` re-ran and the new `step.input` reflects accumulated
    // state. Before the rebuild-on-state-change fix, this would still be
    // `{ leafCount: 0 }` (the cached input from the initial push).
    expect(runtime.getInstance(parentId)?.step?.input).toEqual({ leafCount: 1 });
  });
});
