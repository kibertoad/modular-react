// Type-level regression tests for the entry-point shape:
//   - `defineEntry` overloads (eager vs lazy, mutually exclusive)
//   - `EagerModuleEntryPoint` / `LazyModuleEntryPoint` discrimination via the
//     `?: never` idiom that makes `component`+`lazy` co-occurrence an error
//   - `LazyEntryComponent` importer signature (default-export and direct-export
//     module shapes are both accepted)
//   - `fallback` is allowed only on lazy entries (never on eager — eager
//     entries don't suspend, so the field would be silently ignored)

import { expectTypeOf, test } from "vitest";
import type { ComponentType, ReactNode } from "react";

import { buildInputFor, defineEntry, schema } from "./entry-exit.js";
import type {
  EagerModuleEntryPoint,
  LazyEntryComponent,
  LazyModuleEntryPoint,
  ModuleEntryPoint,
  ModuleEntryProps,
} from "./types.js";

interface MyInput {
  readonly id: string;
}
const Component = ((_props: ModuleEntryProps<MyInput, any>) => null) as ComponentType<
  ModuleEntryProps<MyInput, any>
>;

// -----------------------------------------------------------------------------
// `defineEntry` — overload selection preserves the narrow union member.
// -----------------------------------------------------------------------------

test("defineEntry({ component }) returns EagerModuleEntryPoint, not the wider union", () => {
  const entry = defineEntry({ component: Component, input: schema<MyInput>() });
  expectTypeOf(entry).toMatchTypeOf<EagerModuleEntryPoint<MyInput>>();
  expectTypeOf(entry).not.toMatchTypeOf<LazyModuleEntryPoint<MyInput>>();
});

test("defineEntry({ lazy }) returns LazyModuleEntryPoint, not the wider union", () => {
  const entry = defineEntry({
    lazy: () => Promise.resolve({ default: Component }),
    input: schema<MyInput>(),
    fallback: null,
  });
  expectTypeOf(entry).toMatchTypeOf<LazyModuleEntryPoint<MyInput>>();
  expectTypeOf(entry).not.toMatchTypeOf<EagerModuleEntryPoint<MyInput>>();
});

test("defineEntry rejects an entry that declares BOTH component and lazy", () => {
  // Both fields present → no overload accepts (eager has `lazy?: never`,
  // lazy has `component?: never`). The error attribution under the
  // mount-kinds overload chain lands on the offending field, not the
  // call site, so we narrow the directive accordingly.
  defineEntry({
    // @ts-expect-error — declaring both `component` and `lazy` is rejected by every overload.
    component: Component,
    lazy: () => Promise.resolve({ default: Component }),
  });
});

test("defineEntry rejects an entry that declares NEITHER component nor lazy", () => {
  // @ts-expect-error — neither overload matches an empty entry.
  defineEntry({});
});

test("`fallback` is allowed only on lazy entries", () => {
  // @ts-expect-error — fallback is `never` on EagerModuleEntryPoint.
  defineEntry({ component: Component, fallback: null });

  // OK on lazy entries.
  defineEntry({
    lazy: () => Promise.resolve({ default: Component }),
    fallback: null as ReactNode,
  });
});

// -----------------------------------------------------------------------------
// `LazyEntryComponent` — importer signature normalizes default-export and
// direct-export module shapes.
// -----------------------------------------------------------------------------

test("LazyEntryComponent accepts a `() => Promise<{ default: ComponentType<...> }>`", () => {
  const importer: LazyEntryComponent<MyInput> = () => Promise.resolve({ default: Component });
  expectTypeOf(importer).returns.resolves.toMatchTypeOf<
    | { default: ComponentType<ModuleEntryProps<MyInput, any>> }
    | ComponentType<ModuleEntryProps<MyInput, any>>
  >();
});

