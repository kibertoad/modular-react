// Type-level regression tests for the `UiComponent` seam.
//
// The construct arm (`new (props: P) => any`) is what class-component
// frameworks bind against. This file pins the two properties that seam relies
// on, verified against the repo's strict tsconfig:
//
//   1. A zero-argument-constructor class is a valid `UiComponent<P>` for ANY
//      `P` — a constructor taking fewer parameters is assignable to one that
//      supplies more, so props are NOT checked through the construct arm.
//   2. The call arm still checks `P` structurally, so the asymmetry that lets
//      function components stay props-checked (while class components pass
//      through unchecked) is a real, load-bearing distinction — not an accident
//      to be "fixed" by tightening the alias.
//
// PR-A01 of the Angular support initiative documents this contract in
// `ui-types.ts`; a future tightening of the seam must break these assertions
// before it can silently break class-component bindings (Angular's
// `Type<unknown>` narrowing, AD5).

import { expectTypeOf, test } from "vitest";

import type { ModuleEntryProps } from "./types.js";
import type { UiComponent } from "./ui-types.js";

interface MyInput {
  readonly id: string;
}

// -----------------------------------------------------------------------------
// Construct arm — zero-arg classes are admitted with `P` unchecked.
// -----------------------------------------------------------------------------

test("a zero-argument-constructor class satisfies UiComponent for any props type", () => {
  class Bare {}
  // Assignable regardless of `P`: the constructor ignores props entirely.
  expectTypeOf(Bare).toMatchTypeOf<UiComponent<ModuleEntryProps<MyInput, any>>>();
  expectTypeOf(Bare).toMatchTypeOf<UiComponent<{ readonly totallyUnrelated: number }>>();
  expectTypeOf(Bare).toMatchTypeOf<UiComponent>();
});

test("a class whose constructor takes DI-style dependencies (not props) is still admitted", () => {
  // The Angular case: constructors carry injected services, never the entry's
  // props. `Type<unknown>`-shaped classes must pass through this seam.
  class Service {}
  class Angularish {
    constructor(readonly dep: Service) {}
  }
  expectTypeOf(Angularish).toMatchTypeOf<UiComponent<ModuleEntryProps<MyInput, any>>>();
});

test("the construct arm is NOT an unconditional pass-through: an incompatible required-param class is rejected", () => {
  // A class whose constructor requires a parameter that `P` is not assignable to
  // is rejected — the arm only admits classes when `P` fits the declared
  // constructor parameter (and a zero-arg constructor trivially fits). This is
  // exactly why a class-component binding cannot rely on the alias's structural
  // check for arbitrary `@Component` classes (whose constructors carry DI deps,
  // not props) and must narrow to `Type<unknown>` plus an authoring helper (AD5).
  class RequiresIncompatibleParam {
    constructor(_props: { readonly nope: boolean }) {}
  }
  expectTypeOf(RequiresIncompatibleParam).not.toMatchTypeOf<
    UiComponent<ModuleEntryProps<MyInput, any>>
  >();
});

// -----------------------------------------------------------------------------
// Call arm — `P` is still checked structurally (the asymmetry is intentional).
// -----------------------------------------------------------------------------

test("a function component IS props-checked against P through the call arm", () => {
  const Good = (_props: ModuleEntryProps<MyInput, any>) => null;
  expectTypeOf(Good).toMatchTypeOf<UiComponent<ModuleEntryProps<MyInput, any>>>();

  // A function whose parameter demands fields the entry props do not provide is
  // NOT assignable — the call arm enforces `P` where the construct arm does not.
  const Bad = (_props: { readonly missingRequiredField: symbol }) => null;
  expectTypeOf(Bad).not.toMatchTypeOf<UiComponent<ModuleEntryProps<MyInput, any>>>();
});
