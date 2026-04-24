// Type-level regression tests. Runs through both `tsc --noEmit` (package's
// typecheck script) AND vitest's typecheck pass (`vitest.config.ts`
// enables `test.typecheck` for `*.test-d.ts`), so the assertions below
// fail the test suite when types drift.
//
// The point: prove that `runtime.start(handle, input)` rejects wrongly-typed
// `input` at compile time — the Phase 4a invariant. Covered by both the
// `@ts-expect-error` directives and the explicit `expectTypeOf` checks.

import { expectTypeOf, test } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { InstanceId } from "./types.js";
import { defineJourney } from "./define-journey.js";
import { defineJourneyHandle, type JourneyHandle } from "./handle.js";
import { createJourneyRuntime } from "./runtime.js";

const exits = {
  finish: defineExit<{ amount: number }>(),
} as const;

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
interface Input {
  readonly customerId: string;
}

const journey = defineJourney<Modules, Input>()({
  id: "demo",
  version: "1.0.0",
  initialState: (input: Input) => ({ customerId: input.customerId }),
  start: (s) => ({ module: "m", entry: "step", input: { id: s.customerId } }),
  transitions: {
    m: {
      step: {
        finish: ({ output }) => ({ complete: { amount: output.amount } }),
      },
    },
  },
});

const handle = defineJourneyHandle(journey);
const rt = createJourneyRuntime([{ definition: journey, options: undefined }], {
  modules: { m: mod },
  debug: false,
});

// Baseline — the correct shape compiles.
rt.start(handle, { customerId: "C-1" });

// Wrong property name — TS must flag.
// @ts-expect-error — `id` is not `customerId`
rt.start(handle, { id: "C-1" });

// Wrong property type — TS must flag.
// @ts-expect-error — `customerId` must be string, not number
rt.start(handle, { customerId: 42 });

// Missing required property — TS must flag.
// @ts-expect-error — empty object is missing `customerId`
rt.start(handle, {});

// Extra property with otherwise-matching shape — allowed. The phantom TInput
// is structural, so excess-property checks apply only to object literals on
// direct call; widening through a variable drops them. No @ts-expect-error
// because this one legitimately compiles.
const wider = { customerId: "C-2", extra: true };
rt.start(handle, wider);

// String-id form is intentionally loose — second arg is `unknown` in the
// overload, so this compiles. We're documenting, not enforcing.
rt.start("demo", { anything: "goes" });

// ---- expectTypeOf assertions ---------------------------------------------

test("defineJourneyHandle preserves the phantom TInput slot", () => {
  expectTypeOf(handle).toExtend<JourneyHandle<string, Input>>();
  // The handle carries `TInput` via the phantom `__input` field; runtime
  // identity is just `{ id }` so the phantom stays optional.
  expectTypeOf(handle.id).toEqualTypeOf<string>();
});

test("runtime.start(handle, input) returns an InstanceId", () => {
  expectTypeOf(rt.start(handle, { customerId: "C-T" })).toEqualTypeOf<InstanceId>();
});