test("LazyEntryComponent also accepts a `() => Promise<ComponentType<...>>` (direct export)", () => {
  const importer: LazyEntryComponent<MyInput> = () => Promise.resolve(Component);
  expectTypeOf(importer).returns.resolves.toMatchTypeOf<
    | { default: ComponentType<ModuleEntryProps<MyInput, any>> }
    | ComponentType<ModuleEntryProps<MyInput, any>>
  >();
});

// -----------------------------------------------------------------------------
// `ModuleEntryPoint<TInput>` — the union both render sites accept.
// -----------------------------------------------------------------------------

test("ModuleEntryPoint<TInput> is the union of Eager and Lazy variants", () => {
  type Expected = EagerModuleEntryPoint<MyInput> | LazyModuleEntryPoint<MyInput>;
  expectTypeOf<ModuleEntryPoint<MyInput>>().toEqualTypeOf<Expected>();
});

// -----------------------------------------------------------------------------
// `buildInputFor` — typed wrapper for `buildInput` that bakes TState into the
// factory's `state` parameter. The returned function matches the entry's
// declared `(state: unknown) => TInput` shape regardless of consumer strictness.
// -----------------------------------------------------------------------------

interface ProjectState {
  readonly draftName: string;
  readonly draftEmail: string;
}

test("buildInputFor narrows state to TState inside the factory and preserves TInput", () => {
  const factory = buildInputFor<ProjectState>()((state) => {
    expectTypeOf(state).toEqualTypeOf<ProjectState>();
    return { previousName: state.draftName };
  });
  expectTypeOf(factory).toEqualTypeOf<(state: unknown) => { previousName: string }>();
});

test("buildInputFor wraps cleanly into defineEntry({ buildInput })", () => {
  interface NameInput {
    readonly previousName: string;
  }
  const NameComponent = ((_props: ModuleEntryProps<NameInput, any>) => null) as ComponentType<
    ModuleEntryProps<NameInput, any>
  >;
  const entry = defineEntry({
    component: NameComponent,
    input: schema<NameInput>(),
    buildInput: buildInputFor<ProjectState>()((state) => ({
      previousName: state.draftName,
    })),
  });
  expectTypeOf(entry).toMatchTypeOf<EagerModuleEntryPoint<NameInput>>();
});

test("buildInputFor's wrapper enforces the contextually-expected TInput when one is supplied", () => {
  // When assigned to a position with an expected `(state: unknown) => TInput`
  // shape, the inner factory's return is checked against TInput.
  const ok: (state: unknown) => { previousName: string } = buildInputFor<ProjectState>()(
    (state) => ({ previousName: state.draftName }),
  );
  expectTypeOf(ok).toEqualTypeOf<(state: unknown) => { previousName: string }>();

  // @ts-expect-error — factory returns `{ wrong: number }`, not assignable to `{ previousName: string }`.
  const bad: (state: unknown) => { previousName: string } = buildInputFor<ProjectState>()(() => ({
    wrong: 1,
  }));
  void bad;
});

// -----------------------------------------------------------------------------
// `defineEntry` — `buildInput` presence survives into the return type as a
// REQUIRED member. That required member is what `StepSpec`'s
// `EntryDeclaresBuildInput` check keys on to make a transition's `input`
// optional for self-building entries. The buildInput-absent overloads return
// the plain shape, where the base interface's `buildInput?:` stays optional.
// -----------------------------------------------------------------------------

// A maximally-permissive required `buildInput` member: any concrete
// `(state: unknown) => TInput` is assignable to `(state: never) => unknown`.
type DeclaresBuildInput = { readonly buildInput: (state: never) => unknown };

test("defineEntry preserves `buildInput` as a required member when supplied", () => {
  const entry = defineEntry({
    component: Component,
    input: schema<MyInput>(),
    buildInput: (): MyInput => ({ id: "x" }),
  });
  expectTypeOf(entry).toMatchTypeOf<DeclaresBuildInput>();
});

