// Type-level acceptance tests for `defineModule` (TanStack Router flavor).
//
// These lock the two guarantees the production-feedback tracker's item 3 asked
// for — the reasons a real app abandoned `defineModule` in favor of a hand-
// written `as const` object literal:
//
//   1. `typeof someModule` (built via `defineModule`) works as a `TModules`
//      member in a journey `TransitionMap` with ZERO casts — i.e. the literal
//      `entryPoints` / `exitPoints` shapes survive instead of widening to
//      `EntryPointMap` / `ExitPointMap` (which would collapse `EntryNamesOf` to
//      `string` and break per-entry / per-exit narrowing).
//   2. Function-form `to` (`to: (ctx) => "/x/" + ctx.id`) type-checks WITHOUT
//      having to spell the `TNavItem` generic — `TNavItem` is inferred from the
//      `navigation` array rather than defaulting to the string-`to` shape.
//
// Runs through vitest's typecheck pass (see vitest.config.ts).

import { expectTypeOf, test } from "vitest";
import { defineEntry, defineExit, schema } from "@modular-react/core";
import type { EntryNamesOf, ExitNamesOf, StepSpec, TransitionMap } from "@modular-react/core";
import { defineModule } from "./define-module.js";

interface CheckoutState {
  readonly tier: string | null;
}

// A module defined with ZERO explicit generics. It uses function-form `to`
// (previously required spelling `TNavItem`) and declares literal entry / exit
// vocabularies a journey will reference by `typeof`.
const plan = defineModule({
  id: "plan",
  version: "1.0.0",
  navigation: [
    // Function-form `to` — resolves an href from render-time context. Under the
    // old `TNavItem = NavigationItem` default this was a compile error (`to`
    // narrowed to `string`); inferring `TNavItem` from this `navigation` array
    // admits it.
    { label: "Plan", to: (ctx: { workspaceId: string }) => `/plan/${ctx.workspaceId}` },
  ],
  exitPoints: {
    chosen: defineExit<{ readonly tier: string }>(),
    cancelled: defineExit(),
  },
  entryPoints: {
    choose: defineEntry({
      component: (() => null) as never,
      input: schema<{ readonly recommended: string }>(),
    }),
    compare: defineEntry({
      component: (() => null) as never,
      input: schema<{ readonly ids: readonly string[] }>(),
    }),
  },
});

type PlanModules = { readonly plan: typeof plan };

// -----------------------------------------------------------------------------
// Guarantee 1 — literal shape preserved: entry/exit names are the real unions,
// not `string`.
// -----------------------------------------------------------------------------

test("defineModule preserves literal entry names (not widened to string)", () => {
  expectTypeOf<EntryNamesOf<typeof plan>>().toEqualTypeOf<"choose" | "compare">();
});

test("defineModule preserves literal exit names (not widened to string)", () => {
  expectTypeOf<ExitNamesOf<typeof plan>>().toEqualTypeOf<"chosen" | "cancelled">();
});

// -----------------------------------------------------------------------------
// Guarantee 1 (cont.) — `typeof plan` drops into a journey `TransitionMap` with
// zero casts, and the exit handler's `output` / `state` are narrowed correctly.
// -----------------------------------------------------------------------------

test("typeof module is usable as a TModules member in a TransitionMap (no casts)", () => {
  const transitions: TransitionMap<PlanModules, CheckoutState> = {
    plan: {
      choose: {
        chosen: ({ output, state }) => {
          // `output` is narrowed to the `chosen` exit's payload — no cast.
          expectTypeOf(output).toEqualTypeOf<{ readonly tier: string }>();
          return { complete: undefined, state: { ...state, tier: output.tier } };
        },
        cancelled: () => ({ abort: { reason: "cancelled" } }),
      },
    },
  };
  void transitions;
});

test("StepSpec over the module narrows `input` per entry (no casts)", () => {
  const step: StepSpec<PlanModules> = {
    module: "plan",
    entry: "compare",
    input: { ids: ["a", "b"] },
  };
  void step;

  const bad: StepSpec<PlanModules> = {
    module: "plan",
    entry: "compare",
    // @ts-expect-error — `compare` input is `{ ids: readonly string[] }`, not `{ recommended }`.
    input: { recommended: "x" },
  };
  void bad;
});

// -----------------------------------------------------------------------------
// Guarantee 2 — an unknown navigation target inside a typed transition map is
// still a compile error: literal narrowing did not degrade into `any`.
// -----------------------------------------------------------------------------

test("an undeclared entry key in the transition map is a compile error", () => {
  const transitions: TransitionMap<PlanModules, CheckoutState> = {
    plan: {
      // @ts-expect-error — `plan` declares `choose` / `compare`, not `nope`.
      nope: {},
    },
  };
  void transitions;
});

// -----------------------------------------------------------------------------
// Curried form — a typed shell pins `TSharedDependencies` / `TSlots` explicitly
// while function-form `to` stays inferred. Partial generics on a single call
// (`defineModule<AppDeps, AppSlots>({...})`) would default `TNavItem` back to
// the string-`to` shape and reject the resolver form; the curried call keeps it
// inferred (guarantee 2) without losing the literal entry/exit shapes
// (guarantee 1).
// -----------------------------------------------------------------------------

test("curried defineModule<Deps, Slots>() keeps function-form `to` inferred", () => {
  interface AppDeps {
    readonly logger: { info(m: string): void };
  }
  type AppSlots = Record<string, never[]>;

  const curried = defineModule<AppDeps, AppSlots>()({
    id: "plan",
    version: "1.0.0",
    navigation: [
      { label: "Plan", to: (ctx: { workspaceId: string }) => `/plan/${ctx.workspaceId}` },
    ],
    exitPoints: { chosen: defineExit<{ readonly tier: string }>() },
    entryPoints: {
      choose: defineEntry({
        component: (() => null) as never,
        input: schema<{ readonly recommended: string }>(),
      }),
    },
  });

  // Literal entry/exit vocabulary still survives the curried call.
  expectTypeOf<EntryNamesOf<typeof curried>>().toEqualTypeOf<"choose">();
  expectTypeOf<ExitNamesOf<typeof curried>>().toEqualTypeOf<"chosen">();
});
