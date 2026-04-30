// Runtime tests for the parent → invoke → child → resume flow.
//
// These cover the core subroutine semantics: typed outcome flow into the
// parent's resume handler, blocking parent exits while a child is in flight,
// abort propagation through ChildOutcome, cascade-end on parent termination,
// multi-level nesting, persistence round-trip via serialize / hydrate, and
// the validation paths that drive the parent into a discoverable abort
// (unknown journey, missing resume, throw, returned promise).

import { describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { defineJourneyHandle, invoke } from "./handle.js";
import { createJourneyRuntime } from "./runtime.js";
import { createTestHarness } from "./testing.js";
import type { SerializedJourney } from "./types.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const childExits = {
  done: defineExit<{ token: string }>(),
  failed: defineExit<{ code: string }>(),
} as const;

const childMod = defineModule({
  id: "verifier",
  version: "1.0.0",
  exitPoints: childExits,
  entryPoints: {
    review: defineEntry({
      component: (() => null) as never,
      input: schema<{ subject: string }>(),
    }),
  },
});

type ChildModules = { readonly verifier: typeof childMod };

const childJourney = defineJourney<ChildModules, { subject: string }, { token: string }>()({
  id: "verify",
  version: "1.0.0",
  initialState: (input: { subject: string }) => ({ subject: input.subject }),
  start: (s) => ({ module: "verifier", entry: "review", input: { subject: s.subject } }),
  transitions: {
    verifier: {
      review: {
        done: ({ output }) => ({ complete: { token: output.token } }),
        failed: ({ output }) => ({ abort: { code: output.code } }),
      },
    },
  },
});

const childHandle = defineJourneyHandle(childJourney);

const parentExits = {
  pickPlan: defineExit<{ plan: "free" | "paid" }>(),
  cancelled: defineExit(),
} as const;

const parentMod = defineModule({
  id: "checkout",
  version: "1.0.0",
  exitPoints: parentExits,
  entryPoints: {
    review: defineEntry({
      component: (() => null) as never,
      input: schema<{ orderId: string }>(),
    }),
    confirm: defineEntry({
      component: (() => null) as never,
      input: schema<{ orderId: string; token: string }>(),
    }),
  },
});

type ParentModules = { readonly checkout: typeof parentMod };

interface ParentState {
  readonly orderId: string;
  readonly token: string | null;
  readonly aborted?: { readonly code: string };
}

const parentJourney = defineJourney<ParentModules, ParentState>()({
  id: "checkout",
  version: "1.0.0",
  initialState: (input: { orderId: string }) => ({ orderId: input.orderId, token: null }),
  start: (s) => ({ module: "checkout", entry: "review", input: { orderId: s.orderId } }),
  transitions: {
    checkout: {
      review: {
        pickPlan: ({ state }) =>
          invoke({
            handle: childHandle,
            input: { subject: state.orderId },
            resume: "afterVerify",
          }),
        cancelled: () => ({ abort: { reason: "user-cancelled" } }),
      },
    },
  },
  resumes: {
    checkout: {
      review: {
        afterVerify: ({ state, outcome }) =>
          outcome.status === "completed"
            ? {
                state: { ...state, token: outcome.payload.token },
                next: {
                  module: "checkout",
                  entry: "confirm",
                  input: { orderId: state.orderId, token: outcome.payload.token },
                },
              }
            : {
                state: {
                  ...state,
                  aborted: {
                    code: String((outcome.reason as { code?: string })?.code ?? "unknown"),
                  },
                },
                complete: undefined as never,
              },
      },
    },
  },
});

const parentHandle = defineJourneyHandle(parentJourney);

