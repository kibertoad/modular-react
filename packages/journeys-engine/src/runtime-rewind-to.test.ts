import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import { describe, expect, it, vi } from "vitest";

import { defineJourney } from "./define-journey.js";
import { createJourneyRuntime } from "./runtime.js";
import { createTestHarness } from "./testing.js";

const exits = {
  next: defineExit(),
} as const;

// Five-step linear journey a → b → c → d → e. All entries are
// `preserve-state` and every transition that has a back-flow opts in
// via `allowBack: true`, so multi-step rewinds can traverse the
// entire history.
function makeStep(id: string) {
  return defineModule({
    id,
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
}

const stepA = makeStep("a");
const stepB = makeStep("b");
const stepC = makeStep("c");
const stepD = makeStep("d");
const stepE = makeStep("e");

type Modules = {
  readonly a: typeof stepA;
  readonly b: typeof stepB;
  readonly c: typeof stepC;
  readonly d: typeof stepD;
  readonly e: typeof stepE;
};

interface State {
  readonly stamp: number;
}

const journey = defineJourney<Modules, State>()({
  id: "five-step",
  version: "1.0.0",
  initialState: () => ({ stamp: 0 }),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  transitions: {
    a: {
      show: {
        // First hop has no allowBack — there's nothing to rewind from `a`.
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
        next: ({ state }) => ({
          state: { stamp: state.stamp + 100 },
          next: { module: "d", entry: "show", input: undefined },
        }),
      },
    },
    d: {
      show: {
        allowBack: true,
        next: ({ state }) => ({
          state: { stamp: state.stamp + 1000 },
          next: { module: "e", entry: "show", input: undefined },
        }),
      },
    },
    e: {
      show: {
        allowBack: true,
        next: ({ state }) => ({ state, complete: undefined }),
      },
    },
  },
});

function setup() {
  const runtime = createJourneyRuntime([{ definition: journey, options: undefined }], {
    modules: { a: stepA, b: stepB, c: stepC, d: stepD, e: stepE },
  });
  const id = runtime.start(journey.id, undefined);
  const harness = createTestHarness(runtime);
  // Advance all the way to `e`. After this every test starts with
  // history = [a,b,c,d], step = e, state.stamp = 1111.
  harness.fireExit(id, "next"); // a → b
  harness.fireExit(id, "next"); // b → c
  harness.fireExit(id, "next"); // c → d
  harness.fireExit(id, "next"); // d → e
  return { runtime, id, harness };
}

describe("runtime.rewindTo(id, historyIndex)", () => {
  it("rewinds to the named historical frame in one call", () => {
    const { runtime, id } = setup();
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("e");

    runtime.rewindTo(id, 1); // land on b
    const inst = runtime.getInstance(id);
    expect(inst?.step?.moduleId).toBe("b");
    expect(inst?.history.map((s) => s.moduleId)).toEqual(["a"]);
    expect(inst?.future.map((s) => s.moduleId)).toEqual(["e", "d", "c"]);
  });

  it("preserves state across the rewind when every frame is preserve-state", () => {
    // None of the entries on the chain are rollback-mode, so the
    // accumulated state stays at 1111 — exactly the data the user has
    // entered on later steps, available for re-display when a form on
    // an earlier step uses `buildInput(state)`.
    const { runtime, id } = setup();
    expect(runtime.getInstance(id)?.state).toEqual({ stamp: 1111 });
    runtime.rewindTo(id, 0);
    expect(runtime.getInstance(id)?.state).toEqual({ stamp: 1111 });
  });

  it("a single-frame rewind matches a single goBack", () => {
    const { runtime, id } = setup();
    runtime.rewindTo(id, 3); // 1-frame rewind: e → d
    const a = runtime.getInstance(id);
    expect(a?.step?.moduleId).toBe("d");
    expect(a?.history.map((s) => s.moduleId)).toEqual(["a", "b", "c"]);
    expect(a?.future.map((s) => s.moduleId)).toEqual(["e"]);
  });

  it("matches the record shape that N successive goBack calls produce", () => {
    // Run the same logical 4-step rewind two ways and assert the
    // resulting public snapshots are equal in every observable field
    // (step / history / state / future). stepToken is excluded — that
    // is precisely the bookkeeping rewindTo collapses (1 bump vs N).
    const oneShot = setup();
    oneShot.runtime.rewindTo(oneShot.id, 0);
    const a = oneShot.runtime.getInstance(oneShot.id);

    const stepwise = setup();
    stepwise.runtime.goBack(stepwise.id);
    stepwise.runtime.goBack(stepwise.id);
    stepwise.runtime.goBack(stepwise.id);
    stepwise.runtime.goBack(stepwise.id);
    const b = stepwise.runtime.getInstance(stepwise.id);

    expect(a?.step).toEqual(b?.step);
    expect(a?.history).toEqual(b?.history);
    expect(a?.state).toEqual(b?.state);
    expect(a?.future).toEqual(b?.future);
  });

  it("goForward after a multi-step rewind redoes ONE step (chain semantics)", () => {
    // The future stack built by rewindTo is shape-identical to one
    // built by N successive goBack calls. goForward stays a one-step
    // redo so a user who clicked the breadcrumb by mistake can
    // un-click it incrementally.
    const { runtime, id } = setup();
    runtime.rewindTo(id, 0); // back to a, future = [e, d, c, b]
    runtime.goForward(id);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");
    expect(runtime.getInstance(id)?.future.map((s) => s.moduleId)).toEqual(["e", "d", "c"]);
  });

  it("fires onTransition exactly once with the from→to pair, not N times", () => {
    const onTransition = vi.fn();
    const runtime = createJourneyRuntime([{ definition: journey, options: { onTransition } }], {
      modules: { a: stepA, b: stepB, c: stepC, d: stepD, e: stepE },
    });
    const id = runtime.start(journey.id, undefined);
    const harness = createTestHarness(runtime);
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    onTransition.mockClear();

    runtime.rewindTo(id, 1);
    expect(onTransition).toHaveBeenCalledTimes(1);
    const evt = onTransition.mock.calls[0]?.[0];
    expect(evt?.from?.moduleId).toBe("e");
    expect(evt?.to?.moduleId).toBe("b");
  });

  it("notifies subscribers exactly once", () => {
    // useSyncExternalStore-backed hooks depend on this. Per-frame
    // notify would flash the UI through every intermediate step.
    const { runtime, id } = setup();
    let notified = 0;
    const unsubscribe = runtime.subscribe(id, () => {
      notified += 1;
    });
    runtime.rewindTo(id, 1);
    unsubscribe();
    expect(notified).toBe(1);
  });
});

describe("runtime.rewindTo: atomicity (no-op on any opt-out)", () => {
  // Build a journey where the middle transition omits `allowBack: true`.
  // Rewinding *past* that frame must be a no-op — equivalent to one of
  // the N goBack calls failing, but without leaving the user stranded.
  function setupWithMidwayOptOut() {
    const s1 = makeStep("s1");
    const s2 = makeStep("s2");
    const s3 = makeStep("s3");
    const s4 = makeStep("s4");
    type M = {
      readonly s1: typeof s1;
      readonly s2: typeof s2;
      readonly s3: typeof s3;
      readonly s4: typeof s4;
    };
    const j = defineJourney<M, Record<string, never>>()({
      id: "midway-opt-out",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "s1", entry: "show", input: undefined }),
      transitions: {
        s1: {
          show: { next: () => ({ next: { module: "s2", entry: "show", input: undefined } }) },
        },
        s2: {
          show: {
            // No `allowBack: true` here — rewinding past s2 must fail.
            next: () => ({ next: { module: "s3", entry: "show", input: undefined } }),
          },
        },
        s3: {
          show: {
            allowBack: true,
            next: () => ({ next: { module: "s4", entry: "show", input: undefined } }),
          },
        },
        s4: {
          show: { allowBack: true, next: () => ({ complete: undefined }) },
        },
      },
    });
    const runtime = createJourneyRuntime([{ definition: j, options: undefined }], {
      modules: { s1, s2, s3, s4 },
    });
    const id = runtime.start(j.id, undefined);
    const harness = createTestHarness(runtime);
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    return { runtime, id };
  }

  it("is a no-op when an intermediate frame's transition lacks allowBack: true", () => {
    const { runtime, id } = setupWithMidwayOptOut();
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("s4");
    const before = runtime.getInstance(id);

    // Rewinding to s1 would require leaving s2, whose transition
    // doesn't opt in. The whole call must no-op.
    runtime.rewindTo(id, 0);
    const after = runtime.getInstance(id);
    expect(after?.step).toEqual(before?.step);
    expect(after?.history).toEqual(before?.history);
    expect(after?.future).toEqual(before?.future);
    expect(after?.state).toEqual(before?.state);
  });

  it("permits a partial rewind that does NOT cross the opt-out frame", () => {
    // Rewinding to s3 only requires leaving s4. That's fine.
    const { runtime, id } = setupWithMidwayOptOut();
    runtime.rewindTo(id, 2);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("s3");
  });

  it("is a no-op when an intermediate entry declares allowBack: false", () => {
    // Mirror of the goBack entry-opt-out test, but for the multi-step
    // case: the middle frame opts out at the entry layer.
    const sIn = makeStep("in");
    const sBlock = defineModule({
      id: "block",
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
    const sOut = makeStep("out");
    type M = {
      readonly in: typeof sIn;
      readonly block: typeof sBlock;
      readonly out: typeof sOut;
    };
    const j = defineJourney<M, Record<string, never>>()({
      id: "entry-opt-out-chain",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "in", entry: "show", input: undefined }),
      transitions: {
        in: {
          show: {
            allowBack: true,
            next: () => ({ next: { module: "block", entry: "show", input: undefined } }),
          },
        },
        block: {
          show: {
            allowBack: true,
            next: () => ({ next: { module: "out", entry: "show", input: undefined } }),
          },
        },
        out: {
          show: { allowBack: true, next: () => ({ complete: undefined }) },
        },
      },
    });
    const runtime = createJourneyRuntime([{ definition: j, options: undefined }], {
      modules: { in: sIn, block: sBlock, out: sOut },
    });
    const id = runtime.start(j.id, undefined);
    const harness = createTestHarness(runtime);
    harness.fireExit(id, "next"); // in → block
    harness.fireExit(id, "next"); // block → out

    expect(runtime.getInstance(id)?.step?.moduleId).toBe("out");
    // Rewinding to `in` (index 0) would require leaving `block`, which
    // opts out at the entry layer. Must no-op.
    runtime.rewindTo(id, 0);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("out");
    expect(runtime.canRewindTo(id, 0)).toBe(false);
  });
});

