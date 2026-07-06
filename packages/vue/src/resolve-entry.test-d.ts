// Type-level regression tests for `resolveEntryComponent` / `preloadEntry`.
// Runs through vitest's typecheck pass — assertions fail the suite if the
// resolved render surface (the `{ Component, preload }` pair) drifts from the
// documented contract.

import { expectTypeOf, test } from "vitest";
import type { Component } from "vue";
import { defineEntry, schema, type ModuleEntryProps } from "@modular-frontend/core";

import { type ResolvedEntry, preloadEntry, resolveEntryComponent } from "./resolve-entry.js";

interface MyInput {
  readonly id: string;
}
// A plain functional component satisfies the neutral `UiComponent` call arm
// (`(props) => any`) — the same shape a real Vue entry component takes.
const EntryComponent = (_props: ModuleEntryProps<MyInput, any>) => null;

// -----------------------------------------------------------------------------
// `resolveEntryComponent` — uniform return shape across both variants.
// -----------------------------------------------------------------------------

test("resolveEntryComponent returns ResolvedEntry for an eager entry", () => {
  const entry = defineEntry({ component: EntryComponent, input: schema<MyInput>() });
  expectTypeOf(resolveEntryComponent(entry)).toEqualTypeOf<ResolvedEntry>();
});

test("resolveEntryComponent returns ResolvedEntry for a lazy entry", () => {
  const entry = defineEntry({
    lazy: () => Promise.resolve({ default: EntryComponent }),
    input: schema<MyInput>(),
  });
  expectTypeOf(resolveEntryComponent(entry)).toEqualTypeOf<ResolvedEntry>();
});

test("ResolvedEntry exposes Component (renderable) and preload (Promise<unknown>)", () => {
  expectTypeOf<ResolvedEntry["Component"]>().toMatchTypeOf<Component>();
  expectTypeOf<ResolvedEntry["preload"]>().toMatchTypeOf<() => Promise<unknown>>();
});

test("preloadEntry is the convenience wrapper — same return type as resolveEntryComponent(...).preload()", () => {
  const entry = defineEntry({ lazy: () => Promise.resolve({ default: EntryComponent }) });
  expectTypeOf(preloadEntry(entry)).toEqualTypeOf<Promise<unknown>>();
});

test("preloadEntry accepts an eager entry too (returns a resolved promise)", () => {
  const entry = defineEntry({ component: EntryComponent });
  expectTypeOf(preloadEntry(entry)).toEqualTypeOf<Promise<unknown>>();
});

// Keep the `ModuleEntryProps` import meaningful: a lazy entry's component is
// expected to accept the host-provided props.
test("ModuleEntryProps names the entry component's prop contract", () => {
  expectTypeOf<ModuleEntryProps<MyInput>["input"]>().toEqualTypeOf<MyInput>();
});
