// Type-level regression tests for `StepSpec`'s conditional `input` field.
// Runs through vitest's typecheck pass — the assertions fail the suite if the
// buildInput-aware optionality of `input` drifts.
//
// The contract:
//   - entry WITHOUT `buildInput` → `input` is REQUIRED on its StepSpec member
//   - entry WITH `buildInput`    → `input` is OPTIONAL (runtime re-derives it)
//   - stamping a real `input` for a buildInput entry still type-checks
//     (non-breaking) and is still shape-checked
//   - `JourneyStepFor` (the observation type) keeps `input` REQUIRED regardless
//   - `StepSpec<any>` falls back to a loose shape, never `never`

import { expectTypeOf, test } from "vitest";

import { buildInputFor, defineEntry, defineExit, schema } from "./entry-exit.js";
import { defineModule } from "./define-module.js";
import type { JourneyStepFor, StepSpec } from "./journey-contracts.js";

interface FormState {
  readonly draftName: string;
}

// `plain.enter` declares no `buildInput` — its `input` must be supplied.
const plain = defineModule({
  id: "plain",
  version: "1.0.0",
  exitPoints: { next: defineExit() } as const,
  entryPoints: {
    enter: defineEntry({
      component: (() => null) as never,
      input: schema<{ readonly seed: string }>(),
    }),
  },
});

// `self-building.enter` declares `buildInput` — the runtime re-derives its
// `input` from journey state on every entry, so a transition may omit it.
const selfBuilding = defineModule({
  id: "self-building",
  version: "1.0.0",
  exitPoints: { next: defineExit() } as const,
  entryPoints: {
    enter: defineEntry({
      component: (() => null) as never,
      input: schema<{ readonly previousName: string }>(),
      buildInput: buildInputFor<FormState>()((state) => ({ previousName: state.draftName })),
    }),
  },
});

// The same two entries, but authored as INLINE object literals inside
// `defineModule` — no `defineEntry` wrapper. This is the path a downstream
// consumer flagged as not detecting `buildInput` (so `input` stayed required)
// before #83 taught `defineModule` to preserve the literal `entryPoints` shape.
// With that preservation in place, an inline `buildInput` member survives into
// `typeof mod`, so `EntryDeclaresBuildInput` sees it and `input` goes optional —
// exactly as with the wrapped form. These cases lock that equivalence in.
const inlinePlain = defineModule({
  id: "inline-plain",
  version: "1.0.0",
  exitPoints: { next: defineExit() } as const,
  entryPoints: {
    enter: {
      component: (() => null) as never,
      input: schema<{ readonly seed: string }>(),
    },
  },
});

const inlineSelfBuilding = defineModule({
  id: "inline-self-building",
  version: "1.0.0",
  exitPoints: { next: defineExit() } as const,
  entryPoints: {
    enter: {
      component: (() => null) as never,
      input: schema<{ readonly previousName: string }>(),
      buildInput: buildInputFor<FormState>()((state) => ({ previousName: state.draftName })),
    },
  },
});

type Modules = {
  readonly plain: typeof plain;
  readonly "self-building": typeof selfBuilding;
};

type InlineModules = {
  readonly "inline-plain": typeof inlinePlain;
  readonly "inline-self-building": typeof inlineSelfBuilding;
};

// -----------------------------------------------------------------------------
// Entry WITHOUT buildInput — `input` stays required.
// -----------------------------------------------------------------------------

test("StepSpec requires `input` for an entry without buildInput", () => {
  const ok: StepSpec<Modules> = { module: "plain", entry: "enter", input: { seed: "s" } };
  void ok;
});

test("StepSpec rejects omitting `input` for an entry without buildInput", () => {
  // @ts-expect-error — `input` is required on `plain.enter` (no buildInput).
  const bad: StepSpec<Modules> = { module: "plain", entry: "enter" };
  void bad;
});

// -----------------------------------------------------------------------------
// Entry WITH buildInput — `input` becomes optional.
// -----------------------------------------------------------------------------

test("StepSpec allows omitting `input` for an entry with buildInput", () => {
  const ok: StepSpec<Modules> = { module: "self-building", entry: "enter" };
  void ok;
});

test("StepSpec still accepts a stamped `input` for a buildInput entry (non-breaking)", () => {
  const stamped: StepSpec<Modules> = {
    module: "self-building",
    entry: "enter",
    input: { previousName: "p" },
  };
  void stamped;
  // Explicit `undefined` is also legal (survives `exactOptionalPropertyTypes`).
  const explicitUndefined: StepSpec<Modules> = {
    module: "self-building",
    entry: "enter",
    input: undefined,
  };
  void explicitUndefined;
});

test("StepSpec still shape-checks a stamped `input` for a buildInput entry", () => {
  const bad: StepSpec<Modules> = {
    module: "self-building",
    entry: "enter",
    // @ts-expect-error — `wrong` is not the declared input shape `{ previousName: string }`.
    input: { wrong: 1 },
  };
  void bad;
});

// -----------------------------------------------------------------------------
// `JourneyStepFor` is the OBSERVATION type — the runtime always populates
// `input`, so it stays required even for buildInput entries.
// -----------------------------------------------------------------------------

test("JourneyStepFor keeps `input` required even for a buildInput entry", () => {
  // @ts-expect-error — observation type: `input` is always present at runtime.
  const bad: JourneyStepFor<Modules> = { moduleId: "self-building", entry: "enter" };
  void bad;
});

// -----------------------------------------------------------------------------
// Generic-erased path — `StepSpec<any>` must not collapse to `never`.
// -----------------------------------------------------------------------------

test("StepSpec<any> falls back to a loose shape, not never", () => {
  expectTypeOf<StepSpec<any>>().not.toBeNever();
  const loose: StepSpec<any> = { module: "anything", entry: "atall" };
  void loose;
});

// -----------------------------------------------------------------------------
// INLINE-authored entries (no `defineEntry` wrapper) behave identically — the
// regression the consumer feedback specifically called out to verify.
// -----------------------------------------------------------------------------

test("INLINE buildInput entry → StepSpec `input` is optional", () => {
  const omitted: StepSpec<InlineModules> = { module: "inline-self-building", entry: "enter" };
  void omitted;
  // A stamped value is still shape-checked.
  const stamped: StepSpec<InlineModules> = {
    module: "inline-self-building",
    entry: "enter",
    input: { previousName: "p" },
  };
  void stamped;
});

test("INLINE plain entry → StepSpec `input` stays required", () => {
  // @ts-expect-error — no `buildInput` on the inline literal, so `input` is required.
  const bad: StepSpec<InlineModules> = { module: "inline-plain", entry: "enter" };
  void bad;
});
