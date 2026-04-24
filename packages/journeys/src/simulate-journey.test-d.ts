import { describe, expectTypeOf, test } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
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
