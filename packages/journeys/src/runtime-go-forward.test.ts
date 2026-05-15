import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { describe, expect, it, vi } from "vitest";

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

const stepC = defineModule({
  id: "c",
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

type Modules = {
  readonly a: typeof stepA;
  readonly b: typeof stepB;
  readonly c: typeof stepC;
};

interface State {
  readonly stamp: number;
}

const journey = defineJourney<Modules, State>()({
  id: "three-step",
  version: "1.0.0",
  initialState: () => ({ stamp: 0 }),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  transitions: {
    a: {
      show: {
        next: ({ state }) => ({
          state: { stamp: state.stamp + 1 },
          next: { module: "b", entry: "show", input: undefined },
        }),
      },
    },
    b: {
      show: {
        allowBack: true,
        next: ({ state }) => ({
          state: { stamp: state.stamp + 10 },
          next: { module: "c", entry: "show", input: undefined },
        }),
      },
    },
    c: {
      show: {
        allowBack: true,
        next: ({ state }) => ({ state, complete: undefined }),
      },
    },
  },
});

function setup() {
  const runtime = createJourneyRuntime([{ definition: journey, options: undefined }], {
    modules: { a: stepA, b: stepB, c: stepC },
  });
  const id = runtime.start(journey.id, undefined);
  const harness = createTestHarness(runtime);
  return { runtime, id, harness };
}

describe("runtime.goForward(id)", () => {
  it("re-applies the last goBack — restores the step the user just rewound from", () => {
    const { runtime, id, harness } = setup();

    harness.fireExit(id, "next"); // a → b
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");

    runtime.goBack(id);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("a");

    runtime.goForward(id);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");
  });

  it("restores the state captured at the rewound step (not the rolled-back state)", () => {
    const { runtime, id, harness } = setup();

    expect(runtime.getInstance(id)?.state).toEqual({ stamp: 0 });
    harness.fireExit(id, "next"); // a → b, state becomes { stamp: 1 }
    expect(runtime.getInstance(id)?.state).toEqual({ stamp: 1 });

    runtime.goBack(id);
    // `preserve-state` keeps state at the rolled-back value (no
    // rollback snapshot was taken because the entry isn't 'rollback'
    // mode), so state stays as {stamp:1} after the rewind.
    expect(runtime.getInstance(id)?.state).toEqual({ stamp: 1 });

    runtime.goForward(id);
    // Redo restores the post-transition state captured at the moment
    // of `goBack` — same { stamp: 1 } reference content here.
    expect(runtime.getInstance(id)?.state).toEqual({ stamp: 1 });
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");
  });

  it("works across multiple rewinds: back twice, forward twice", () => {
    const { runtime, id, harness } = setup();

    harness.fireExit(id, "next"); // a → b
    harness.fireExit(id, "next"); // b → c
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("c");

    runtime.goBack(id);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");
    runtime.goBack(id);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("a");

    runtime.goForward(id);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");
    runtime.goForward(id);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("c");
  });

  it("is a no-op when the future stack is empty (no preceding goBack)", () => {
    const { runtime, id, harness } = setup();

    harness.fireExit(id, "next");
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");

    runtime.goForward(id);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");
  });

  it("is a no-op for unknown ids", () => {
    const { runtime } = setup();
    expect(() => runtime.goForward("does-not-exist")).not.toThrow();
  });

  it("is a no-op on a loading instance", async () => {
    // Async persistence holds the instance in `status: "loading"` while
    // `load()` is unresolved. `goForward` must be safe to call in that
    // window — the `status !== "active"` guard short-circuits before
    // any state mutation.
    let resolveLoad: (blob: unknown) => void = () => {};
    const loadPromise = new Promise<unknown>((r) => {
      resolveLoad = r;
    });
    const rt = createJourneyRuntime(
      [
        {
          definition: journey,
          options: {
            persistence: {
              keyFor: () => "k:goforward-loading",
              load: () => loadPromise,
              save: async () => {},
              remove: async () => {},
            } as never,
          },
        },
      ],
      { modules: { a: stepA, b: stepB, c: stepC } },
    );
    const id = rt.start(journey.id, undefined);
    expect(rt.getInstance(id)?.status).toBe("loading");

    expect(() => rt.goForward(id)).not.toThrow();
    expect(rt.getInstance(id)?.status).toBe("loading");
    expect(rt.getInstance(id)?.future).toEqual([]);

    // Let the load settle so the test doesn't leak a pending promise
    // into the next case.
    resolveLoad(null);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("is a no-op on a terminal instance", () => {
    const { runtime, id, harness } = setup();

    harness.fireExit(id, "next"); // a → b
    runtime.goBack(id); // rewind so the future stack is non-empty
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("a");

    runtime.end(id);
    expect(runtime.getInstance(id)?.status).toBe("aborted");

    runtime.goForward(id);
    // Terminal instance must not get pulled back into "active" by a
    // stray redo call — the guard short-circuits before any state
    // mutation.
    expect(runtime.getInstance(id)?.status).toBe("aborted");
  });

  it("a fresh exit-driven transition clears the future stack (browser semantics)", () => {
    const { runtime, id, harness } = setup();

    harness.fireExit(id, "next"); // a → b
    harness.fireExit(id, "next"); // b → c
    runtime.goBack(id); // c → b — future now has [c]
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");

    // User re-submits from step b — a new forward navigation. The
    // forward stack should drop, just like a browser does when the
    // user navigates somewhere new from a back-pressed location.
    harness.fireExit(id, "next");
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("c");

    runtime.goForward(id);
    // Future was cleared by the exit above; the redo is now a no-op
    // and we stay at c.
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("c");
  });

  it("restores history + rollbackSnapshots so subsequent goBack still works", () => {
    const { runtime, id, harness } = setup();

    harness.fireExit(id, "next"); // a → b
    expect(runtime.getInstance(id)?.history).toHaveLength(1);

    runtime.goBack(id);
    expect(runtime.getInstance(id)?.history).toHaveLength(0);

    runtime.goForward(id);
    // After redo, the rewound step is back at the top of history so
    // pressing Back again behaves identically to before the rewind.
    expect(runtime.getInstance(id)?.history).toHaveLength(1);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");

    runtime.goBack(id);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("a");
  });

  it("exposes the redo target on the public JourneyInstance.future snapshot", () => {
    const { runtime, id, harness } = setup();

    expect(runtime.getInstance(id)?.future).toEqual([]);

    harness.fireExit(id, "next"); // a → b
    expect(runtime.getInstance(id)?.future).toEqual([]);

    runtime.goBack(id); // b → a, future now [b]
    const future = runtime.getInstance(id)?.future ?? [];
    expect(future).toHaveLength(1);
    // Top of stack = next redo target. The full FutureEntry (state +
    // snapshot) is internal; the public surface is just bare steps.
    expect(future[future.length - 1]?.moduleId).toBe("b");
    expect(future[future.length - 1]?.entry).toBe("show");

    runtime.goForward(id);
    expect(runtime.getInstance(id)?.future).toEqual([]);
  });

  // Caveat: in practice the future stack is always empty by the time a
  // child is in flight (`goBack` is itself a no-op during invoke, and
  // exit-driven `invoke` clears `future` via `applyTransition`), so the
  // assertion below effectively exercises the empty-future guard rather
  // than the `activeChildId` guard. Real coverage of the latter would
  // need to mutate `record.future` directly, which we don't do. Keeping
  // the test as a "no mutation while a child is in flight" safety net.
  it("does not mutate the runtime while a child journey is in flight", () => {
    const childExits = { done: defineExit() } as const;
    const childMod = defineModule({
      id: "child",
      version: "1.0.0",
      exitPoints: childExits,
      entryPoints: {
        show: defineEntry({
          component: (() => null) as never,
          input: schema<void>(),
          allowBack: "preserve-state",
        }),
      },
    });
    type ChildModules = { readonly child: typeof childMod };
    const child = defineJourney<ChildModules, Record<string, never>>()({
      id: "child",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "child", entry: "show", input: undefined }),
      transitions: { child: { show: { done: () => ({ complete: undefined }) } } },
    });

    const parentExits = { next: defineExit(), invokeChild: defineExit() } as const;
    const parentMod = defineModule({
      id: "p",
      version: "1.0.0",
      exitPoints: parentExits,
      entryPoints: {
        a: defineEntry({
          component: (() => null) as never,
          input: schema<void>(),
          allowBack: "preserve-state",
        }),
        b: defineEntry({
          component: (() => null) as never,
          input: schema<void>(),
          allowBack: "preserve-state",
        }),
      },
    });
    type ParentModules = { readonly p: typeof parentMod };
    const parent = defineJourney<ParentModules, Record<string, never>>()({
      id: "parent-invoke",
      version: "1.0.0",
      invokes: [{ id: "child", __input: undefined } as never],
      initialState: () => ({}),
      start: () => ({ module: "p", entry: "a", input: undefined }),
      transitions: {
        p: {
          a: {
            next: () => ({ next: { module: "p", entry: "b", input: undefined } }),
          },
          b: {
            allowBack: true,
            invokeChild: () => ({
              invoke: { handle: { id: "child" } as never, input: undefined, resume: "back" },
            }),
          },
        },
      },
      resumes: {
        p: {
          b: {
            back: ({ state }) => ({ state }),
          },
        },
      },
    });

    const runtime = createJourneyRuntime(
      [
        { definition: parent, options: undefined },
        { definition: child, options: undefined },
      ],
      { modules: { p: parentMod, child: childMod } },
    );
    const id = runtime.start(parent.id, undefined);
    const harness = createTestHarness(runtime);

    harness.fireExit(id, "next"); // a → b
    runtime.goBack(id); // b → a, future has [b]
    expect(runtime.getInstance(id)?.future).toHaveLength(1);

    // Re-advance to b, then invoke a child from b.
    harness.fireExit(id, "next"); // a → b (clears future)
    expect(runtime.getInstance(id)?.future).toHaveLength(0);
    harness.fireExit(id, "invokeChild"); // b invokes child
    expect(runtime.getInstance(id)?.activeChildId).not.toBeNull();

    // Even if we tried to populate the future stack now, `goBack` on the
    // parent is also a no-op while a child is in flight — so there's no
    // realistic way to have a non-empty future and an active child
    // concurrently. The behavior still has to be safe: assert
    // goForward doesn't mutate.
    const before = runtime.getInstance(id)?.step;
    runtime.goForward(id);
    expect(runtime.getInstance(id)?.step).toEqual(before);
  });

  it("re-arms hasRollbackSnapshot on goForward of a rollback-mode entry", () => {
    // Use a journey whose target step opts into 'rollback' mode so
    // applyTransition captures a real (non-undefined) snapshot at the
    // pre-transition state.
    const exits2 = { advance: defineExit() } as const;
    const start = defineModule({
      id: "start",
      version: "1.0.0",
      exitPoints: exits2,
      entryPoints: {
        show: defineEntry({
          component: (() => null) as never,
          input: schema<void>(),
          allowBack: "rollback",
        }),
      },
    });
    const target = defineModule({
      id: "target",
      version: "1.0.0",
      exitPoints: exits2,
      entryPoints: {
        show: defineEntry({
          component: (() => null) as never,
          input: schema<void>(),
          allowBack: "rollback",
        }),
      },
    });
    type Mods = { readonly start: typeof start; readonly target: typeof target };
    const j = defineJourney<Mods, { stamp: number }>()({
      id: "rollback-redo",
      version: "1.0.0",
      initialState: () => ({ stamp: 0 }),
      start: () => ({ module: "start", entry: "show", input: undefined }),
      transitions: {
        start: {
          show: {
            advance: ({ state }) => ({
              state: { stamp: state.stamp + 1 },
              next: { module: "target", entry: "show", input: undefined },
            }),
          },
        },
        target: {
          show: {
            allowBack: true,
            advance: ({ state }) => ({ state, complete: undefined }),
          },
        },
      },
    });

    const runtime = createJourneyRuntime([{ definition: j, options: undefined }], {
      modules: { start, target },
    });
    const id = runtime.start(j.id, undefined);
    const harness = createTestHarness(runtime);

    harness.fireExit(id, "advance"); // start → target, state becomes {stamp:1}
    expect(runtime.getInstance(id)?.state).toEqual({ stamp: 1 });

    runtime.goBack(id);
    // Rollback restored the pre-transition state.
    expect(runtime.getInstance(id)?.state).toEqual({ stamp: 0 });
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("start");

    runtime.goForward(id);
    // Captured post-transition state restored verbatim — this is the
    // documented "edits between rewind and redo are discarded" path.
    expect(runtime.getInstance(id)?.state).toEqual({ stamp: 1 });
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("target");

    // Going back again must still rewind correctly, which depends on
    // the popped snapshot being re-attached to rollbackSnapshots and
    // the `hasRollbackSnapshot` flag being recomputed.
    runtime.goBack(id);
    expect(runtime.getInstance(id)?.state).toEqual({ stamp: 0 });
  });

  it("notifies subscribers on goForward", () => {
    // useSyncExternalStore-backed hooks depend on this — without a
    // notify call the React tree wouldn't observe the redo.
    const { runtime, id, harness } = setup();
    harness.fireExit(id, "next");
    runtime.goBack(id);

    let notified = 0;
    const unsubscribe = runtime.subscribe(id, () => {
      notified += 1;
    });
    runtime.goForward(id);
    unsubscribe();

    expect(notified).toBeGreaterThan(0);
  });

  it("canGoForward mirrors the guards: empty future stack → false", () => {
    const { runtime, id, harness } = setup();
    expect(runtime.canGoForward(id)).toBe(false);
    harness.fireExit(id, "next"); // a → b; future still empty (no rewind)
    expect(runtime.canGoForward(id)).toBe(false);
  });

  it("canGoForward becomes true after a rewind, false again after the redo fires", () => {
    const { runtime, id, harness } = setup();
    harness.fireExit(id, "next"); // a → b
    runtime.goBack(id);           // b → a, future has [b]
    expect(runtime.canGoForward(id)).toBe(true);
    runtime.goForward(id);
    expect(runtime.canGoForward(id)).toBe(false);
  });

  it("canGoForward returns false for unknown ids and terminal instances", () => {
    const { runtime, id, harness } = setup();
    expect(runtime.canGoForward("does-not-exist")).toBe(false);

    harness.fireExit(id, "next");
    runtime.goBack(id);
    expect(runtime.canGoForward(id)).toBe(true);
    runtime.end(id);
    expect(runtime.getInstance(id)?.status).toBe("aborted");
    expect(runtime.canGoForward(id)).toBe(false);
  });

  it("persists the post-redo blob so a reload would restore the redone step", async () => {
    // The redo path isn't persistence-aware on its own — it relies on
    // the same `schedulePersist` call every other transition path
    // makes. Pin the contract: after goBack + goForward, the most
    // recent saved blob should reflect the redone step, not the
    // pre-redo state.
    const store = new Map<string, unknown>();
    const persistence = {
      keyFor: () => "two-step:goforward",
      load: (k: string) => (store.get(k) as any) ?? null,
      save: vi.fn(async (k: string, b: any) => {
        store.set(k, b);
      }),
      remove: async (k: string) => {
        store.delete(k);
      },
    };
    const rt = createJourneyRuntime(
      [{ definition: journey, options: { persistence: persistence as never } }],
      { modules: { a: stepA, b: stepB, c: stepC } },
    );
    const id = rt.start(journey.id, undefined);
    const harness = createTestHarness(rt);

    harness.fireExit(id, "next"); // a → b
    rt.goBack(id);                // b → a, future has [b]
    persistence.save.mockClear();

    rt.goForward(id);             // a → b again
    // Let the scheduled persist micro-task flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(persistence.save).toHaveBeenCalled();
    const blob = persistence.save.mock.calls.at(-1)?.[1] as { step?: { moduleId: string } };
    expect(blob?.step?.moduleId).toBe("b");
  });
});