describe("runtime.rewindTo: rollback semantics", () => {
  it("restores the pre-transition snapshot for each rollback-mode frame in the chain", () => {
    // Mid-chain step `mid` is rollback-mode. Rewinding past it must
    // restore the pre-mid state, matching what successive goBacks would
    // have done. The other frames are preserve-state, so they don't
    // touch state on the way through.
    const startMod = makeStep("start");
    const mid = defineModule({
      id: "mid",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        show: defineEntry({
          component: (() => null) as never,
          input: schema<void>(),
          allowBack: "rollback",
        }),
      },
    });
    const endMod = makeStep("end");
    type M = {
      readonly start: typeof startMod;
      readonly mid: typeof mid;
      readonly end: typeof endMod;
    };
    const j = defineJourney<M, { stamp: number }>()({
      id: "rollback-chain",
      version: "1.0.0",
      initialState: () => ({ stamp: 0 }),
      start: () => ({ module: "start", entry: "show", input: undefined }),
      transitions: {
        start: {
          show: {
            allowBack: true,
            next: ({ state }) => ({
              state: { stamp: state.stamp + 1 },
              next: { module: "mid", entry: "show", input: undefined },
            }),
          },
        },
        mid: {
          show: {
            allowBack: true,
            next: ({ state }) => ({
              state: { stamp: state.stamp + 10 },
              next: { module: "end", entry: "show", input: undefined },
            }),
          },
        },
        end: {
          show: { allowBack: true, next: ({ state }) => ({ state, complete: undefined }) },
        },
      },
    });
    const runtime = createJourneyRuntime([{ definition: j, options: undefined }], {
      modules: { start: startMod, mid, end: endMod },
    });
    const id = runtime.start(j.id, undefined);
    const harness = createTestHarness(runtime);
    // Entering mid (rollback) snapshots the pre-transition state ({stamp:0})
    // alongside the `start` history entry. The snapshot captures state
    // BEFORE start's transition's `state` write was applied.
    harness.fireExit(id, "next"); // start → mid, stamp = 1
    harness.fireExit(id, "next"); // mid → end, stamp = 11

    expect(runtime.getInstance(id)?.state).toEqual({ stamp: 11 });
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("end");

    // Multi-step rewind from end back to start. Chain leaves end then
    // mid. mid is rollback-mode → its captured pre-state (stamp:0)
    // wins. Final state must be {stamp:0}.
    runtime.rewindTo(id, 0);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("start");
    expect(runtime.getInstance(id)?.state).toEqual({ stamp: 0 });
  });

  it("matches what successive goBack calls would have produced on a rollback chain", () => {
    // Same fixture, compare against stepwise goBack.
    const startMod = makeStep("start");
    const mid = defineModule({
      id: "mid",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        show: defineEntry({
          component: (() => null) as never,
          input: schema<void>(),
          allowBack: "rollback",
        }),
      },
    });
    const endMod = makeStep("end");
    type M = {
      readonly start: typeof startMod;
      readonly mid: typeof mid;
      readonly end: typeof endMod;
    };
    const j = defineJourney<M, { stamp: number }>()({
      id: "rollback-chain-eq",
      version: "1.0.0",
      initialState: () => ({ stamp: 0 }),
      start: () => ({ module: "start", entry: "show", input: undefined }),
      transitions: {
        start: {
          show: {
            allowBack: true,
            next: ({ state }) => ({
              state: { stamp: state.stamp + 1 },
              next: { module: "mid", entry: "show", input: undefined },
            }),
          },
        },
        mid: {
          show: {
            allowBack: true,
            next: ({ state }) => ({
              state: { stamp: state.stamp + 10 },
              next: { module: "end", entry: "show", input: undefined },
            }),
          },
        },
        end: {
          show: { allowBack: true, next: ({ state }) => ({ state, complete: undefined }) },
        },
      },
    });
    const mkSetup = () => {
      const runtime = createJourneyRuntime([{ definition: j, options: undefined }], {
        modules: { start: startMod, mid, end: endMod },
      });
      const id = runtime.start(j.id, undefined);
      const h = createTestHarness(runtime);
      h.fireExit(id, "next");
      h.fireExit(id, "next");
      return { runtime, id };
    };

    const oneShot = mkSetup();
    oneShot.runtime.rewindTo(oneShot.id, 0);
    const a = oneShot.runtime.getInstance(oneShot.id);

    const stepwise = mkSetup();
    stepwise.runtime.goBack(stepwise.id);
    stepwise.runtime.goBack(stepwise.id);
    const b = stepwise.runtime.getInstance(stepwise.id);

    expect(a?.step).toEqual(b?.step);
    expect(a?.state).toEqual(b?.state);
    expect(a?.history).toEqual(b?.history);
    expect(a?.future).toEqual(b?.future);
  });
});

