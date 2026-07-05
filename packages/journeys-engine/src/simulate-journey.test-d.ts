import { describe, expectTypeOf, test } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import { defineJourney } from "./define-journey.js";
import { simulateJourney, type JourneySimulator } from "./simulate-journey.js";

const exits = { pick: defineExit<{ pick: "a" | "b" }>() } as const;
const mod = defineModule({
  id: "menu",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    choose: defineEntry({
      component: (() => null) as never,
      input: schema<void>(),
    }),
  },
});

type Modules = { readonly menu: typeof mod };

interface WithInput {
  readonly id: string;
}

// Journey with explicit input.
const inputJourney = defineJourney<Modules, { visits: number }>()({
  id: "with-input",
  version: "1.0.0",
  initialState: (_: WithInput) => ({ visits: 0 }),
  start: () => ({ module: "menu", entry: "choose", input: undefined }),
  transitions: {},
});

// Journey with no input (TInput = void by default, inferred from zero-arg
// initialState).
const voidJourney = defineJourney<Modules, { visits: number }>()({
  id: "no-input",
  version: "1.0.0",
  initialState: () => ({ visits: 0 }),
  start: () => ({ module: "menu", entry: "choose", input: undefined }),
  transitions: {},
});

describe("simulateJourney — input ergonomics", () => {
  test("void-input journeys compose without passing a second argument", () => {
    // The cast-heavy `undefined as unknown as void` pattern from the old
    // signature is no longer necessary.
    const sim = simulateJourney(voidJourney);
    expectTypeOf(sim).toExtend<JourneySimulator<Modules, { visits: number }>>();
  });

  test("input journeys require a typed second argument", () => {
    const sim = simulateJourney(inputJourney, { id: "x" });
    expectTypeOf(sim).toExtend<JourneySimulator<Modules, { visits: number }>>();

    // @ts-expect-error — `id` is required on WithInput.
    simulateJourney(inputJourney, {});

    // @ts-expect-error — wrong field type.
    simulateJourney(inputJourney, { id: 123 });

    // @ts-expect-error — missing input entirely.
    simulateJourney(inputJourney);
  });
});

// -----------------------------------------------------------------------------
// #5 — `simulateJourney`'s fourth generic flows `TOutput` so a journey with a
// concrete terminal payload type is assignable without a cast.
// -----------------------------------------------------------------------------

interface CompletedOutput {
  readonly token: string;
}

const typedOutputJourney = defineJourney<Modules, { visits: number }, CompletedOutput>()({
  id: "typed-output",
  version: "1.0.0",
  initialState: () => ({ visits: 0 }),
  start: () => ({ module: "menu", entry: "choose", input: undefined }),
  transitions: {
    menu: {
      choose: {
        pick: ({ output }) =>
          output.pick === "a" ? { complete: { token: "alpha" } } : { complete: { token: "bravo" } },
      },
    },
  },
});

describe("simulateJourney — TOutput", () => {
  test("a journey with a typed TOutput is assignable to simulateJourney without casts", () => {
    // Before #5: this required `as unknown as Parameters<typeof simulateJourney>[0]`
    // because the dropped `TOutput` made the journey contravariantly
    // incompatible with the simulator's `unknown`-output signature.
    const sim = simulateJourney(typedOutputJourney);
    expectTypeOf(sim).toExtend<JourneySimulator<Modules, { visits: number }>>();
  });
});

// -----------------------------------------------------------------------------
// #6 — `sim.step.input` is the per-entry input type when narrowed by
// `step.moduleId` + `step.entry`, instead of `unknown`.
// -----------------------------------------------------------------------------

const profileExits = { saved: defineExit() } as const;
const profileMod = defineModule({
  id: "profile",
  version: "1.0.0",
  exitPoints: profileExits,
  entryPoints: {
    edit: defineEntry({
      component: (() => null) as never,
      input: schema<{ readonly customerId: string }>(),
    }),
    review: defineEntry({
      component: (() => null) as never,
      input: schema<{ readonly draftId: number }>(),
    }),
  },
});

type ProfileModules = { readonly profile: typeof profileMod };

const profileJourney = defineJourney<ProfileModules, { stage: string }>()({
  id: "profile-flow",
  version: "1.0.0",
  initialState: () => ({ stage: "edit" }),
  start: () => ({ module: "profile", entry: "edit", input: { customerId: "c-1" } }),
  transitions: {},
});

describe("simulateJourney — JourneyStepFor narrows input by entry", () => {
  test("narrowing on step.entry surfaces the per-entry input type", () => {
    const sim = simulateJourney(profileJourney);
    const step = sim.currentStep;
    if (step.moduleId === "profile" && step.entry === "edit") {
      // Before #6: `step.input` was `unknown` and the cast through
      // `Record<string, unknown>` lived in the test suite.
      expectTypeOf(step.input).toEqualTypeOf<{ readonly customerId: string }>();
    }
    if (step.moduleId === "profile" && step.entry === "review") {
      expectTypeOf(step.input).toEqualTypeOf<{ readonly draftId: number }>();
    }
  });
});
