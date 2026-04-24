import { describe, expectTypeOf, test } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { defineJourneyHandle } from "./handle.js";
import { createJourneyRuntime } from "./runtime.js";
import type { InstanceId } from "./types.js";

const exits = { finish: defineExit<{ amount: number }>() } as const;

const mod = defineModule({
  id: "m",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    step: defineEntry({
      component: (() => null) as never,
      input: schema<{ id: string }>(),
    }),
  },
});

type Modules = { readonly m: typeof mod };

interface WithInput {
  readonly customerId: string;
}

const inputJourney = defineJourney<Modules, { customerId: string }>()({
  id: "with-input",
  version: "1.0.0",
  initialState: (input: WithInput) => ({ customerId: input.customerId }),
  start: (s) => ({ module: "m", entry: "step", input: { id: s.customerId } }),
  transitions: {
    m: { step: { finish: ({ output }) => ({ complete: { amount: output.amount } }) } },
  },
});

const voidJourney = defineJourney<Modules, { count: number }>()({
  id: "void-input",
  version: "1.0.0",
  initialState: () => ({ count: 0 }),
  start: (s) => ({ module: "m", entry: "step", input: { id: `anon-${s.count}` } }),
  transitions: {
    m: { step: { finish: ({ output }) => ({ complete: { amount: output.amount } }) } },
  },
});

const rt = createJourneyRuntime(
  [
    { definition: inputJourney, options: undefined },
    { definition: voidJourney, options: undefined },
  ],
  { modules: { m: mod }, debug: false },
);

const inputHandle = defineJourneyHandle(inputJourney);
const voidHandle = defineJourneyHandle(voidJourney);

describe("JourneyRuntime.start — typed handle form", () => {
  test("returns an InstanceId", () => {
    expectTypeOf(rt.start(inputHandle, { customerId: "C" })).toEqualTypeOf<InstanceId>();
  });

  test("rejects wrong-shape input", () => {
    // @ts-expect-error — property name.
    rt.start(inputHandle, { id: "C" });

    // @ts-expect-error — field type.
    rt.start(inputHandle, { customerId: 1 });

    // @ts-expect-error — missing required field.
    rt.start(inputHandle, {});

    // Baseline compiles.
    rt.start(inputHandle, { customerId: "ok" });
  });

  test("void-input handles can be started without a second argument", () => {
    // Part of the rest-tuple fix — handle form with TInput extending void
    // should compose without a manual `undefined`.
    expectTypeOf(rt.start(voidHandle)).toEqualTypeOf<InstanceId>();
    // An explicit `undefined` still compiles.
    expectTypeOf(rt.start(voidHandle, undefined)).toEqualTypeOf<InstanceId>();
  });

  test("string-id form stays loose — input is `unknown`", () => {
    // By design: once you drop the handle you give up the type guarantee.
    expectTypeOf(rt.start("anything", { literally: "anything" })).toEqualTypeOf<InstanceId>();
  });
});