describe("runtime.rewindTo: buildInput", () => {
  it("runs buildInput exactly once — on the destination — not on intermediate frames", () => {
    const destinationBuild = vi.fn((state: { stamp: number }) => ({ derived: state.stamp }));
    const intermediateBuild = vi.fn((state: { stamp: number }) => ({ derived: state.stamp }));

    const dest = defineModule({
      id: "dest",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        show: defineEntry({
          component: (() => null) as never,
          input: schema<{ derived: number }>(),
          allowBack: "preserve-state",
          buildInput: destinationBuild,
        }),
      },
    });
    const mid = defineModule({
      id: "mid",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        show: defineEntry({
          component: (() => null) as never,
          input: schema<{ derived: number }>(),
          allowBack: "preserve-state",
          buildInput: intermediateBuild,
        }),
      },
    });
    const tail = makeStep("tail");
    type M = {
      readonly dest: typeof dest;
      readonly mid: typeof mid;
      readonly tail: typeof tail;
    };
    const j = defineJourney<M, { stamp: number }>()({
      id: "build-input-once",
      version: "1.0.0",
      initialState: () => ({ stamp: 0 }),
      start: () => ({ module: "dest", entry: "show", input: { derived: 0 } }),
      transitions: {
        dest: {
          show: {
            allowBack: true,
            next: ({ state }) => ({
              state: { stamp: state.stamp + 1 },
              next: { module: "mid", entry: "show", input: { derived: 1 } },
            }),
          },
        },
        mid: {
          show: {
            allowBack: true,
            next: ({ state }) => ({
              state: { stamp: state.stamp + 10 },
              next: { module: "tail", entry: "show", input: undefined },
            }),
          },
        },
        tail: {
          show: { allowBack: true, next: ({ state }) => ({ state, complete: undefined }) },
        },
      },
    });
    const runtime = createJourneyRuntime([{ definition: j, options: undefined }], {
      modules: { dest, mid, tail },
    });
    const id = runtime.start(j.id, undefined);
    const harness = createTestHarness(runtime);
    harness.fireExit(id, "next"); // dest → mid (mid's buildInput runs here, +1)
    harness.fireExit(id, "next"); // mid → tail
    destinationBuild.mockClear();
    intermediateBuild.mockClear();

    runtime.rewindTo(id, 0); // land on dest
    expect(destinationBuild).toHaveBeenCalledTimes(1);
    // mid is an intermediate frame on the rewind chain — it must NOT
    // re-run buildInput, since the user never sees that frame render.
    expect(intermediateBuild).toHaveBeenCalledTimes(0);
    // The destination's step input reflects the build against the final
    // post-rewind state.
    expect(runtime.getInstance(id)?.step?.input).toEqual({ derived: 11 });
  });
});

