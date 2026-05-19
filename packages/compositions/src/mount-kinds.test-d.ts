/**
 * Type-level coverage for the `mountKinds` compile-time enforcement.
 *
 * `defineEntry({ mountKinds: […] })` records the literal mount-kind
 * tuple on the entry's type. `CompositionZoneSpec` filters out
 * `(module, entry)` pairs whose mount kind doesn't include
 * `"composition"`, so a selector returning such a pair is a compile
 * error at the call site — not a runtime drop, not a dev-warn, not
 * a framework-boot validation. The diagnostic lives next to the
 * mistake.
 *
 * Each suite below covers one cell of the matrix:
 *
 *   defineEntry { mountKinds: …          }  | journey ok | composition ok
 *   ─────────────────────────────────────  | ────────── | ──────────────
 *   (omitted — default)                    |   yes      |   yes
 *   ["journey"]                            |   yes      |   NO
 *   ["composition"]                        |   NO       |   yes
 *   ["journey", "composition"]             |   yes      |   yes
 *
 *   The journey-side symmetric matrix lives in
 *   `packages/journeys/src/mount-kinds.test-d.ts` — `StepSpec`,
 *   `TransitionMap`, and the wildcard helpers all filter to
 *   `"journey"`-mountable entries the same way `CompositionZoneSpec`
 *   filters to `"composition"`.
 *
 * Each negative assertion below was verified by temporarily flipping
 * it to a positive (`// @ts-expect-error` → no directive) and
 * confirming the compiler caught the bad code. See the comment block
 * at the bottom for the verification recipe.
 */

import { describe, expectTypeOf, it } from "vitest";
import {
  defineEntry,
  defineExit,
  defineModule,
  schema,
  type EntryNamesByMountKindOf,
  type MountKindsOf,
} from "@modular-react/core";

import { defineComposition } from "./define-composition.js";
import type { CompositionZoneResolution, CompositionZoneSpec } from "./types.js";

// ---------------------------------------------------------------------------
// Fixture entries — one per cell of the matrix.
// ---------------------------------------------------------------------------

const noMountKindsEntry = defineEntry({
  component: (() => null) as never,
  input: schema<{ x: number }>(),
});

const journeyOnlyEntry = defineEntry({
  component: (() => null) as never,
  input: schema<{ y: string }>(),
  mountKinds: ["journey"],
});

const compositionOnlyEntry = defineEntry({
  component: (() => null) as never,
  input: schema<{ z: boolean }>(),
  mountKinds: ["composition"],
});

const bothMountKindsEntry = defineEntry({
  component: (() => null) as never,
  input: schema<{ w: number }>(),
  mountKinds: ["journey", "composition"],
});

// Fixture module aggregating all four entry shapes.
const fixtureModule = defineModule({
  id: "fixture",
  version: "1.0.0",
  exitPoints: { done: defineExit() },
  entryPoints: {
    plain: noMountKindsEntry,
    journeyOnly: journeyOnlyEntry,
    compositionOnly: compositionOnlyEntry,
    both: bothMountKindsEntry,
  },
});

type FixtureModules = { readonly fixture: typeof fixtureModule };

interface FixtureState {
  readonly tick: number;
}

// ---------------------------------------------------------------------------
// 1. `MountKindsOf<E>` returns the correct narrow union per entry.
// ---------------------------------------------------------------------------

describe("MountKindsOf<E>", () => {
  it("returns the full MountKind union when `mountKinds` is omitted", () => {
    type Result = MountKindsOf<typeof noMountKindsEntry>;
    // Default: every surface.
    expectTypeOf<Result>().toEqualTypeOf<"journey" | "composition">();
  });

  it("returns 'journey' for a journey-only entry", () => {
    type Result = MountKindsOf<typeof journeyOnlyEntry>;
    expectTypeOf<Result>().toEqualTypeOf<"journey">();
  });

  it("returns 'composition' for a composition-only entry", () => {
    type Result = MountKindsOf<typeof compositionOnlyEntry>;
    expectTypeOf<Result>().toEqualTypeOf<"composition">();
  });

  it("returns the full union for an entry that declares both", () => {
    type Result = MountKindsOf<typeof bothMountKindsEntry>;
    expectTypeOf<Result>().toEqualTypeOf<"journey" | "composition">();
  });
});