function buildRuntime() {
  return createJourneyRuntime(
    [
      { definition: parentJourney, options: undefined },
      { definition: childJourney, options: undefined },
    ],
    { modules: { checkout: parentMod, verifier: childMod }, debug: false },
  );
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("invoke / resume — happy path", () => {
  it("parent stays at the invoking step while the child runs, then resumes", () => {
    const rt = buildRuntime();
    const harness = createTestHarness(rt);
    const parentId = rt.start(parentHandle, { orderId: "O-1" });

    const parentBefore = rt.getInstance(parentId)!;
    expect(parentBefore.step).toEqual({
      moduleId: "checkout",
      entry: "review",
      input: { orderId: "O-1" },
    });
    expect(parentBefore.activeChildId).toBeNull();

    harness.fireExit(parentId, "pickPlan", { plan: "paid" });

    const parentMid = rt.getInstance(parentId)!;
    expect(parentMid.step).toEqual({
      moduleId: "checkout",
      entry: "review",
      input: { orderId: "O-1" },
    });
    expect(parentMid.activeChildId).not.toBeNull();
    const childId = parentMid.activeChildId!;

    const childMid = rt.getInstance(childId)!;
    expect(childMid.step).toEqual({
      moduleId: "verifier",
      entry: "review",
      input: { subject: "O-1" },
    });
    expect(childMid.parent).toEqual({ instanceId: parentId, resumeName: "afterVerify" });

    harness.fireExit(childId, "done", { token: "T-OK" });

    const parentAfter = rt.getInstance(parentId)!;
    expect(parentAfter.activeChildId).toBeNull();
    expect(parentAfter.state.token).toBe("T-OK");
    expect(parentAfter.step).toEqual({
      moduleId: "checkout",
      entry: "confirm",
      input: { orderId: "O-1", token: "T-OK" },
    });

    expect(rt.getInstance(childId)!.status).toBe("completed");
  });

  it("blocks parent exits while the child is in flight", () => {
    const rt = buildRuntime();
    const harness = createTestHarness(rt);
    const parentId = rt.start(parentHandle, { orderId: "O-2" });
    harness.fireExit(parentId, "pickPlan", { plan: "free" });

    const parentMid = rt.getInstance(parentId)!;
    expect(parentMid.activeChildId).not.toBeNull();

    // Try to fire a parent exit while the child is in flight — should be a no-op.
    // The harness throws on terminal-instance exits, but `active + activeChildId`
    // is the runtime's own guard — calling through the test harness is fine
    // (it's only the runtime that drops the exit).
    harness.fireExit(parentId, "cancelled");

    expect(rt.getInstance(parentId)!.activeChildId).toBe(parentMid.activeChildId);
    expect(rt.getInstance(parentId)!.status).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// Abort propagation
// ---------------------------------------------------------------------------

describe("invoke / resume — abort propagation", () => {
  it("delivers child abort to the parent's resume handler", () => {
    const rt = buildRuntime();
    const harness = createTestHarness(rt);
    const parentId = rt.start(parentHandle, { orderId: "O-3" });
    harness.fireExit(parentId, "pickPlan", { plan: "paid" });
    const childId = rt.getInstance(parentId)!.activeChildId!;

    harness.fireExit(childId, "failed", { code: "denied" });

    const parent = rt.getInstance(parentId)!;
    expect(parent.activeChildId).toBeNull();
    expect(parent.state.aborted).toEqual({ code: "denied" });
    expect(rt.getInstance(childId)!.status).toBe("aborted");
  });
});

// ---------------------------------------------------------------------------
// Cascade-end
// ---------------------------------------------------------------------------

describe("invoke / resume — cascade-end on parent termination", () => {
  it("ends an in-flight child when the parent is force-terminated", () => {
    const rt = buildRuntime();
    const harness = createTestHarness(rt);
    const parentId = rt.start(parentHandle, { orderId: "O-4" });
    harness.fireExit(parentId, "pickPlan", { plan: "paid" });
    const childId = rt.getInstance(parentId)!.activeChildId!;

    rt.end(parentId, { reason: "user-closed" });

    expect(rt.getInstance(parentId)!.status).toBe("aborted");
    const child = rt.getInstance(childId)!;
    expect(child.status).toBe("aborted");
    // The child's terminal payload reflects the cascade reason directly —
    // `runtime.end()` no longer wraps the supplied reason in `{ reason }`,
    // so telemetry sees the cascade marker at the top level.
    const payload = child.terminalPayload as {
      reason: string;
      parentId: string;
      cause: { reason: string };
    };
    expect(payload.reason).toBe("parent-ended");
    expect(payload.parentId).toBe(parentId);
    expect(payload.cause).toEqual({ reason: "user-closed" });
  });
});

// ---------------------------------------------------------------------------
// Multi-level nesting
// ---------------------------------------------------------------------------

describe("invoke / resume — multi-level nesting", () => {
  it("supports a child that itself invokes a grandchild, then resumes back up", () => {
    // A separate trio: outer → middle → leaf. Outer's resume completes when
    // the middle resumes. Middle's resume from the leaf's done-exit completes
    // the middle. Tests recursive resume bubbling.
    const leafExits = { ok: defineExit<{ value: number }>() } as const;
    const leafMod = defineModule({
      id: "leaf",
      version: "1.0.0",
      exitPoints: leafExits,
      entryPoints: {
        run: defineEntry({
          component: (() => null) as never,
          input: schema<void>(),
        }),
      },
    });
    const leafJourney = defineJourney<{ leaf: typeof leafMod }, void, { value: number }>()({
      id: "leaf-j",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "leaf", entry: "run", input: undefined }),
      transitions: {
        leaf: {
          run: {
            ok: ({ output }) => ({ complete: { value: output.value } }),
          },
        },
      },
    });
    const leafHandle = defineJourneyHandle(leafJourney);

    const middleExits = { go: defineExit() } as const;
    const middleMod = defineModule({
      id: "middle",
      version: "1.0.0",
      exitPoints: middleExits,
      entryPoints: {
        gate: defineEntry({
          component: (() => null) as never,
          input: schema<void>(),
        }),
      },
    });
    const middleJourney = defineJourney<
      { middle: typeof middleMod },
      { v: number | null },
      { v: number }
    >()({
      id: "middle-j",
      version: "1.0.0",
      initialState: () => ({ v: null }),
      start: () => ({ module: "middle", entry: "gate", input: undefined }),
      transitions: {
        middle: {
          gate: {
            go: () => invoke({ handle: leafHandle, input: undefined, resume: "afterLeaf" }),
          },
        },
      },
      resumes: {
        middle: {
          gate: {
            afterLeaf: ({ outcome }) =>
              outcome.status === "completed"
                ? { complete: { v: outcome.payload.value } }
                : { abort: { reason: "leaf-aborted" } },
          },
        },
      },
    });
    const middleHandle = defineJourneyHandle(middleJourney);

    const outerExits = { begin: defineExit() } as const;
    const outerMod = defineModule({
      id: "outer",
      version: "1.0.0",
      exitPoints: outerExits,
      entryPoints: {
        wait: defineEntry({
          component: (() => null) as never,
          input: schema<void>(),
        }),
      },
    });
    const outerJourney = defineJourney<
      { outer: typeof outerMod },
      { v: number | null },
      { v: number }
    >()({
      id: "outer-j",
      version: "1.0.0",
      initialState: () => ({ v: null }),
      start: () => ({ module: "outer", entry: "wait", input: undefined }),
      transitions: {
        outer: {
          wait: {
            begin: () => invoke({ handle: middleHandle, input: undefined, resume: "afterMiddle" }),
          },
        },
      },
      resumes: {
        outer: {
          wait: {
            afterMiddle: ({ outcome }) =>
              outcome.status === "completed"
                ? { complete: { v: outcome.payload.v } }
                : { abort: { reason: "middle-aborted" } },
          },
        },
      },
    });
    const outerHandle = defineJourneyHandle(outerJourney);

    const rt = createJourneyRuntime(
      [
        { definition: outerJourney, options: undefined },
        { definition: middleJourney, options: undefined },
        { definition: leafJourney, options: undefined },
      ],
      {
        modules: { outer: outerMod, middle: middleMod, leaf: leafMod },
        debug: false,
      },
    );
    const harness = createTestHarness(rt);
    const outerId = rt.start(outerHandle);
    harness.fireExit(outerId, "begin");
    const middleId = rt.getInstance(outerId)!.activeChildId!;
    harness.fireExit(middleId, "go");
    const leafId = rt.getInstance(middleId)!.activeChildId!;

    harness.fireExit(leafId, "ok", { value: 7 });

    expect(rt.getInstance(leafId)!.status).toBe("completed");
    expect(rt.getInstance(middleId)!.status).toBe("completed");

    const outer = rt.getInstance(outerId)!;
    expect(outer.status).toBe("completed");
    expect(outer.terminalPayload).toEqual({ v: 7 });
  });
});

// ---------------------------------------------------------------------------
// Validation failure modes
// ---------------------------------------------------------------------------

describe("invoke / resume — validation failures abort the parent with discoverable reasons", () => {
  it("unknown child journey id → abort with reason invoke-unknown-journey", () => {
    const exits = { go: defineExit() } as const;
    const mod = defineModule({
      id: "m",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const stranger = defineJourneyHandle(
      defineJourney<{ m: typeof mod }, void, void>()({
        id: "stranger",
        version: "1.0.0",
        initialState: () => undefined,
        start: () => ({ module: "m", entry: "s", input: undefined }),
        transitions: {},
      }),
    );
    const j = defineJourney<{ m: typeof mod }, void>()({
      id: "drives",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "m", entry: "s", input: undefined }),
      transitions: {
        m: {
          s: { go: () => invoke({ handle: stranger, input: undefined, resume: "x" }) },
        },
      },
      resumes: { m: { s: { x: ({ outcome }) => ({ complete: outcome }) } } },
    });
    const rt = createJourneyRuntime([{ definition: j, options: undefined }], {
      modules: { m: mod },
      debug: false,
    });
    const harness = createTestHarness(rt);
    const id = rt.start(defineJourneyHandle(j));
    // Suppress the dev-mode console.error that beginInvoke emits on unknown-journey paths.
    vi.spyOn(console, "error").mockImplementation(() => {});
    harness.fireExit(id, "go");

    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("aborted");
    expect((inst.terminalPayload as { reason: string }).reason).toBe("invoke-unknown-journey");
  });

  it("invoke names a resume that does not exist → abort with reason invoke-unknown-resume", () => {
    const exits = { go: defineExit() } as const;
    const mod = defineModule({
      id: "m",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const dummyJ = defineJourney<{ m: typeof mod }, void, void>()({
      id: "dummy",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "m", entry: "s", input: undefined }),
      transitions: {},
    });
    const j = defineJourney<{ m: typeof mod }, void>()({
      id: "drives2",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "m", entry: "s", input: undefined }),
      transitions: {
        m: {
          s: {
            go: () =>
              invoke({
                handle: defineJourneyHandle(dummyJ),
                input: undefined,
                resume: "missing",
              }),
          },
        },
      },
      // No `resumes` map — runtime should detect and abort with
      // invoke-unknown-resume.
    });
    const rt = createJourneyRuntime(
      [
        { definition: j, options: undefined },
        { definition: dummyJ, options: undefined },
      ],
      { modules: { m: mod }, debug: false },
    );
    const harness = createTestHarness(rt);
    const id = rt.start(defineJourneyHandle(j));
    vi.spyOn(console, "error").mockImplementation(() => {});
    harness.fireExit(id, "go");

    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("aborted");
    expect((inst.terminalPayload as { reason: string }).reason).toBe("invoke-unknown-resume");
  });

  it("resume handler that throws → abort with reason resume-threw", () => {
    // Patch the parent's resume to throw.
    const j2 = defineJourney<ParentModules, ParentState>()({
      ...parentJourney,
      id: "checkout-throws",
      resumes: {
        checkout: {
          review: {
            afterVerify: () => {
              throw new Error("boom");
            },
          },
        },
      },
    });
    const rt2 = createJourneyRuntime(
      [
        { definition: j2, options: undefined },
        { definition: childJourney, options: undefined },
      ],
      { modules: { checkout: parentMod, verifier: childMod }, debug: false },
    );
    const h2 = createTestHarness(rt2);
    const pid = rt2.start(defineJourneyHandle(j2), { orderId: "O-9" });
    h2.fireExit(pid, "pickPlan", { plan: "paid" });
    const cid = rt2.getInstance(pid)!.activeChildId!;
    vi.spyOn(console, "error").mockImplementation(() => {});
    h2.fireExit(cid, "done", { token: "T" });
    expect(rt2.getInstance(pid)!.status).toBe("aborted");
    expect((rt2.getInstance(pid)!.terminalPayload as { reason: string }).reason).toBe(
      "resume-threw",
    );
  });
});

// ---------------------------------------------------------------------------
// Persistence round-trip
// ---------------------------------------------------------------------------

describe("invoke / resume — persistence", () => {
  it("serialize() emits pendingInvoke + parentLink and a fresh runtime relinks them", () => {
    const rt = buildRuntime();
    const harness = createTestHarness(rt);
    const parentId = rt.start(parentHandle, { orderId: "O-7" });
    harness.fireExit(parentId, "pickPlan", { plan: "paid" });
    const childId = rt.getInstance(parentId)!.activeChildId!;

    const parentBlob = rt.getInstance(parentId)!.serialize();
    const childBlob = rt.getInstance(childId)!.serialize();

    expect(parentBlob.pendingInvoke).toEqual({
      childJourneyId: "verify",
      childInstanceId: childId,
      childPersistenceKey: null,
      resumeName: "afterVerify",
    });
    expect(childBlob.parentLink).toEqual({
      parentInstanceId: parentId,
      resumeName: "afterVerify",
    });

    // Hydrate into a fresh runtime — order: parent first, then child.
    const rt2 = buildRuntime();
    rt2.hydrate("checkout", parentBlob);
    rt2.hydrate("verify", childBlob);

    const parentB = rt2.getInstance(parentId)!;
    const childB = rt2.getInstance(childId)!;
    expect(parentB.activeChildId).toBe(childId);
    expect(childB.parent).toEqual({ instanceId: parentId, resumeName: "afterVerify" });

    // Driving the child to completion in the new runtime resumes the parent.
    const harness2 = createTestHarness(rt2);
    harness2.fireExit(childId, "done", { token: "T-RELINK" });

    const parentResumed = rt2.getInstance(parentId)!;
    expect(parentResumed.activeChildId).toBeNull();
    expect(parentResumed.state.token).toBe("T-RELINK");
    expect(parentResumed.step?.entry).toBe("confirm");
  });

  it("relinks correctly when child hydrates before parent (reverse order)", () => {
    const rt = buildRuntime();
    const harness = createTestHarness(rt);
    const parentId = rt.start(parentHandle, { orderId: "O-8" });
    harness.fireExit(parentId, "pickPlan", { plan: "paid" });
    const childId = rt.getInstance(parentId)!.activeChildId!;
    const parentBlob = rt.getInstance(parentId)!.serialize();
    const childBlob = rt.getInstance(childId)!.serialize();

    const rt2 = buildRuntime();
    rt2.hydrate("verify", childBlob);
    rt2.hydrate("checkout", parentBlob);

    expect(rt2.getInstance(parentId)!.activeChildId).toBe(childId);
    expect(rt2.getInstance(childId)!.parent).toEqual({
      instanceId: parentId,
      resumeName: "afterVerify",
    });
  });

  it("auto-rehydrates the child via the parent's pendingInvoke.childPersistenceKey on start()", async () => {
    // Parent + child each have their own (memory-backed) persistence
    // adapter. After a "reload" — i.e. building a fresh runtime against
    // the same backing stores — calling `start()` on the parent should
    // pull the child blob back automatically, so the shell does not
    // have to know which children to start by hand.
    const parentStore = new Map<string, SerializedJourney<unknown>>();
    const childStore = new Map<string, SerializedJourney<unknown>>();
    type ParentTState = ParentState;
    type ChildTState = { subject: string };
    const parentPersistence = {
      keyFor: ({ input }: { input: { orderId: string } }) => `checkout:${input.orderId}`,
      load: (k: string) => parentStore.get(k) ?? null,
      save: (k: string, b: SerializedJourney<ParentTState>) =>
        void parentStore.set(k, b as SerializedJourney<unknown>),
      remove: (k: string) => void parentStore.delete(k),
    };
    const childPersistence = {
      keyFor: ({ input }: { input: { subject: string } }) => `verify:${input.subject}`,
      load: (k: string) => childStore.get(k) ?? null,
      save: (k: string, b: SerializedJourney<ChildTState>) =>
        void childStore.set(k, b as SerializedJourney<unknown>),
      remove: (k: string) => void childStore.delete(k),
    };

    const rt1 = createJourneyRuntime(
      [
        {
          definition: parentJourney,
          options: { persistence: parentPersistence as never },
        },
        {
          definition: childJourney,
          options: { persistence: childPersistence as never },
        },
      ],
      { modules: { checkout: parentMod, verifier: childMod }, debug: false },
    );
    const harness1 = createTestHarness(rt1);
    const parentId = rt1.start(parentHandle, { orderId: "O-AUTO" });
    harness1.fireExit(parentId, "pickPlan", { plan: "paid" });
    const childId = rt1.getInstance(parentId)!.activeChildId!;
    // Flush the runtime's coalesced save pipeline (`schedulePersist`
    // chains saves through a microtask) so the parent blob with
    // `pendingInvoke` and the child blob both land in storage before
    // we simulate a reload.
    await Promise.resolve();
    await Promise.resolve();
    expect(parentStore.size).toBe(1);
    expect(childStore.size).toBe(1);

    // "Reload": fresh runtime over the same stores. Calling start() on
    // the parent must auto-rehydrate the child even though the shell
    // never explicitly starts the child journey.
    const rt2 = createJourneyRuntime(
      [
        {
          definition: parentJourney,
          options: { persistence: parentPersistence as never },
        },
        {
          definition: childJourney,
          options: { persistence: childPersistence as never },
        },
      ],
      { modules: { checkout: parentMod, verifier: childMod }, debug: false },
    );
    const restoredParentId = rt2.start(parentHandle, { orderId: "O-AUTO" });
    expect(restoredParentId).toBe(parentId);

    const restoredParent = rt2.getInstance(parentId)!;
    expect(restoredParent.activeChildId).toBe(childId);
    const restoredChild = rt2.getInstance(childId)!;
    expect(restoredChild).not.toBeNull();
    expect(restoredChild.parent).toEqual({ instanceId: parentId, resumeName: "afterVerify" });

    // Driving the child forward in the restored runtime resumes the parent —
    // the same flow the user would see if the page never reloaded.
    const harness2 = createTestHarness(rt2);
    harness2.fireExit(childId, "done", { token: "T-AFTER-RELOAD" });
    const resumed = rt2.getInstance(parentId)!;
    expect(resumed.activeChildId).toBeNull();
    expect(resumed.state.token).toBe("T-AFTER-RELOAD");
    expect(resumed.step?.entry).toBe("confirm");
  });
});