describe("runtime.rewindTo: guards", () => {
  it("is a no-op for unknown ids", () => {
    const { runtime } = setup();
    expect(() => runtime.rewindTo("does-not-exist", 0)).not.toThrow();
  });

  it("is a no-op for terminal instances", () => {
    const { runtime, id, harness } = setup();
    harness.fireExit(id, "next"); // completes
    expect(runtime.getInstance(id)?.status).toBe("completed");
    runtime.rewindTo(id, 0);
    expect(runtime.getInstance(id)?.status).toBe("completed");
  });

  it("is a no-op when historyIndex is out of range (negative)", () => {
    const { runtime, id } = setup();
    const before = runtime.getInstance(id);
    runtime.rewindTo(id, -1);
    expect(runtime.getInstance(id)?.step).toEqual(before?.step);
  });

  it("is a no-op when historyIndex >= history.length (names the current step)", () => {
    const { runtime, id } = setup();
    const before = runtime.getInstance(id);
    // history has 4 entries; index 4 names "the current step", which
    // is not in history. No-op.
    runtime.rewindTo(id, 4);
    expect(runtime.getInstance(id)?.step).toEqual(before?.step);
    expect(runtime.getInstance(id)?.history).toEqual(before?.history);
  });

  it("is a no-op when historyIndex is not an integer", () => {
    const { runtime, id } = setup();
    const before = runtime.getInstance(id);
    runtime.rewindTo(id, 1.5);
    expect(runtime.getInstance(id)?.step).toEqual(before?.step);
  });
});