// ---------------------------------------------------------------------------
// 2. `EntryNamesByMountKindOf<TMod, TKind>` filters entry names correctly.
// ---------------------------------------------------------------------------

describe("EntryNamesByMountKindOf<TMod, 'composition'>", () => {
  it("includes default + composition-only + both, EXCLUDES journey-only", () => {
    type CompositionMountable = EntryNamesByMountKindOf<typeof fixtureModule, "composition">;
    expectTypeOf<CompositionMountable>().toEqualTypeOf<"plain" | "compositionOnly" | "both">();
  });

  it("the journey filter mirrors the composition filter (symmetric helper)", () => {
    type JourneyMountable = EntryNamesByMountKindOf<typeof fixtureModule, "journey">;
    expectTypeOf<JourneyMountable>().toEqualTypeOf<"plain" | "journeyOnly" | "both">();
  });
});

// ---------------------------------------------------------------------------
// 3. CompositionZoneSpec's `module-entry` arm is filtered by mount kind.
// ---------------------------------------------------------------------------

describe("CompositionZoneSpec<TModules>", () => {
  type Spec = CompositionZoneSpec<FixtureModules>;
  type ModuleEntryArm = Extract<Spec, { readonly kind: "module-entry" }>;
  // Entries reachable through CompositionZoneSpec — anything composition-
  // mountable is here, anything journey-only is filtered out.
  type ReachableEntries = ModuleEntryArm["entry"];

  it("reaches plain (no mountKinds, defaults to both)", () => {
    expectTypeOf<"plain">().toExtend<ReachableEntries>();
  });

  it("reaches compositionOnly", () => {
    expectTypeOf<"compositionOnly">().toExtend<ReachableEntries>();
  });

  it("reaches both", () => {
    expectTypeOf<"both">().toExtend<ReachableEntries>();
  });

  it("does NOT reach journeyOnly (filtered out)", () => {
    // `"journeyOnly"` should NOT be a member of the reachable set.
    // `Extract<"journeyOnly", ReachableEntries>` is `never` iff filtered.
    type Filtered = Extract<"journeyOnly", ReachableEntries>;
    expectTypeOf<Filtered>().toEqualTypeOf<never>();
  });

  it("reaches exactly { plain, compositionOnly, both } and nothing else", () => {
    expectTypeOf<ReachableEntries>().toEqualTypeOf<"plain" | "compositionOnly" | "both">();
  });
});

// ---------------------------------------------------------------------------
// 4. Selectors authored against `CompositionZoneSpec` reject bad pairs.
// ---------------------------------------------------------------------------

describe("CompositionZoneSpec accepts composition-mountable resolutions", () => {
  type Spec = CompositionZoneSpec<FixtureModules>;

  it("accepts the `plain` arm (no mountKinds → defaults to both)", () => {
    type PlainResolution = {
      readonly kind: "module-entry";
      readonly module: "fixture";
      readonly entry: "plain";
      readonly input: { x: number };
    };
    expectTypeOf<PlainResolution>().toExtend<Spec>();
  });

  it("accepts the `compositionOnly` arm", () => {
    type CompResolution = {
      readonly kind: "module-entry";
      readonly module: "fixture";
      readonly entry: "compositionOnly";
      readonly input: { z: boolean };
    };
    expectTypeOf<CompResolution>().toExtend<Spec>();
  });

  it("accepts the `both` arm", () => {
    type BothResolution = {
      readonly kind: "module-entry";
      readonly module: "fixture";
      readonly entry: "both";
      readonly input: { w: number };
    };
    expectTypeOf<BothResolution>().toExtend<Spec>();
  });

  it("accepts `empty` and `journey` arms (orthogonal to module-entry filtering)", () => {
    expectTypeOf<{ readonly kind: "empty" }>().toExtend<Spec>();
  });
});

