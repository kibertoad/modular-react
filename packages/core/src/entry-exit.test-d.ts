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
