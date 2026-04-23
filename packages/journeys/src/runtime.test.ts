import { describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { createJourneyRuntime, getInternals } from "./runtime.js";
import type { RegisteredJourney } from "./types.js";

// --- Minimal fixture modules -------------------------------------------------

const accountExits = {
  wantsToNegotiate: defineExit<{ customerId: string }>(),
  done: defineExit(),
  cancelled: defineExit(),
} as const;

const accountModule = defineModule({
  id: "account",
  version: "1.0.0",
  exitPoints: accountExits,
  entryPoints: {
    review: defineEntry({
      component: (() => null) as any,
      input: schema<{ customerId: string }>(),
    }),
  },
});

const debtsExits = {
  agreed: defineExit<{ amount: number }>(),
  failed: defineExit(),
} as const;

const debtsModule = defineModule({
  id: "debts",
  version: "1.0.0",
  exitPoints: debtsExits,
  entryPoints: {
    negotiate: defineEntry({
      component: (() => null) as any,
      input: schema<{ customerId: string }>(),
      allowBack: "rollback",
    }),
  },
});

// --- Journey definition ------------------------------------------------------

type Modules = {
  readonly account: typeof accountModule;
  readonly debts: typeof debtsModule;
};

interface State {
  customerId: string;
  attempts: number;
}

const journey = defineJourney<Modules, State>()({
  id: "collect",
  version: "1.0.0",
  initialState: ({ customerId }: { customerId: string }) => ({ customerId, attempts: 0 }),
  start: (s) => ({ module: "account", entry: "review", input: { customerId: s.customerId } }),
  transitions: {
    account: {
      review: {
        wantsToNegotiate: ({ state, output }) => ({
          state: { ...state, attempts: state.attempts + 1 },
          next: {
            module: "debts",
            entry: "negotiate",
            input: { customerId: output.customerId },
          },
        }),
        done: () => ({ complete: { result: "no-action" } }),
        cancelled: () => ({ abort: { reason: "agent-cancelled" } }),
      },
    },
    debts: {
      negotiate: {
        allowBack: true,
        agreed: ({ output }) => ({ complete: { amount: output.amount } }),
        failed: () => ({ abort: { reason: "negotiation-failed" } }),
      },
    },
  },
});

function freshRuntime(overrides: Partial<RegisteredJourney> = {}) {
  return createJourneyRuntime(
    [
      {
        definition: journey,
        options: undefined,
        ...overrides,
      } as RegisteredJourney,
    ],
    { modules: { account: accountModule, debts: debtsModule }, debug: false },
  );
}

describe("createJourneyRuntime — basic state machine", () => {
  it("starts at the step declared by `start`", () => {
    const rt = freshRuntime();
    const id = rt.start("collect", { customerId: "C-1" });
    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("active");
    expect(inst.step).toEqual({
      moduleId: "account",
      entry: "review",
      input: { customerId: "C-1" },
    });
    expect((inst.state as State).customerId).toBe("C-1");
  });

  it("runs a transition when exit fires", () => {
    const rt = freshRuntime();
    const id = rt.start("collect", { customerId: "C-2" });
    const internals = getInternals(rt);
    const rec = internals.__getRecord(id)!;
    const reg = internals.__getRegistered("collect")!;
    internals.__bindStepCallbacks(rec, reg).exit("wantsToNegotiate", { customerId: "C-2" });

    const inst = rt.getInstance(id)!;
    expect(inst.step).toEqual({
      moduleId: "debts",
      entry: "negotiate",
      input: { customerId: "C-2" },
    });
    expect((inst.state as State).attempts).toBe(1);
    expect(inst.history).toEqual([
      { moduleId: "account", entry: "review", input: { customerId: "C-2" } },
    ]);
  });

  it("completes and fires onComplete", () => {
    const onComplete = vi.fn();
    const onTransition = vi.fn();
    const rt = createJourneyRuntime(
      [
        {
          definition: { ...journey, onComplete, onTransition },
          options: undefined,
        },
      ],
      { modules: { account: accountModule, debts: debtsModule }, debug: false },
    );
    const id = rt.start("collect", { customerId: "C-3" });
    const internals = getInternals(rt);
    const rec = internals.__getRecord(id)!;
    const reg = internals.__getRegistered("collect")!;
    // Finish immediately with `done`
    internals.__bindStepCallbacks(rec, reg).exit("done");

    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("completed");
    expect(inst.step).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
    // onTransition fires on start AND on the terminal step.
    expect(onTransition).toHaveBeenCalledTimes(2);
  });

  it("aborts on cancelled exit", () => {
    const onAbort = vi.fn();
    const rt = createJourneyRuntime(
      [{ definition: { ...journey, onAbort }, options: undefined }],
      { modules: { account: accountModule, debts: debtsModule }, debug: false },
    );
    const id = rt.start("collect", { customerId: "C-4" });
    const internals = getInternals(rt);
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, internals.__getRegistered("collect")!)
      .exit("cancelled");
    expect(rt.getInstance(id)!.status).toBe("aborted");
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("end() fires onAbandon and transitions to terminal", () => {
    const onAbandon = vi
      .fn()
      .mockReturnValue({ abort: { reason: "forced" } });
    const rt = createJourneyRuntime(
      [{ definition: { ...journey, onAbandon }, options: undefined }],
      { modules: { account: accountModule, debts: debtsModule }, debug: false },
    );
    const id = rt.start("collect", { customerId: "C-5" });
    rt.end(id, { why: "tab closed" });
    expect(onAbandon).toHaveBeenCalledTimes(1);
    expect(rt.getInstance(id)!.status).toBe("aborted");
  });

  it("step tokens invalidate stale exit calls", () => {
    const rt = freshRuntime();
    const id = rt.start("collect", { customerId: "C-6" });
    const internals = getInternals(rt);
    const rec = internals.__getRecord(id)!;
    const reg = internals.__getRegistered("collect")!;
    const callbacks = internals.__bindStepCallbacks(rec, reg);
    // First click wins — advances to debts.negotiate
    callbacks.exit("wantsToNegotiate", { customerId: "C-6" });
    // Stale closure fires after — should be a no-op.
    callbacks.exit("wantsToNegotiate", { customerId: "C-6" });
    const inst = rt.getInstance(id)!;
    expect(inst.step!.entry).toBe("negotiate");
    expect(inst.history).toHaveLength(1);
  });

  it("onTransition errors never block the transition", () => {
    const rt = createJourneyRuntime(
      [
        {
          definition: {
            ...journey,
            onTransition: () => {
              throw new Error("boom");
            },
          },
          options: undefined,
        },
      ],
      { modules: { account: accountModule, debts: debtsModule }, debug: false },
    );
    const id = rt.start("collect", { customerId: "C-7" });
    expect(rt.getInstance(id)!.status).toBe("active");
  });

  it("listDefinitions reports registered summaries", () => {
    const rt = freshRuntime();
    expect(rt.listDefinitions()).toEqual([
      { id: "collect", version: "1.0.0", meta: undefined },
    ]);
  });

  it("goBack returns to previous step and rolls back state when entry opts in", () => {
    const rt = freshRuntime();
    const id = rt.start("collect", { customerId: "C-8" });
    const internals = getInternals(rt);
    const reg = internals.__getRegistered("collect")!;
    // Move to debts.negotiate
    let cb = internals.__bindStepCallbacks(internals.__getRecord(id)!, reg);
    cb.exit("wantsToNegotiate", { customerId: "C-8" });
    // The current step is now debts.negotiate (allowBack: "rollback").
    cb = internals.__bindStepCallbacks(internals.__getRecord(id)!, reg);
    expect(cb.goBack).toBeDefined();
    cb.goBack!();
    const inst = rt.getInstance(id)!;
    expect(inst.step!.entry).toBe("review");
    // State rolled back — attempts was 0 before entering negotiate.
    expect((inst.state as State).attempts).toBe(0);
  });
});

describe("createJourneyRuntime — hydration", () => {
  it("start() is idempotent when persistence yields an active blob", async () => {
    const store = new Map<string, unknown>();
    const persistence = {
      keyFor: () => "customer:1:collect",
      load: (k: string) => (store.get(k) as any) ?? null,
      save: async (k: string, b: any) => {
        store.set(k, b);
      },
      remove: async (k: string) => {
        store.delete(k);
      },
    };

    const rt = freshRuntime({ options: { persistence: persistence as any } });
    const idA = rt.start("collect", { customerId: "C-9" });
    // Let the save queue drain
    await Promise.resolve();
    await Promise.resolve();
    const idB = rt.start("collect", { customerId: "C-9" });
    expect(idA).toBe(idB);
  });

  it("start() is idempotent while the load probe is still in flight (async)", async () => {
    let resolveLoad: (blob: null) => void = () => {};
    const loadPromise = new Promise<null>((r) => {
      resolveLoad = r;
    });
    const persistence = {
      keyFor: () => "customer:async:collect",
      load: vi.fn(() => loadPromise),
      save: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    };
    const rt = freshRuntime({ options: { persistence: persistence as any } });
    const idA = rt.start("collect", { customerId: "C-async" });
    const idB = rt.start("collect", { customerId: "C-async" });
    expect(idA).toBe(idB);
    expect(persistence.load).toHaveBeenCalledTimes(1);
    resolveLoad(null);
    await Promise.resolve();
    await Promise.resolve();
    expect(rt.getInstance(idA)!.status).toBe("active");
  });

  it("explicit hydrate rejects version mismatch without onHydrate", () => {
    const rt = freshRuntime();
    const blob = {
      definitionId: "collect",
      version: "0.0.0",
      instanceId: "ji_x",
      status: "active" as const,
      step: null,
      history: [],
      state: { customerId: "C-10", attempts: 0 },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    expect(() => rt.hydrate("collect", blob)).toThrow(/version mismatch/);
  });

  it("onHydrate can migrate the blob", () => {
    const def = {
      ...journey,
      onHydrate: (blob: any) => ({ ...blob, version: journey.version }),
    };
    const rt = createJourneyRuntime([{ definition: def, options: undefined }], {
      modules: { account: accountModule, debts: debtsModule },
      debug: false,
    });
    const blob = {
      definitionId: "collect",
      version: "0.0.0",
      instanceId: "ji_x",
      status: "active" as const,
      step: { moduleId: "account", entry: "review", input: { customerId: "C-11" } },
      history: [],
      state: { customerId: "C-11", attempts: 2 },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    const id = rt.hydrate("collect", blob);
    const inst = rt.getInstance(id)!;
    expect((inst.state as State).attempts).toBe(2);
    expect(inst.step!.moduleId).toBe("account");
  });

  it("rollback snapshots survive a persistence round-trip", async () => {
    const store = new Map<string, unknown>();
    const persistence = {
      keyFor: () => "k:roundtrip",
      load: async (k: string) => (store.get(k) as any) ?? null,
      save: async (k: string, b: any) => {
        store.set(k, b);
      },
      remove: async (k: string) => {
        store.delete(k);
      },
    };
    const rt1 = freshRuntime({ options: { persistence: persistence as any } });
    const id1 = rt1.start("collect", { customerId: "C-rt" });
    const internals1 = getInternals(rt1);
    const reg1 = internals1.__getRegistered("collect")!;
    internals1
      .__bindStepCallbacks(internals1.__getRecord(id1)!, reg1)
      .exit("wantsToNegotiate", { customerId: "C-rt" });
    // Drain save queue.
    await Promise.resolve();
    await Promise.resolve();

    const rt2 = freshRuntime({ options: { persistence: persistence as any } });
    const id2 = rt2.start("collect", { customerId: "C-rt" });
    // Allow the async load + hydrate to settle.
    await Promise.resolve();
    await Promise.resolve();
    const internals2 = getInternals(rt2);
    const reg2 = internals2.__getRegistered("collect")!;
    const cbs = internals2.__bindStepCallbacks(internals2.__getRecord(id2)!, reg2);
    expect(cbs.goBack).toBeDefined();
    cbs.goBack!();
    const inst = rt2.getInstance(id2)!;
    expect(inst.step!.entry).toBe("review");
    expect((inst.state as State).attempts).toBe(0);
  });
});

describe("createJourneyRuntime — lifecycle extras", () => {
  it("forget() drops terminal instances but refuses active ones", () => {
    const rt = freshRuntime();
    const id = rt.start("collect", { customerId: "C-forget" });
    rt.forget(id);
    expect(rt.getInstance(id)).not.toBeNull();
    const internals = getInternals(rt);
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, internals.__getRegistered("collect")!)
      .exit("cancelled");
    rt.forget(id);
    expect(rt.getInstance(id)).toBeNull();
  });

  it("maxHistory drops the oldest step when the cap is exceeded", () => {
    const rt = createJourneyRuntime(
      [{ definition: journey, options: { maxHistory: 1 } }],
      { modules: { account: accountModule, debts: debtsModule }, debug: false },
    );
    const id = rt.start("collect", { customerId: "C-cap" });
    const internals = getInternals(rt);
    const reg = internals.__getRegistered("collect")!;
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, reg)
      .exit("wantsToNegotiate", { customerId: "C-cap" });
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, reg)
      .goBack!();
    // Two transitions each push once; cap=1 leaves history at length 1.
    expect(rt.getInstance(id)!.history.length).toBe(1);
  });

  it("coalesces rapid saves so there is at most one in flight", async () => {
    const saves: string[] = [];
    let resolveFirst: () => void = () => {};
    const firstDone = new Promise<void>((r) => {
      resolveFirst = r;
    });
    let sawFirst = false;
    const persistence = {
      keyFor: () => "k:coalesce",
      load: () => null,
      save: async (_k: string, b: any) => {
        saves.push(b.updatedAt);
        if (!sawFirst) {
          sawFirst = true;
          await firstDone;
        }
      },
      remove: async () => {},
    };
    const rt = freshRuntime({ options: { persistence: persistence as any } });
    const id = rt.start("collect", { customerId: "C-coalesce" });
    const internals = getInternals(rt);
    const reg = internals.__getRegistered("collect")!;
    // Fire three transitions rapid-fire — cancelled completes. Sequence:
    // start (save queued), cancelled (save queued & coalesces on top of the
    // first in-flight save). The runtime must have at most one save in
    // flight at a time.
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, reg)
      .exit("cancelled");
    // First save is paused; the terminal save must have coalesced.
    expect(saves.length).toBe(1);
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("records the terminal payload on the instance", () => {
    const rt = freshRuntime();
    const id = rt.start("collect", { customerId: "C-term" });
    const internals = getInternals(rt);
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, internals.__getRegistered("collect")!)
      .exit("done");
    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("completed");
    expect(inst.terminalPayload).toEqual({ result: "no-action" });
  });

  it("allows a transition to set state: undefined when in scope", () => {
    type NullableState = State | undefined;
    const j = defineJourney<Modules, NullableState>()({
      id: "collect",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({ customerId, attempts: 0 }),
      start: (s) => ({ module: "account", entry: "review", input: { customerId: (s as State).customerId } }),
      transitions: {
        account: {
          review: {
            wantsToNegotiate: () => ({ state: undefined, abort: { reason: "test" } }),
            done: () => ({ complete: null }),
            cancelled: () => ({ abort: { reason: "c" } }),
          },
        },
      },
    });
    const rt = createJourneyRuntime(
      [{ definition: j as never, options: undefined }],
      { modules: { account: accountModule, debts: debtsModule }, debug: false },
    );
    const id = rt.start("collect", { customerId: "C-u" });
    const internals = getInternals(rt);
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, internals.__getRegistered("collect")!)
      .exit("wantsToNegotiate", { customerId: "C-u" });
    expect(rt.getInstance(id)!.state).toBeUndefined();
  });
});