describe("runtime.canRewindTo(id, historyIndex)", () => {
  it("returns false for unknown ids", () => {
    const { runtime } = setup();
    expect(runtime.canRewindTo("does-not-exist", 0)).toBe(false);
  });

  it("returns false when historyIndex is out of range", () => {
    const { runtime, id } = setup();
    expect(runtime.canRewindTo(id, -1)).toBe(false);
    expect(runtime.canRewindTo(id, 4)).toBe(false); // names current step
    expect(runtime.canRewindTo(id, 5)).toBe(false);
  });

  it("returns true for every reachable historical frame on a clean chain", () => {
    const { runtime, id } = setup();
    expect(runtime.canRewindTo(id, 0)).toBe(true);
    expect(runtime.canRewindTo(id, 1)).toBe(true);
    expect(runtime.canRewindTo(id, 2)).toBe(true);
    expect(runtime.canRewindTo(id, 3)).toBe(true);
  });

  it("returns false for terminal / non-active instances", () => {
    const { runtime, id, harness } = setup();
    harness.fireExit(id, "next"); // completes
    expect(runtime.canRewindTo(id, 0)).toBe(false);
  });

  it("agrees with rewindTo on every input across mixed-permission chains", () => {
    // Build a journey whose middle hop has no allowBack: true on the
    // transition. canRewindTo and rewindTo must agree on every index.
    const s1 = makeStep("s1");
    const s2 = makeStep("s2");
    const s3 = makeStep("s3");
    const s4 = makeStep("s4");
    type M = {
      readonly s1: typeof s1;
      readonly s2: typeof s2;
      readonly s3: typeof s3;
      readonly s4: typeof s4;
    };
    const j = defineJourney<M, Record<string, never>>()({
      id: "mixed",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "s1", entry: "show", input: undefined }),
      transitions: {
        s1: {
          show: { next: () => ({ next: { module: "s2", entry: "show", input: undefined } }) },
        },
        s2: {
          show: {
            // No allowBack here.
            next: () => ({ next: { module: "s3", entry: "show", input: undefined } }),
          },
        },
        s3: {
          show: {
            allowBack: true,
            next: () => ({ next: { module: "s4", entry: "show", input: undefined } }),
          },
        },
        s4: { show: { allowBack: true, next: () => ({ complete: undefined }) } },
      },
    });
    const runtime = createJourneyRuntime([{ definition: j, options: undefined }], {
      modules: { s1, s2, s3, s4 },
    });
    const id = runtime.start(j.id, undefined);
    const harness = createTestHarness(runtime);
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");

    // Index 2 (land on s3): leaves only s4 (allowBack:true) → ok
    // Index 1 (land on s2): leaves s4 (ok) + s3 (allowBack:true ok) → ok
    // Index 0 (land on s1): also leaves s2 (no allowBack) → blocked
    for (const idx of [-1, 0, 1, 2, 3, 4]) {
      const predicate = runtime.canRewindTo(id, idx);
      const before = runtime.getInstance(id);
      runtime.rewindTo(id, idx);
      const after = runtime.getInstance(id);
      const actuallyMoved = after?.step?.moduleId !== before?.step?.moduleId;
      expect(actuallyMoved).toBe(predicate);
      // Reset: walk forward to the original position for the next iteration
      while (runtime.canGoForward(id)) runtime.goForward(id);
    }
  });
});

