import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { describe, expect, it } from "vitest";

import { defineJourney } from "./define-journey.js";
import { createJourneyRuntime } from "./runtime.js";
import { createTestHarness } from "./testing.js";

const exits = {
  next: defineExit(),
} as const;

const stepA = defineModule({
  id: "a",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    show: defineEntry({
      component: (() => null) as never,
      input: schema<void>(),
      allowBack: "preserve-state",
    }),
  },
});

const stepB = defineModule({
  id: "b",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    show: defineEntry({
      component: (() => null) as never,
      input: schema<void>(),
      allowBack: "preserve-state",
    }),
  },
});

type Modules = { readonly a: typeof stepA; readonly b: typeof stepB };

const journey = defineJourney<Modules, Record<string, never>>()({
  id: "two-step",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  transitions: {
    a: {
      show: {
        next: () => ({ next: { module: "b", entry: "show", input: undefined } }),
      },
    },
    b: {
      show: {
        allowBack: true,
        next: () => ({ complete: undefined }),
      },
    },
  },
});

function setup() {
  const runtime = createJourneyRuntime(
    [{ definition: journey, options: undefined }],
    { modules: { a: stepA, b: stepB } },
  );
  const id = runtime.start(journey.id, undefined);
  const harness = createTestHarness(runtime);
  return { runtime, id, harness };
}

describe("runtime.goBack(id)", () => {
  it("pops the current step back to the previous one", () => {
    const { runtime, id, harness } = setup();
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("a");

    harness.fireExit(id, "next");
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");

    runtime.goBack(id);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("a");
    expect(runtime.getInstance(id)?.history).toHaveLength(0);
  });

  it("is a no-op for unknown ids", () => {
    const { runtime } = setup();
    expect(() => runtime.goBack("does-not-exist")).not.toThrow();
  });

  it("is a no-op when the journey transition does not declare allowBack", () => {
    const { runtime, id } = setup();
    // On the initial step (a) the journey's transition declares no
    // `allowBack` — calling goBack must silently no-op without throwing.
    runtime.goBack(id);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("a");
    expect(runtime.getInstance(id)?.history).toHaveLength(0);
  });
});
