// Type-level regression tests for `defineTransition`. Runs through vitest's
// typecheck pass — the assertions fail the test suite if `targets` autocomplete,
// `next` narrowing, or the curried/bare overloads drift.
//
// Covered via `@ts-expect-error` directives plus `expectTypeOf` on the
// returned handler shape.

import { expectTypeOf, test } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";

import {
  type AnnotatedTransitionHandler,
  type StepRef,
  defineTransition,
} from "./define-transition.js";

// -----------------------------------------------------------------------------
// Module fixtures with deliberately divergent input shapes per entry — that
// way using the wrong target / module / input is a real type error, not just
// an indistinguishable structural duplicate.
// -----------------------------------------------------------------------------

const profile = defineModule({
  id: "profile",
  version: "1.0.0",
  exitPoints: {
    profileComplete: defineExit<{ hint: "cheap" | "premium" }>(),
    cancelled: defineExit(),
  } as const,
  entryPoints: {
    review: defineEntry({
      component: (() => null) as never,
      input: schema<{ customerId: string }>(),
    }),
  },
});

const plan = defineModule({
  id: "plan",
  version: "1.0.0",
  exitPoints: {
    choseStandard: defineExit<{ planId: string }>(),
  } as const,
  entryPoints: {
    choose: defineEntry({
      component: (() => null) as never,
      input: schema<{ customerId: string; hint: "cheap" | "premium" }>(),
    }),
  },
});

const billing = defineModule({
  id: "billing",
  version: "1.0.0",
  exitPoints: {
    paid: defineExit<{ reference: string }>(),
  } as const,
  entryPoints: {
    collect: defineEntry({
      component: (() => null) as never,
      input: schema<{ customerId: string; amount: number }>(),
    }),
  },
});

type Modules = {
  readonly profile: typeof profile;
  readonly plan: typeof plan;
  readonly billing: typeof billing;
};

interface State {
  readonly customerId: string;
}

const transition = defineTransition<Modules, State>();

// -----------------------------------------------------------------------------
// `StepRef<TModules>` — same `{ module, entry }` shape `next:` uses, minus
// the runtime-computed `input`. Sharing the structure with `next:` keeps
// the API consistent: authors don't flip between an object and a slash-string.
// -----------------------------------------------------------------------------

test("StepRef<TModules> resolves to the union of `{ module, entry }` literals", () => {
  expectTypeOf<StepRef<Modules>>().toEqualTypeOf<
    | { readonly module: "profile"; readonly entry: "review" }
    | { readonly module: "plan"; readonly entry: "choose" }
    | { readonly module: "billing"; readonly entry: "collect" }
  >();
});

// -----------------------------------------------------------------------------
// Curried form — the recommended path.
// -----------------------------------------------------------------------------

test("curried form: targets infer as a literal tuple without `as const`", () => {
  const handler = transition({
    targets: [{ module: "plan", entry: "choose" }],
    handle: () => ({ abort: { reason: "noop" } }),
  });
  // The `const TTargets` modifier on the binder preserves the literal
  // tuple AND each target's literal property values, so callers never
  // need `as const` on the targets array.
  expectTypeOf(handler.targets).toEqualTypeOf<
    readonly [{ readonly module: "plan"; readonly entry: "choose" }]
  >();
});

test("curried form: targets accept any subset of valid step refs", () => {
  // Multi-target — autocomplete-checked against the journey's StepRef union.
  const handler = transition({
    targets: [
      { module: "plan", entry: "choose" },
      { module: "billing", entry: "collect" },
    ],
    handle: ({ output }) => ({
      next:
        (output as { hint: "cheap" | "premium" }).hint === "cheap"
          ? { module: "plan", entry: "choose", input: { customerId: "c", hint: "cheap" } }
          : { module: "billing", entry: "collect", input: { customerId: "c", amount: 0 } },
    }),
  });
  expectTypeOf(handler.targets).toEqualTypeOf<
    readonly [
      { readonly module: "plan"; readonly entry: "choose" },
      { readonly module: "billing"; readonly entry: "collect" },
    ]
  >();
});

test("curried form: typo on `entry` is a compile error", () => {
  transition({
    // @ts-expect-error — `entry: "chooze"` is not a valid entry of `plan`;
    // TS reports an excess-property / mismatch error against StepRef<Modules>.
    targets: [{ module: "plan", entry: "chooze" }],
    handle: () => ({ abort: { reason: "noop" } }),
  });
});

test("curried form: unknown `module` is a compile error", () => {
  transition({
    // @ts-expect-error — `module: "ghost"` is not a key of TModules.
    targets: [{ module: "ghost", entry: "x" }],
    handle: () => ({ abort: { reason: "noop" } }),
  });
});