describe("runtime.rewindTo: end-to-end edit-and-revisit", () => {
  it("rewind → edit early-step state → walk Next forward → land with edits preserved", () => {
    // The scenario this whole API exists for: a user on the last
    // step of a wizard wants to jump back four steps, edit something,
    // and walk forward through every intermediate step (each
    // revalidating against the new state via buildInput). The data
    // they had previously entered on later steps must survive both
    // the rewind and the forward traversal.

    interface FormState {
      readonly stepACount: number;
      readonly stepBCount: number;
      readonly stepCCount: number;
      readonly stepDCount: number;
    }

    const formExits = { next: defineExit<{ value: number }>() } as const;

    const mkEntry = (build: (s: FormState) => { count: number }) =>
      defineEntry({
        component: (() => null) as never,
        input: schema<{ count: number }>(),
        allowBack: "preserve-state" as const,
        buildInput: build,
      });

    const stepFa = defineModule({
      id: "fa",
      version: "1.0.0",
      exitPoints: formExits,
      entryPoints: { show: mkEntry((s) => ({ count: s.stepACount })) },
    });
    const stepFb = defineModule({
      id: "fb",
      version: "1.0.0",
      exitPoints: formExits,
      entryPoints: { show: mkEntry((s) => ({ count: s.stepBCount })) },
    });
    const stepFc = defineModule({
      id: "fc",
      version: "1.0.0",
      exitPoints: formExits,
      entryPoints: { show: mkEntry((s) => ({ count: s.stepCCount })) },
    });
    const stepFd = defineModule({
      id: "fd",
      version: "1.0.0",
      exitPoints: formExits,
      entryPoints: { show: mkEntry((s) => ({ count: s.stepDCount })) },
    });
    type M = {
      readonly fa: typeof stepFa;
      readonly fb: typeof stepFb;
      readonly fc: typeof stepFc;
      readonly fd: typeof stepFd;
    };
    const j = defineJourney<M, FormState>()({
      id: "edit-and-revisit",
      version: "1.0.0",
      initialState: () => ({
        stepACount: 0,
        stepBCount: 0,
        stepCCount: 0,
        stepDCount: 0,
      }),
      start: (s) => ({ module: "fa", entry: "show", input: { count: s.stepACount } }),
      transitions: {
        fa: {
          show: {
            allowBack: true,
            next: ({ state, output }) => ({
              state: { ...state, stepACount: output.value },
              next: { module: "fb", entry: "show", input: { count: state.stepBCount } },
            }),
          },
        },
        fb: {
          show: {
            allowBack: true,
            next: ({ state, output }) => ({
              state: { ...state, stepBCount: output.value },
              next: { module: "fc", entry: "show", input: { count: state.stepCCount } },
            }),
          },
        },
        fc: {
          show: {
            allowBack: true,
            next: ({ state, output }) => ({
              state: { ...state, stepCCount: output.value },
              next: { module: "fd", entry: "show", input: { count: state.stepDCount } },
            }),
          },
        },
        fd: {
          show: {
            allowBack: true,
            next: ({ state, output }) => ({
              state: { ...state, stepDCount: output.value },
              complete: undefined,
            }),
          },
        },
      },
    });

    const runtime = createJourneyRuntime([{ definition: j, options: undefined }], {
      modules: { fa: stepFa, fb: stepFb, fc: stepFc, fd: stepFd },
    });
    const id = runtime.start(j.id, undefined);
    const harness = createTestHarness(runtime);

    // Walk forward, entering a unique value on each step.
    harness.fireExit(id, "next", { value: 11 }); // fa → fb, state.stepACount = 11
    harness.fireExit(id, "next", { value: 22 }); // fb → fc, state.stepBCount = 22
    harness.fireExit(id, "next", { value: 33 }); // fc → fd, state.stepCCount = 33
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("fd");
    expect(runtime.getInstance(id)?.state).toEqual({
      stepACount: 11,
      stepBCount: 22,
      stepCCount: 33,
      stepDCount: 0,
    });

    // User clicks the breadcrumb for step `fa`. Multi-step rewind.
    runtime.rewindTo(id, 0);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("fa");
    // Destination's buildInput re-derived against accumulated state,
    // so the form sees the value the user originally entered.
    expect(runtime.getInstance(id)?.step?.input).toEqual({ count: 11 });

    // User edits the value on step `fa`.
    harness.fireExit(id, "next", { value: 99 }); // fa → fb, state.stepACount = 99
    // fb's form re-derives via buildInput against accumulated state —
    // step B's previously-entered 22 is still there.
    expect(runtime.getInstance(id)?.step?.input).toEqual({ count: 22 });

    harness.fireExit(id, "next", { value: 22 }); // fb → fc, unchanged
    expect(runtime.getInstance(id)?.step?.input).toEqual({ count: 33 });

    harness.fireExit(id, "next", { value: 33 }); // fc → fd
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("fd");

    // Edits preserved end-to-end. The new fa value is in state; the
    // intermediate steps' data survived both the rewind and the
    // forward traversal.
    expect(runtime.getInstance(id)?.state).toEqual({
      stepACount: 99,
      stepBCount: 22,
      stepCCount: 33,
      stepDCount: 0,
    });
  });
});

