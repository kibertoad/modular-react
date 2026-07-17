// Type-level tests for the journey-level `steps` metadata map (item 4).
// The map must be keyed against the journey's real modules and their
// journey-mountable entries, so a typo in a module id or entry name is a
// compile error rather than dead metadata that silently never matches.

import { test } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import { defineJourney } from "./define-journey.js";

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