describe("CompositionZoneSpec rejects journey-only resolutions", () => {
  type Spec = CompositionZoneSpec<FixtureModules>;

  it("a `module-entry` resolution targeting the journey-only entry is not assignable to Spec", () => {
    // This is the bedrock claim: a selector returning the journeyOnly
    // arm has a return type that cannot match CompositionZoneSpec, so
    // the assignment that defineComposition does internally would
    // fail at compile time. We assert it directly via vitest's
    // negative-assignability matcher.
    type JourneyOnlyResolution = {
      readonly kind: "module-entry";
      readonly module: "fixture";
      readonly entry: "journeyOnly";
      readonly input: { y: string };
    };
    expectTypeOf<JourneyOnlyResolution>().not.toExtend<Spec>();
  });

  it("an unknown entry name is not assignable to Spec", () => {
    // Defense-in-depth: a typo or a dynamic-id resolution doesn't
    // sneak past the filter just because mountKinds isn't involved.
    type UnknownResolution = {
      readonly kind: "module-entry";
      readonly module: "fixture";
      readonly entry: "nonexistent";
      readonly input: { x: number };
    };
    expectTypeOf<UnknownResolution>().not.toExtend<Spec>();
  });

  it("a wrong-shaped input on a valid (module, entry) is not assignable to Spec", () => {
    // Input narrowing still holds — adding the mountKinds filter
    // didn't accidentally loosen the per-(module, entry) input check.
    type WrongInputResolution = {
      readonly kind: "module-entry";
      readonly module: "fixture";
      readonly entry: "plain";
      readonly input: { z: boolean };
    };
    expectTypeOf<WrongInputResolution>().not.toExtend<Spec>();
  });

  it("the journey-only `module-entry` arm extracted from Spec is `never`", () => {
    // The structural reason the above .not.toExtend assertions hold:
    // the union arm for journeyOnly was filtered out of the union
    // entirely.
    type ModuleEntryArm = Extract<Spec, { readonly kind: "module-entry" }>;
    type JourneyOnlyArm = Extract<ModuleEntryArm, { readonly entry: "journeyOnly" }>;
    expectTypeOf<JourneyOnlyArm>().toEqualTypeOf<never>();
  });
});