describe("runtime.rewindTo: buildInput throw on destination", () => {
  it("aborts the instance with `build-input-threw` when the destination's buildInput throws", () => {
    // Same failure mode as the goBack path: the journey aborts with
    // `build-input-threw`, fires onError(phase: "step"), and ends up
    // in `aborted` status. Pin the contract so the JSDoc note
    // ("the one non-no-op failure") is enforced.
    const error = new Error("destination buildInput exploded");
    // `buildInput` runs both on initial start (computing the first
    // input) and on re-entry via rewindTo / goBack. The flag stays
    // false during start so the journey can advance past `dest`; the
    // test flips it to true just before calling rewindTo so the throw
    // only fires on the way back in.
    let throwOnNextBuild = false;
    const dest = defineModule({
      id: "dest",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        show: defineEntry({
          component: (() => null) as never,
          input: schema<{ derived: number }>(),
          allowBack: "preserve-state",
          buildInput: () => {
            if (throwOnNextBuild) throw error;
            return { derived: 0 };
          },
        }),
      },
    });
    const mid = makeStep("mid");
    const tail = makeStep("tail");
    type M = {
      readonly dest: typeof dest;
      readonly mid: typeof mid;
      readonly tail: typeof tail;
    };
    const j = defineJourney<M, Record<string, never>>()({
      id: "rewind-build-throws",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "dest", entry: "show", input: { derived: 0 } }),
      transitions: {
        dest: {
          show: {
            allowBack: true,
            next: () => ({ next: { module: "mid", entry: "show", input: undefined } }),
          },
        },
        mid: {
          show: {
            allowBack: true,
            next: () => ({ next: { module: "tail", entry: "show", input: undefined } }),
          },
        },
        tail: {
          show: { allowBack: true, next: () => ({ complete: undefined }) },
        },
      },
    });

    // onError fires with phase "step" — buildInput throw routes through
    // abortFromBuildInputThrow → fireOnError before the abort
    // transition is applied.
    const onError = vi.fn();
    const runtime = createJourneyRuntime([{ definition: j, options: { onError } }], {
      modules: { dest, mid, tail },
    });
    const id = runtime.start(j.id, undefined);
    const harness = createTestHarness(runtime);
    harness.fireExit(id, "next"); // dest → mid
    harness.fireExit(id, "next"); // mid → tail
    onError.mockClear();
    throwOnNextBuild = true;

    runtime.rewindTo(id, 0); // would land on dest, whose buildInput now throws

    const inst = runtime.getInstance(id);
    expect(inst?.status).toBe("aborted");
    expect(inst?.terminalPayload).toMatchObject({
      reason: "build-input-threw",
      moduleId: "dest",
      entry: "show",
      error,
    });
    expect(onError).toHaveBeenCalledTimes(1);
    const [errArg, ctx] = onError.mock.calls[0] ?? [];
    expect(errArg).toBe(error);
    expect(ctx?.phase).toBe("step");
  });
});

