import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
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
  const runtime = createJourneyRuntime([{ definition: journey, options: undefined }], {
    modules: { a: stepA, b: stepB },
  });
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

describe("runtime.canGoBack(id)", () => {
  it("returns false for unknown ids", () => {
    const { runtime } = setup();
    expect(runtime.canGoBack("does-not-exist")).toBe(false);
  });

  it("returns false at the start of a journey (history empty)", () => {
    const { runtime, id } = setup();
    expect(runtime.getInstance(id)?.history).toHaveLength(0);
    expect(runtime.canGoBack(id)).toBe(false);
  });

  it("returns false when the active transition does not declare allowBack", () => {
    // Step `a` has `allowBack: "preserve-state"` on the entry but the
    // journey transition out of `a` does NOT set `allowBack: true`. The
    // predicate must reject this case — otherwise a shell would render
    // an enabled Back button that does nothing.
    const { runtime, id } = setup();
    expect(runtime.canGoBack(id)).toBe(false);
  });

  it("returns true once the journey has advanced into a step with allowBack", () => {
    const { runtime, id, harness } = setup();
    harness.fireExit(id, "next");
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");
    // `b`'s transition declares `allowBack: true` and its entry
    // declares `allowBack: "preserve-state"` — both opt-ins satisfied.
    expect(runtime.canGoBack(id)).toBe(true);
  });

  it("flips back to false after the back actually fires", () => {
    const { runtime, id, harness } = setup();
    harness.fireExit(id, "next");
    expect(runtime.canGoBack(id)).toBe(true);
    runtime.goBack(id);
    // We popped back to `a`, whose transition has no allowBack opt-in.
    expect(runtime.canGoBack(id)).toBe(false);
  });

  it("returns false for terminal instances", () => {
    const { runtime, id, harness } = setup();
    harness.fireExit(id, "next");
    harness.fireExit(id, "next"); // completes
    expect(runtime.getInstance(id)?.status).toBe("completed");
    expect(runtime.canGoBack(id)).toBe(false);
  });
});

describe("entry opt-out (allowBack: false on the active entry)", () => {
  // Lock in that the id-based `runtime.goBack` and the `canGoBack`
  // predicate honour an entry-level opt-out the same way the step prop
  // (`ModuleEntryProps.goBack`) does. Without this both paths could
  // disagree — and a shell calling `runtime.goBack(id)` would rewind
  // out of a step the module had explicitly declared non-rewindable.
  // Note: `validateJourney` flags this combination as a config issue,
  // but the runtime should still be defensive if validation is skipped.
  function setupWithEntryOptOut() {
    const exits = { next: defineExit() } as const;
    const stepIn = defineModule({
      id: "in",
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
    const stepOut = defineModule({
      id: "out",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        show: defineEntry({
          component: (() => null) as never,
          input: schema<void>(),
          allowBack: false,
        }),
      },
    });
    type Mods = { readonly in: typeof stepIn; readonly out: typeof stepOut };
    const journey = defineJourney<Mods, Record<string, never>>()({
      id: "entry-opt-out",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "in", entry: "show", input: undefined }),
      transitions: {
        in: {
          show: {
            next: () => ({ next: { module: "out", entry: "show", input: undefined } }),
          },
        },
        out: {
          show: {
            allowBack: true,
            next: () => ({ complete: undefined }),
          },
        },
      },
    });
    const runtime = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: { in: stepIn, out: stepOut },
    });
    const id = runtime.start(journey.id, undefined);
    return { runtime, id, harness: createTestHarness(runtime) };
  }

  it("canGoBack returns false even when the journey transition opts in", () => {
    const { runtime, id, harness } = setupWithEntryOptOut();
    harness.fireExit(id, "next");
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("out");
    expect(runtime.canGoBack(id)).toBe(false);
  });

  it("runtime.goBack(id) no-ops to match the canGoBack contract", () => {
    const { runtime, id, harness } = setupWithEntryOptOut();
    harness.fireExit(id, "next");
    runtime.goBack(id);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("out");
    expect(runtime.getInstance(id)?.history).toHaveLength(1);
  });
});
