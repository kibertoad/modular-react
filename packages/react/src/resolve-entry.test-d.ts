// Type-level regression tests for `resolveEntryComponent` / `preloadEntry`.
// Runs through vitest's typecheck pass — assertions fail the suite if the
// resolved render surface (the `{ Component, preload }` pair) drifts from
// the documented contract.

import { expectTypeOf, test } from "vitest";
import type { ComponentType } from "react";
import { defineEntry, schema, type ModuleEntryProps } from "@modular-react/core";

import { type ResolvedEntry, preloadEntry, resolveEntryComponent } from "./resolve-entry.js";

interface MyInput {
  readonly id: string;
}
const Component = ((_props: ModuleEntryProps<MyInput, any>) => null) as ComponentType<
  ModuleEntryProps<MyInput, any>
>;

// -----------------------------------------------------------------------------
// `resolveEntryComponent` — uniform return shape across both variants.
// -----------------------------------------------------------------------------

test("resolveEntryComponent returns ResolvedEntry for an eager entry", () => {
  const entry = defineEntry({ component: Component, input: schema<MyInput>() });
  expectTypeOf(resolveEntryComponent(entry)).toEqualTypeOf<ResolvedEntry>();
});

test("resolveEntryComponent returns ResolvedEntry for a lazy entry", () => {
  const entry = defineEntry({
    lazy: () => Promise.resolve({ default: Component }),
    input: schema<MyInput>(),
  });
  expectTypeOf(resolveEntryComponent(entry)).toEqualTypeOf<ResolvedEntry>();
});

test("ResolvedEntry exposes Component (renderable) and preload (Promise<unknown>)", () => {
  expectTypeOf<ResolvedEntry["Component"]>().toMatchTypeOf<ComponentType<any>>();
  expectTypeOf<ResolvedEntry["preload"]>().toMatchTypeOf<() => Promise<unknown>>();
});

test("preloadEntry is the convenience wrapper — same return type as resolveEntryComponent(...).preload()", () => {
  const entry = defineEntry({ lazy: () => Promise.resolve({ default: Component }) });
  expectTypeOf(preloadEntry(entry)).toEqualTypeOf<Promise<unknown>>();
});

test("preloadEntry accepts an eager entry too (returns a resolved promise)", () => {
  const entry = defineEntry({ component: Component });
  expectTypeOf(preloadEntry(entry)).toEqualTypeOf<Promise<unknown>>();
});
