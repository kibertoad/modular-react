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

import { defineEntry, schema } from "./entry-exit.js";
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
  // @ts-expect-error — eager branch sets `lazy: never`, lazy branch sets
  // `component: never`; declaring both fails both overloads.
  defineEntry({
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
