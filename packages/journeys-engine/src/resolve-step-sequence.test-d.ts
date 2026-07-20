// Type-level tests for the journey-level `steps` metadata map (item 4).
// The map must be keyed against the journey's real modules and their
// journey-mountable entries, so a typo in a module id or entry name is a
// compile error rather than dead metadata that silently never matches.

import { test } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import { defineJourney } from "./define-journey.js";
import { resolveStepSequence } from "./resolve-step-sequence.js";

const plan = defineModule({
  id: "plan",
  version: "1.0.0",
  exitPoints: { chosen: defineExit() },
  entryPoints: {
    choose: defineEntry({ component: (() => null) as never, input: schema<{ readonly x: 1 }>() }),
  },
});

type Modules = { readonly plan: typeof plan };
interface State {
  readonly done: boolean;
}

test("`steps` accepts declared module + entry keys with JourneyStepMeta values", () => {
  defineJourney<Modules, State>()({
    id: "j",
    version: "1.0.0",
    initialState: () => ({ done: false }),
    start: () => ({ module: "plan", entry: "choose", input: { x: 1 } }),
    steps: {
      plan: { choose: { path: "plan", progressLabel: "Pick a plan" } },
    },
    transitions: {},
  });
});

test("`steps` rejects an unknown module id", () => {
  defineJourney<Modules, State>()({
    id: "j",
    version: "1.0.0",
    initialState: () => ({ done: false }),
    start: () => ({ module: "plan", entry: "choose", input: { x: 1 } }),
    steps: {
      // @ts-expect-error — "nope" is not a module in `Modules`.
      nope: { choose: { path: "x" } },
    },
    transitions: {},
  });
});

test("`steps` rejects an unknown entry name on a real module", () => {
  defineJourney<Modules, State>()({
    id: "j",
    version: "1.0.0",
    initialState: () => ({ done: false }),
    start: () => ({ module: "plan", entry: "choose", input: { x: 1 } }),
    steps: {
      // @ts-expect-error — `plan` declares `choose`, not `missing`.
      plan: { missing: { path: "x" } },
    },
    transitions: {},
  });
});

test("`steps` rejects an unknown key on JourneyStepMeta", () => {
  defineJourney<Modules, State>()({
    id: "j",
    version: "1.0.0",
    initialState: () => ({ done: false }),
    start: () => ({ module: "plan", entry: "choose", input: { x: 1 } }),
    steps: {
      // @ts-expect-error — `title` is not a field of JourneyStepMeta.
      plan: { choose: { title: "x" } },
    },
    transitions: {},
  });
});

// --- `resolveStepSequence` options: input required for non-void journeys -----
// A journey whose `initialState` consumes a non-void input must not be walked
// without supplying that input (or an explicit `start`) — otherwise the walk
// calls `initialState(undefined)`. The type must reject the bare call.

// `initialState` takes no parameter → `TInput` is `void`.
const voidInput = defineJourney<Modules, State>()({
  id: "j",
  version: "1.0.0",
  initialState: () => ({ done: false }),
  start: () => ({ module: "plan", entry: "choose", input: { x: 1 } }),
  transitions: {},
});

// `initialState` consumes an input → `TInput` is `{ token: string }`.
const nonVoidInput = defineJourney<Modules, State>()({
  id: "j",
  version: "1.0.0",
  initialState: (input: { readonly token: string }) => ({ done: input.token === "" }),
  start: () => ({ module: "plan", entry: "choose", input: { x: 1 } }),
  transitions: {},
});

test("resolveStepSequence: void-input journey needs no options", () => {
  resolveStepSequence(voidInput);
  resolveStepSequence(voidInput, {});
  resolveStepSequence(voidInput, { maxSteps: 2 });
});

test("resolveStepSequence: non-void-input journey rejects a missing/empty start", () => {
  // @ts-expect-error — non-void input: `input` or `start` is required.
  resolveStepSequence(nonVoidInput);
  // @ts-expect-error — empty options still omit `input`/`start`.
  resolveStepSequence(nonVoidInput, {});
  // @ts-expect-error — walk-only options don't satisfy the input requirement.
  resolveStepSequence(nonVoidInput, { maxSteps: 2 });
});

test("resolveStepSequence: non-void-input journey accepts `input` or `start`", () => {
  resolveStepSequence(nonVoidInput, { input: { token: "t" } });
  resolveStepSequence(nonVoidInput, { start: { module: "plan", entry: "choose" } });
  // `start` skips the factories, so it may stand alone alongside walk options.
  resolveStepSequence(nonVoidInput, { start: { module: "plan", entry: "choose" }, maxSteps: 2 });
});

test("resolveStepSequence: non-void-input journey rejects a wrong-typed `input`", () => {
  // @ts-expect-error — `input` must match the journey's `TInput`.
  resolveStepSequence(nonVoidInput, { input: { token: 1 } });
});

// --- `start` / `branch` refs are checked against the module vocabulary -------
// An explicit `start` (and a `branch` return) must name a real `(module, entry)`
// pair — a typo should be a compile error, not a fake step the walk emits.

test("resolveStepSequence: `start` accepts a declared (module, entry) pair", () => {
  resolveStepSequence(voidInput, { start: { module: "plan", entry: "choose" } });
});

test("resolveStepSequence: `start` rejects an unknown module id", () => {
  // @ts-expect-error — "typo" is not a module in `Modules`.
  resolveStepSequence(voidInput, { start: { module: "typo", entry: "choose" } });
});

test("resolveStepSequence: `start` rejects an unknown entry name on a real module", () => {
  // @ts-expect-error — `plan` declares `choose`, not `missing`.
  resolveStepSequence(voidInput, { start: { module: "plan", entry: "missing" } });
});

test("resolveStepSequence: `branch` must return one of the journey's steps", () => {
  resolveStepSequence(voidInput, {
    // @ts-expect-error — a fabricated (module, entry) is not a valid branch pick.
    branch: () => ({ module: "typo", entry: "missing" }),
  });
});