test("curried form: missing `entry` field is a compile error", () => {
  transition({
    // @ts-expect-error — every target must specify both `module` and `entry`.
    targets: [{ module: "plan" }],
    handle: () => ({ abort: { reason: "noop" } }),
  });
});

test("curried form: cross-pair (entry from a different module) is a compile error", () => {
  transition({
    // @ts-expect-error — `plan` has no entry called `collect` (that's billing's).
    targets: [{ module: "plan", entry: "collect" }],
    handle: () => ({ abort: { reason: "noop" } }),
  });
});

test("curried form: handler `next.module` narrows to keys of TModules", () => {
  transition({
    targets: [{ module: "plan", entry: "choose" }],
    handle: () => ({
      // @ts-expect-error — '"ghost"' is not assignable to keyof Modules.
      next: { module: "ghost", entry: "choose", input: {} },
    }),
  });
});

test("curried form: handler `next.entry` narrows against the chosen module's entries", () => {
  transition({
    targets: [{ module: "plan", entry: "choose" }],
    handle: () => ({
      // @ts-expect-error — entry "wrong" is not on plan.entryPoints.
      next: { module: "plan", entry: "wrong", input: { customerId: "c", hint: "cheap" } },
    }),
  });
});

test("curried form: handler `next.input` narrows against the entry's input schema", () => {
  transition({
    targets: [{ module: "plan", entry: "choose" }],
    handle: () => ({
      // @ts-expect-error — plan.choose's input requires `customerId` AND `hint`;
      // omitting `hint` makes the whole `next` literal incompatible with StepSpec.
      next: { module: "plan", entry: "choose", input: { customerId: "c" } },
    }),
  });
});

test("curried form: empty `targets` are accepted (handler returns complete/abort)", () => {
  const handler = transition({
    targets: [],
    handle: () => ({ complete: { ok: true } }),
  });
  expectTypeOf(handler.targets).toEqualTypeOf<readonly []>();
});

// -----------------------------------------------------------------------------
// Bare form — no contextual narrowing on `next`, but `targets` is still
// inferred as a literal tuple via the `const TTargets` modifier. Runtime
// validates each target's `{ module, entry }` shape via `isAnnotatedTransition`.
// -----------------------------------------------------------------------------

test("bare form: targets infer as a literal tuple without `as const`", () => {
  const handler = defineTransition({
    targets: [{ module: "plan", entry: "choose" }],
    handle: () => ({ abort: { reason: "noop" } }),
  });
  expectTypeOf(handler.targets).toEqualTypeOf<
    readonly [{ readonly module: "plan"; readonly entry: "choose" }]
  >();
});

test("bare form: targets accept any `{ module, entry }` pair (no StepRef constraint)", () => {
  // Any string-keyed object passes — the bare form trades autocomplete for the
  // simpler signature. The runtime preloader's lookup against
  // `modules[m]?.entryPoints` is the safety net.
  const handler = defineTransition({
    targets: [{ module: "anything", entry: "atall" }],
    handle: () => ({ abort: { reason: "noop" } }),
  });
  expectTypeOf(handler.targets).toEqualTypeOf<
    readonly [{ readonly module: "anything"; readonly entry: "atall" }]
  >();
});

test("bare form: returns AnnotatedTransitionHandler with intersection of handler + targets", () => {
  const handler = defineTransition({
    targets: [{ module: "plan", entry: "choose" }],
    handle: (ctx: { state: number; input: string; output: boolean }) => ({
      complete: ctx.input,
    }),
  });
  // The wrapper preserves the handler's call signature verbatim.
  expectTypeOf(handler).parameter(0).toMatchTypeOf<{
    state: number;
    input: string;
    output: boolean;
  }>();
});

// -----------------------------------------------------------------------------
// Both forms produce a handler that drops into a `transitions` slot —
// runtime invocation at runtime.ts:1338-1359 reads the function's call
// signature and ignores the metadata.
// -----------------------------------------------------------------------------

test("both forms produce values assignable to AnnotatedTransitionHandler", () => {
  const curried = transition({
    targets: [{ module: "plan", entry: "choose" }],
    handle: () => ({ abort: { reason: "x" } }),
  });
  const bare = defineTransition({
    targets: [{ module: "plan", entry: "choose" }],
    handle: () => ({ abort: { reason: "x" } }),
  });
  expectTypeOf(curried).toMatchTypeOf<
    AnnotatedTransitionHandler<
      (ctx: any) => any,
      readonly { readonly module: string; readonly entry: string }[]
    >
  >();
  expectTypeOf(bare).toMatchTypeOf<
    AnnotatedTransitionHandler<
      (ctx: any) => any,
      readonly { readonly module: string; readonly entry: string }[]
    >
  >();
});
