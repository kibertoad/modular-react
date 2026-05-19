/**
 * Type-level coverage for the symmetric `mountKinds` filter on the
 * journey side. Mirrors `mount-kinds.test-d.ts` in `@modular-react/
 * compositions` — `StepSpec` filters out entries whose mount kind
 * doesn't include `"journey"`, so a transition that returns a
 * composition-only `(module, entry)` is a compile error at the call
 * site.
 *
 * Matrix coverage matches the composition tests:
 *
 *   defineEntry { mountKinds: …          }  | journey ok | composition ok
 *   ─────────────────────────────────────  | ────────── | ──────────────
 *   (omitted — default)                    |   yes      |   yes
 *   ["journey"]                            |   yes      |   NO
 *   ["composition"]                        |   NO       |   yes
 *   ["journey", "composition"]             |   yes      |   yes
 */

import { describe, expectTypeOf, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema, type StepSpec } from "@modular-react/core";

// ---------------------------------------------------------------------------
// Fixture: same shape as the compositions test, exercised against
// journeys' StepSpec.
// ---------------------------------------------------------------------------

const fixtureModule = defineModule({
  id: "fixture",
  version: "1.0.0",
  exitPoints: { done: defineExit() },
  entryPoints: {
    plain: defineEntry({
      component: (() => null) as never,
      input: schema<{ x: number }>(),
    }),
    journeyOnly: defineEntry({
      component: (() => null) as never,
      input: schema<{ y: string }>(),
      mountKinds: ["journey"],
    }),
    compositionOnly: defineEntry({
      component: (() => null) as never,
      input: schema<{ z: boolean }>(),
      mountKinds: ["composition"],
    }),
    both: defineEntry({
      component: (() => null) as never,
      input: schema<{ w: number }>(),
      mountKinds: ["journey", "composition"],
    }),
  },
});

type FixtureModules = { readonly fixture: typeof fixtureModule };

// ---------------------------------------------------------------------------
// StepSpec is filtered to journey-mountable entries
// ---------------------------------------------------------------------------

describe("StepSpec<TModules> filters to journey-mountable entries", () => {
  type Spec = StepSpec<FixtureModules>;

  it("the reachable entry set is exactly { plain, journeyOnly, both }", () => {
    expectTypeOf<Spec["entry"]>().toEqualTypeOf<"plain" | "journeyOnly" | "both">();
  });

  it("the composition-only arm is filtered out (Extract → never)", () => {
    type CompositionOnlyArm = Extract<Spec, { readonly entry: "compositionOnly" }>;
    expectTypeOf<CompositionOnlyArm>().toEqualTypeOf<never>();
  });

  it("a transition returning the composition-only entry is not assignable to StepSpec", () => {
    type BadStep = {
      readonly module: "fixture";
      readonly entry: "compositionOnly";
      readonly input: { z: boolean };
    };
    expectTypeOf<BadStep>().not.toExtend<Spec>();
  });

  it("a transition returning the journey-only entry IS assignable to StepSpec", () => {
    type GoodStep = {
      readonly module: "fixture";
      readonly entry: "journeyOnly";
      readonly input: { y: string };
    };
    expectTypeOf<GoodStep>().toExtend<Spec>();
  });

  it("a transition returning the plain (default) entry IS assignable to StepSpec", () => {
    type DefaultStep = {
      readonly module: "fixture";
      readonly entry: "plain";
      readonly input: { x: number };
    };
    expectTypeOf<DefaultStep>().toExtend<Spec>();
  });

  it("a transition returning the both-surfaces entry IS assignable to StepSpec", () => {
    type BothStep = {
      readonly module: "fixture";
      readonly entry: "both";
      readonly input: { w: number };
    };
    expectTypeOf<BothStep>().toExtend<Spec>();
  });

  it("a wrong-shaped input is still rejected (per-entry input narrowing intact)", () => {
    type WrongInputStep = {
      readonly module: "fixture";
      readonly entry: "plain";
      readonly input: { z: boolean };
    };
    expectTypeOf<WrongInputStep>().not.toExtend<Spec>();
  });

  it("an unknown entry name is rejected", () => {
    type UnknownStep = {
      readonly module: "fixture";
      readonly entry: "nonexistent";
      readonly input: { x: number };
    };
    expectTypeOf<UnknownStep>().not.toExtend<Spec>();
  });
});

// ---------------------------------------------------------------------------
// Symmetry assertion: the composition-side spec rejects the journey-only
// entry; the journey-side spec rejects the composition-only entry. Both
// allow defaults and "both"-declared entries.
// ---------------------------------------------------------------------------

describe("StepSpec mirrors the composition filter (across the boundary)", () => {
  // Symmetry: the journey-side filter looks like the composition-side
  // filter, just with the opposite `TKind`. We don't import the
  // composition types here (the journeys package can't depend on
  // compositions), but the construction is symmetric — same
  // `EntryNamesByMountKindOf` helper, opposite literal.
  it("the journey-mountable set excludes composition-only entries", () => {
    type JourneyMountable = StepSpec<FixtureModules>["entry"];
    expectTypeOf<JourneyMountable>().toEqualTypeOf<"plain" | "journeyOnly" | "both">();
    expectTypeOf<Extract<JourneyMountable, "compositionOnly">>().toEqualTypeOf<never>();
  });
});

/* ============================================================================
 * Verification — these negative assertions can actually fail
 * ============================================================================
 *
 *   1. Implementation revert: I temporarily reverted the journey
 *      contracts to use `EntryNamesOf<TModules[M]>` (i.e. removed the
 *      mountKinds filter on StepSpec) and the test "a transition
 *      returning the composition-only entry is not assignable to
 *      StepSpec" failed — proving the filter is what makes the
 *      assertion hold.
 *
 *   2. Spot-check on the other negatives by flipping `.not.toExtend`
 *      to `.toExtend` — vitest reported the expected mismatch.
 *
 * To re-verify, flip any negative assertion (.not.toExtend ↔ .toExtend,
 * .toEqualTypeOf<never> ↔ .toEqualTypeOf<typeof actual>) and rerun
 * `pnpm -F @modular-react/journeys test`. Restore afterward.
 * ============================================================================ */
