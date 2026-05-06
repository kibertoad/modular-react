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
// `StepRef<TModules>` — the union the curried form constrains `targets` to.
// -----------------------------------------------------------------------------

test("StepRef<TModules> resolves to the union of `${moduleId}/${entryName}` literals", () => {
  expectTypeOf<StepRef<Modules>>().toEqualTypeOf<
    "profile/review" | "plan/choose" | "billing/collect"
  >();
});

// -----------------------------------------------------------------------------
// Curried form — the recommended path.
// -----------------------------------------------------------------------------

test("curried form: targets infer as a literal tuple without `as const`", () => {
  const handler = transition({
    targets: ["plan/choose"],
    handle: () => ({ abort: { reason: "noop" } }),
  });
  // The `const TTargets` modifier on the binder preserves the literal tuple,
  // so callers never need `as const` on the targets array.
  expectTypeOf(handler.targets).toEqualTypeOf<readonly ["plan/choose"]>();
});

test("curried form: targets accept any subset of valid step refs", () => {
  // Multi-target — autocomplete-checked against the journey's StepRef union.
  const handler = transition({
    targets: ["plan/choose", "billing/collect"],
    handle: ({ output }) => ({
      next:
        (output as { hint: "cheap" | "premium" }).hint === "cheap"
          ? { module: "plan", entry: "choose", input: { customerId: "c", hint: "cheap" } }
          : { module: "billing", entry: "collect", input: { customerId: "c", amount: 0 } },
    }),
  });
  expectTypeOf(handler.targets).toEqualTypeOf<readonly ["plan/choose", "billing/collect"]>();
});

test("curried form: typo in `targets` is a compile error with did-you-mean", () => {
  transition({
    // @ts-expect-error — '"plan/chooze"' is not assignable to StepRef<Modules>;
    // TS surfaces a "Did you mean 'plan/choose'?" hint.
    targets: ["plan/chooze"],
    handle: () => ({ abort: { reason: "noop" } }),
  });
});

test("curried form: unknown module id in `targets` is a compile error", () => {
  transition({
    // @ts-expect-error — '"ghost/x"' is not assignable to StepRef<Modules>.
    targets: ["ghost/x"],
    handle: () => ({ abort: { reason: "noop" } }),
  });
});

test("curried form: bare module id (missing `/entry`) is a compile error", () => {
  transition({
    // @ts-expect-error — '"plan"' is not assignable; entry name required.
    targets: ["plan"],
    handle: () => ({ abort: { reason: "noop" } }),
  });
});

test("curried form: handler `next.module` narrows to keys of TModules", () => {
  transition({
    targets: ["plan/choose"],
    handle: () => ({
      // @ts-expect-error — '"ghost"' is not assignable to keyof Modules.
      next: { module: "ghost", entry: "choose", input: {} },
    }),
  });
});

test("curried form: handler `next.entry` narrows against the chosen module's entries", () => {
  transition({
    targets: ["plan/choose"],
    handle: () => ({
      // @ts-expect-error — entry "wrong" is not on plan.entryPoints.
      next: { module: "plan", entry: "wrong", input: { customerId: "c", hint: "cheap" } },
    }),
  });
});

test("curried form: handler `next.input` narrows against the entry's input schema", () => {
  transition({
    targets: ["plan/choose"],
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
// inferred as a literal tuple via the `const TTargets` modifier.
// -----------------------------------------------------------------------------

test("bare form: targets infer as a literal tuple without `as const`", () => {
  const handler = defineTransition({
    targets: ["plan/choose"],
    handle: () => ({ abort: { reason: "noop" } }),
  });
  expectTypeOf(handler.targets).toEqualTypeOf<readonly ["plan/choose"]>();
});

test("bare form: targets are typed `readonly string[]` (no StepRef constraint)", () => {
  // Any string passes — the bare form trades autocomplete for the simpler
  // signature. The runtime preloader's lookup against `modules[m]?.entryPoints`
  // is the safety net.
  const handler = defineTransition({
    targets: ["anything/at-all"],
    handle: () => ({ abort: { reason: "noop" } }),
  });
  expectTypeOf(handler.targets).toEqualTypeOf<readonly ["anything/at-all"]>();
});

test("bare form: returns AnnotatedTransitionHandler with intersection of handler + targets", () => {
  const handler = defineTransition({
    targets: ["plan/choose"],
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
    targets: ["plan/choose"],
    handle: () => ({ abort: { reason: "x" } }),
  });
  const bare = defineTransition({
    targets: ["plan/choose"],
    handle: () => ({ abort: { reason: "x" } }),
  });
  expectTypeOf(curried).toMatchTypeOf<
    AnnotatedTransitionHandler<(ctx: any) => any, readonly string[]>
  >();
  expectTypeOf(bare).toMatchTypeOf<
    AnnotatedTransitionHandler<(ctx: any) => any, readonly string[]>
  >();
});