test("defineEntry does NOT expose a required `buildInput` member when absent", () => {
  const entry = defineEntry({ component: Component, input: schema<MyInput>() });
  // Only the base interface's optional `buildInput?:` survives — an optional
  // member does not match a required one.
  expectTypeOf(entry).not.toMatchTypeOf<DeclaresBuildInput>();
});

test("defineEntry preserves `buildInput` and the literal `mountKinds` tuple together", () => {
  const entry = defineEntry({
    component: Component,
    input: schema<MyInput>(),
    mountKinds: ["journey"],
    buildInput: (): MyInput => ({ id: "x" }),
  });
  expectTypeOf(entry).toMatchTypeOf<DeclaresBuildInput>();
  // `toMatchTypeOf` (not `toEqualTypeOf`): the looked-up `mountKinds` is the
  // intersection `(readonly MountKind[] | undefined) & readonly ["journey"]`,
  // equivalent to but not identity-equal with the bare tuple. Matching the
  // tuple still proves the `const` literal capture survived the buildInput
  // overload split — a widened `readonly MountKind[]` would fail this.
  expectTypeOf(entry.mountKinds).toMatchTypeOf<readonly ["journey"]>();
});

test("a `buildInputFor`-wrapped factory is still detected as a declared `buildInput`", () => {
  const entry = defineEntry({
    component: Component,
    input: schema<MyInput>(),
    buildInput: buildInputFor<ProjectState>()((state): MyInput => ({ id: state.draftName })),
  });
  expectTypeOf(entry).toMatchTypeOf<DeclaresBuildInput>();
});

// -----------------------------------------------------------------------------
// `defineEntry` — catch-all overload. Every precise arm pins `buildInput` to a
// required function or `?: undefined`; a pretyped entry (optional `buildInput`)
// or a conditionally-typed `buildInput` (`fn | undefined`) matches neither.
// The trailing eager/lazy catch-all keeps such callers compiling, returning the
// plain shape with `buildInput` presence erased.
// -----------------------------------------------------------------------------

test("defineEntry accepts a pretyped eager entry (optional `buildInput`)", () => {
  // Declared as `EagerModuleEntryPoint` → `buildInput` is the base interface's
  // OPTIONAL member, assignable to neither the required-`buildInput` arm nor
  // `buildInput?: undefined`. Without the catch-all this would not compile.
  const pretyped: EagerModuleEntryPoint<MyInput> = {
    component: Component,
    input: schema<MyInput>(),
  };
  const entry = defineEntry(pretyped);
  expectTypeOf(entry).toMatchTypeOf<EagerModuleEntryPoint<MyInput>>();
  // Presence is erased on the catch-all path — no required `buildInput`.
  expectTypeOf(entry).not.toMatchTypeOf<DeclaresBuildInput>();
});

test("defineEntry accepts a pretyped lazy entry (optional `buildInput`)", () => {
  const pretyped: LazyModuleEntryPoint<MyInput> = {
    lazy: () => Promise.resolve({ default: Component }),
    input: schema<MyInput>(),
  };
  const entry = defineEntry(pretyped);
  expectTypeOf(entry).toMatchTypeOf<LazyModuleEntryPoint<MyInput>>();
  expectTypeOf(entry).not.toMatchTypeOf<EagerModuleEntryPoint<MyInput>>();
});

test("defineEntry accepts an entry whose `buildInput` is conditionally typed", () => {
  // `((state: unknown) => MyInput) | undefined` — assignable to neither a
  // required function nor `undefined`, so it lands on the catch-all.
  const maybeBuild: ((state: unknown) => MyInput) | undefined =
    Math.random() > 0.5 ? () => ({ id: "x" }) : undefined;
  const entry = defineEntry({
    component: Component,
    input: schema<MyInput>(),
    buildInput: maybeBuild,
  });
  expectTypeOf(entry).toMatchTypeOf<EagerModuleEntryPoint<MyInput>>();
  // Conditional presence can't be statically proven → not required.
  expectTypeOf(entry).not.toMatchTypeOf<DeclaresBuildInput>();
});