describe("runtime.rewindTo: persistence", () => {
  it("schedules exactly one save with the post-rewind blob", async () => {
    // The runtime calls schedulePersist once at the tail of
    // dispatchRewindTo — same hook every other transition path uses.
    // Pin the contract so a future refactor doesn't silently start
    // emitting N writes for an N-step rewind.
    const store = new Map<string, unknown>();
    const save = vi.fn(async (k: string, b: unknown) => {
      store.set(k, b);
    });
    const persistence = {
      keyFor: () => "rewind:persist",
      load: (k: string) => (store.get(k) as never) ?? null,
      save,
      remove: async (k: string) => {
        store.delete(k);
      },
    };
    const rt = createJourneyRuntime(
      [{ definition: journey, options: { persistence: persistence as never } }],
      { modules: { a: stepA, b: stepB, c: stepC, d: stepD, e: stepE } },
    );
    const id = rt.start(journey.id, undefined);
    const harness = createTestHarness(rt);
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    // Flush all pre-rewind saves before measuring rewind's contribution.
    await Promise.resolve();
    await Promise.resolve();
    save.mockClear();

    rt.rewindTo(id, 1); // e → b, 3 frames popped

    await Promise.resolve();
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    const blob = save.mock.calls[0]?.[1] as { step?: { moduleId: string }; history?: unknown[] };
    expect(blob?.step?.moduleId).toBe("b");
    expect(blob?.history).toHaveLength(1); // only [a] left after landing on b
  });
});

describe("runtime.rewindTo: status guards", () => {
  it("is a no-op while the instance is in `loading` status", async () => {
    // Async persistence holds the instance in `loading` until `load`
    // resolves. rewindTo must short-circuit via the `status !== "active"`
    // guard — no state mutation, no abort, no exception.
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
              keyFor: () => "rewind:loading",
              load: () => loadPromise,
              save: async () => {},
              remove: async () => {},
            } as never,
          },
        },
      ],
      { modules: { a: stepA, b: stepB, c: stepC, d: stepD, e: stepE } },
    );
    const id = rt.start(journey.id, undefined);
    expect(rt.getInstance(id)?.status).toBe("loading");

    expect(() => rt.rewindTo(id, 0)).not.toThrow();
    expect(rt.canRewindTo(id, 0)).toBe(false);
    expect(rt.getInstance(id)?.status).toBe("loading");

    // Drain the load promise so the test doesn't leak.
    resolveLoad(null);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("is a no-op while a child journey is in flight", () => {
    // Mirrors the goForward "active child" test: an invoked child
    // gates the parent's navigation. rewindTo must not mutate while
    // `activeChildId` is set, even though in practice the future
    // stack is already empty by the time a child is in flight.
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
      id: "child-for-rewind",
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
      id: "parent-for-rewind",
      version: "1.0.0",
      invokes: [{ id: "child-for-rewind", __input: undefined } as never],
      initialState: () => ({}),
      start: () => ({ module: "p", entry: "a", input: undefined }),
      transitions: {
        p: {
          a: {
            allowBack: true,
            next: () => ({ next: { module: "p", entry: "b", input: undefined } }),
          },
          b: {
            allowBack: true,
            invokeChild: () => ({
              invoke: {
                handle: { id: "child-for-rewind" } as never,
                input: undefined,
                resume: "back",
              },
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
    harness.fireExit(id, "next"); // a → b, history=[a]
    harness.fireExit(id, "invokeChild");
    expect(runtime.getInstance(id)?.activeChildId).not.toBeNull();

    const before = runtime.getInstance(id);
    expect(runtime.canRewindTo(id, 0)).toBe(false);
    runtime.rewindTo(id, 0);
    const after = runtime.getInstance(id);
    expect(after?.step).toEqual(before?.step);
    expect(after?.history).toEqual(before?.history);
    expect(after?.activeChildId).toEqual(before?.activeChildId);
  });
});