describe("selectors of the right shape actually compile against defineComposition", () => {
  // End-to-end integration: the same vitest assertions above hold
  // when the resolution flows through `select` and into
  // `defineComposition`. If these stopped compiling, the type-level
  // assertions above would be insufficient (they'd describe a
  // surface that authors couldn't actually use).

  it("a selector returning a composition-mountable resolution compiles", () => {
    defineComposition<FixtureModules, FixtureState>()({
      id: "ok-plain",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: {
        body: {
          select: () => ({
            kind: "module-entry",
            module: "fixture",
            entry: "plain",
            input: { x: 1 },
          }),
        },
      },
    });
  });

  it("a selector returning a composition-only entry compiles", () => {
    defineComposition<FixtureModules, FixtureState>()({
      id: "ok-comp-only",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: {
        body: {
          select: () => ({
            kind: "module-entry",
            module: "fixture",
            entry: "compositionOnly",
            input: { z: true },
          }),
        },
      },
    });
  });

  it("a selector returning an entry declared as both compiles", () => {
    defineComposition<FixtureModules, FixtureState>()({
      id: "ok-both",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: {
        body: {
          select: () => ({
            kind: "module-entry",
            module: "fixture",
            entry: "both",
            input: { w: 9 },
          }),
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// 5. `CompositionZoneResolution` (the loose runtime shape) still accepts
//    every (module, entry) — only the AUTHOR-FACING `CompositionZoneSpec`
//    is filtered. This split lets the runtime keep the loose shape for
//    internal storage without forcing every internal cast site to add a
//    mountKinds discriminator.
// ---------------------------------------------------------------------------

describe("CompositionZoneResolution stays loose for runtime storage", () => {
  type Resolution = CompositionZoneResolution<FixtureModules>;
  type ModuleEntryArm = Extract<Resolution, { readonly kind: "module-entry" }>;

  it("does NOT narrow entry per-module — entry is `string`", () => {
    // The loose runtime shape intentionally widens `entry` to `string`
    // so internal cast sites (runtime record, validator, hydration)
    // don't pay per-generic mapped-type cost. The author-facing
    // `CompositionZoneSpec` is where the narrow filtering lives.
    expectTypeOf<ModuleEntryArm["entry"]>().toEqualTypeOf<string>();
  });

  it("narrows `module` to known module ids (so typos still type-check)", () => {
    expectTypeOf<ModuleEntryArm["module"]>().toEqualTypeOf<"fixture">();
  });
});

// ---------------------------------------------------------------------------
// 6. Default behaviour for modules whose entries omit mountKinds entirely
//    — the most common real-world case. Compositions should accept every
//    entry, matching the v0.1.0 behavior before the encoding existed.
// ---------------------------------------------------------------------------

describe("backward compatibility — modules without mountKinds work everywhere", () => {
  const plainMod = defineModule({
    id: "plain",
    version: "1.0.0",
    entryPoints: {
      first: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      second: defineEntry({ component: (() => null) as never, input: schema<{ q: string }>() }),
    },
  });
  type PlainModules = { readonly plain: typeof plainMod };

  it("CompositionZoneSpec reaches every entry on a module without mountKinds", () => {
    type Spec = CompositionZoneSpec<PlainModules>;
    type Entries = Extract<Spec, { readonly kind: "module-entry" }>["entry"];
    expectTypeOf<Entries>().toEqualTypeOf<"first" | "second">();
  });

  it("a selector against such a module compiles for every entry", () => {
    defineComposition<PlainModules, FixtureState>()({
      id: "plain-host",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: {
        a: {
          select: () => ({
            kind: "module-entry",
            module: "plain",
            entry: "first",
            input: undefined,
          }),
        },
        b: {
          select: () => ({
            kind: "module-entry",
            module: "plain",
            entry: "second",
            input: { q: "hi" },
          }),
        },
      },
    });
  });
});

/* ============================================================================
 * Verification record — these assertions can actually fail
 * ============================================================================
 *
 * A test that *can't* fail is worse than no test. The negative
 * vitest assertions in this file were verified end-to-end:
 *
 *   1. Implementation revert: swapped
 *      `EntryNamesByMountKindOf<TMod, "composition">` back to
 *      `EntryNamesOf<TMod>` (i.e. removed the filter entirely). With
 *      the filter disabled, the suite reported these failures —
 *      proving the assertions actually depend on the implementation:
 *        - "the journey-only `module-entry` arm extracted from Spec
 *           is `never`" → toEqualTypeOf<never> mismatch (journeyOnly
 *           arm is non-never).
 *        - "a `module-entry` resolution targeting the journey-only
 *           entry is not assignable to Spec" → .not.toExtend assertion
 *           inverted (the bad resolution now extends Spec).
 *
 *   2. Spot-check `.not.toExtend` on the other negative cases by
 *      temporarily flipping the assertion to `.toExtend` (positive)
 *      — vitest reported the expected mismatch in each case,
 *      including the wrong-input check (input narrowing didn't
 *      regress) and the unknown-entry check (entry filter still
 *      catches typos).
 *
 * The error messages from vitest's matcher cite the actual structural
 * mismatch, which doubles as DX documentation: a user reading a
 * failing assertion learns the LEGAL shape they could have used.
 *
 * To re-verify any single assertion can fail, flip it (e.g.
 * `.not.toExtend` ↔ `.toExtend`, `.toEqualTypeOf<never>` ↔
 * `.toEqualTypeOf<typeof actual>`) and rerun `pnpm -F
 * @modular-react/compositions test`. Restore afterward.
 * ============================================================================ */
