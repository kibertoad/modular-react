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
    const rt = createJourneyRuntime([{ definition: { ...journey, onAbort }, options: undefined }], {
      modules: { account: accountModule, debts: debtsModule },
      debug: false,
    });
    const id = rt.start("collect", { customerId: "C-4" });
    const internals = getInternals(rt);
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, internals.__getRegistered("collect")!)
      .exit("cancelled");
    expect(rt.getInstance(id)!.status).toBe("aborted");
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("end() fires onAbandon and transitions to terminal", () => {
    const onAbandon = vi.fn().mockReturnValue({ abort: { reason: "forced" } });
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
    expect(rt.listDefinitions()).toEqual([{ id: "collect", version: "1.0.0", meta: undefined }]);
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
    // The initial load probe is async — wait for it to settle before
    // dispatching an exit, otherwise the runtime is still in `loading` and
    // would drop the exit on the floor.
    await Promise.resolve();
    await Promise.resolve();
    const internals1 = getInternals(rt1);
    const reg1 = internals1.__getRegistered("collect")!;
    internals1
      .__bindStepCallbacks(internals1.__getRecord(id1)!, reg1)
      .exit("wantsToNegotiate", { customerId: "C-rt" });
    // Drain the save queue (start save + post-transition save).
    await Promise.resolve();
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
    const rt = createJourneyRuntime([{ definition: journey, options: { maxHistory: 1 } }], {
      modules: { account: accountModule, debts: debtsModule },
      debug: false,
    });
    const id = rt.start("collect", { customerId: "C-cap" });
    const internals = getInternals(rt);
    const reg = internals.__getRegistered("collect")!;
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, reg)
      .exit("wantsToNegotiate", { customerId: "C-cap" });
    // After one exit: history=[review] (len=1, at cap).
    expect(rt.getInstance(id)!.history).toHaveLength(1);
    expect(rt.getInstance(id)!.history[0]!.entry).toBe("review");

    // Terminal exit pushes negotiate onto history, trimmed to the cap so
    // only the most recent entry survives — review drops off the front.
    internals.__bindStepCallbacks(internals.__getRecord(id)!, reg).exit("agreed", { amount: 100 });
    const history = rt.getInstance(id)!.history;
    expect(history).toHaveLength(1);
    expect(history[0]!.entry).toBe("negotiate");
  });

  it("treats maxHistory <= 0 as unbounded so history is preserved", () => {
    // A cap of 0 used to clear the entire history on every transition,
    // silently disabling goBack. It is now treated the same as a negative
    // value: unbounded. This pins that behavior.
    const rt = createJourneyRuntime([{ definition: journey, options: { maxHistory: 0 } }], {
      modules: { account: accountModule, debts: debtsModule },
      debug: false,
    });
    const id = rt.start("collect", { customerId: "C-zero" });
    const internals = getInternals(rt);
    const reg = internals.__getRegistered("collect")!;
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, reg)
      .exit("wantsToNegotiate", { customerId: "C-zero" });
    expect(rt.getInstance(id)!.history).toHaveLength(1);
    expect(rt.getInstance(id)!.history[0]!.entry).toBe("review");
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
    internals.__bindStepCallbacks(internals.__getRecord(id)!, reg).exit("cancelled");
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
      start: (s) => ({
        module: "account",
        entry: "review",
        input: { customerId: (s as State).customerId },
      }),
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
    const rt = createJourneyRuntime([{ definition: j as never, options: undefined }], {
      modules: { account: accountModule, debts: debtsModule },
      debug: false,
    });
    const id = rt.start("collect", { customerId: "C-u" });
    const internals = getInternals(rt);
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, internals.__getRegistered("collect")!)
      .exit("wantsToNegotiate", { customerId: "C-u" });
    expect(rt.getInstance(id)!.state).toBeUndefined();
  });

  it("forgetTerminal() drops every terminal instance in one call", () => {
    const rt = freshRuntime();
    const a = rt.start("collect", { customerId: "A" });
    const b = rt.start("collect", { customerId: "B" });
    const internals = getInternals(rt);
    // A completes, B is still active.
    internals
      .__bindStepCallbacks(internals.__getRecord(a)!, internals.__getRegistered("collect")!)
      .exit("done");
    expect(rt.forgetTerminal()).toBe(1);
    expect(rt.getInstance(a)).toBeNull();
    expect(rt.getInstance(b)).not.toBeNull();
    // Second call with nothing to sweep returns 0.
    expect(rt.forgetTerminal()).toBe(0);
  });

  it("end() tears down an instance that is still loading without firing onAbandon", async () => {
    let resolveLoad: (blob: null) => void = () => {};
    const loadPromise = new Promise<null>((r) => {
      resolveLoad = r;
    });
    const onAbandon = vi.fn().mockReturnValue({ abort: { reason: "should-not-fire" } });
    const rt = createJourneyRuntime(
      [
        {
          definition: { ...journey, onAbandon },
          options: {
            persistence: {
              keyFor: () => "k:loading-end",
              load: () => loadPromise,
              save: async () => {},
              remove: async () => {},
            } as never,
          },
        },
      ],
      { modules: { account: accountModule, debts: debtsModule }, debug: false },
    );
    const id = rt.start("collect", { customerId: "C-end-load" });
    // Still loading at this point — no step, no prior transitions.
    expect(rt.getInstance(id)!.status).toBe("loading");
    rt.end(id, "close-during-load");
    // Terminal immediately; onAbandon skipped because the journey never
    // actually started.
    expect(rt.getInstance(id)!.status).toBe("aborted");
    expect(onAbandon).not.toHaveBeenCalled();
    // Letting the load settle afterwards is safe — no duplicate transitions.
    resolveLoad(null);
    await Promise.resolve();
    await Promise.resolve();
    expect(rt.getInstance(id)!.status).toBe("aborted");
  });

  it("start() removes a terminal blob from persistence before minting a fresh instance", async () => {
    const remove = vi.fn<[string], void>();
    const terminalBlob = {
      definitionId: "collect",
      version: "1.0.0",
      instanceId: "ji_old",
      status: "completed" as const,
      step: null,
      history: [] as never[],
      state: { customerId: "C-stale", attempts: 0 },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    const persistence = {
      keyFor: () => "k:terminal",
      load: () => terminalBlob,
      save: async () => {},
      remove: (k: string) => {
        remove(k);
      },
    } as never;
    const rt = freshRuntime({ options: { persistence } });
    rt.start("collect", { customerId: "C-stale" });
    expect(remove).toHaveBeenCalledWith("k:terminal");
  });

  it("hydrate() throws when an instance with the same id is already live", () => {
    const rt = freshRuntime();
    const blob = {
      definitionId: "collect",
      version: "1.0.0",
      instanceId: "ji_dupe",
      status: "active" as const,
      step: { moduleId: "account", entry: "review", input: { customerId: "C-dupe" } },
      history: [] as never[],
      state: { customerId: "C-dupe", attempts: 0 },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    rt.hydrate("collect", blob);
    expect(() => rt.hydrate("collect", blob)).toThrow(/already in memory/);
  });

  it("start() mints a fresh id when a loaded blob's instanceId collides with a live instance", () => {
    // Seed a live instance via explicit hydrate so "ji_collide" is occupied.
    const liveBlob = {
      definitionId: "collect",
      version: "1.0.0",
      instanceId: "ji_collide",
      status: "active" as const,
      step: { moduleId: "account", entry: "review", input: { customerId: "C-live" } },
      history: [] as never[],
      state: { customerId: "C-live", attempts: 0 },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    // A separate, unrelated blob reachable via start()'s persistence probe —
    // same id, different customer. A corrupted / hand-edited blob would look
    // like this.
    const persistedBlob = {
      ...liveBlob,
      step: { moduleId: "account", entry: "review", input: { customerId: "C-persisted" } },
      state: { customerId: "C-persisted", attempts: 0 },
    };
    const persistence = {
      keyFor: () => "customer:persisted:collect",
      load: () => persistedBlob,
      save: async () => {},
      remove: async () => {},
    } as never;
    const rt = createJourneyRuntime([{ definition: journey, options: { persistence } }], {
      modules: { account: accountModule, debts: debtsModule },
      debug: false,
    });
    const liveId = rt.hydrate("collect", liveBlob);
    expect(liveId).toBe("ji_collide");
    const startedId = rt.start("collect", { customerId: "C-persisted" });
    // Must not clobber the live instance, even though the persisted blob
    // advertised its id.
    expect(startedId).not.toBe("ji_collide");
    expect(rt.getInstance("ji_collide")!.state).toEqual(liveBlob.state);
    expect(rt.getInstance(startedId)!.state).toEqual(persistedBlob.state);
  });

  it("hydrate() rejects a blob whose rollbackSnapshots length disagrees with history", () => {
    const rt = freshRuntime();
    const blob = {
      definitionId: "collect",
      version: "1.0.0",
      instanceId: "ji_badlen",
      status: "active" as const,
      step: { moduleId: "account", entry: "review", input: { customerId: "C-badlen" } },
      history: [{ moduleId: "debts", entry: "negotiate", input: { customerId: "C-badlen" } }],
      rollbackSnapshots: [] as never[],
      state: { customerId: "C-badlen", attempts: 0 },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    expect(() => rt.hydrate("collect", blob)).toThrow(/rollbackSnapshots\.length=0/);
  });

  it("keyFor collisions across journeys do not alias onto the same instance", async () => {
    // Two different journeys that happen to produce the same key string.
    const secondJourney = defineJourney<Modules, State>()({
      ...journey,
      id: "collect-v2",
    });
    const persistence = {
      keyFor: () => "shared-key",
      load: () => null,
      save: async () => {},
      remove: async () => {},
    } as never;
    const rt = createJourneyRuntime(
      [
        { definition: journey, options: { persistence } },
        { definition: secondJourney, options: { persistence } },
      ],
      { modules: { account: accountModule, debts: debtsModule }, debug: false },
    );
    const idA = rt.start("collect", { customerId: "X" });
    const idB = rt.start("collect-v2", { customerId: "X" });
    expect(idA).not.toBe(idB);
    expect(rt.getInstance(idA)!.journeyId).toBe("collect");
    expect(rt.getInstance(idB)!.journeyId).toBe("collect-v2");
  });

  it("falls through to startFresh when persistence.load rejects", async () => {
    const persistence = {
      keyFor: () => "k:load-reject",
      load: () => Promise.reject(new Error("backend down")),
      save: async () => {},
      remove: async () => {},
    };
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const rt = freshRuntime({ options: { persistence: persistence as any } });
    const id = rt.start("collect", { customerId: "C-reject" });
    // Instance is placeholder in `loading` until the rejected probe settles.
    expect(rt.getInstance(id)!.status).toBe("loading");
    await Promise.resolve();
    await Promise.resolve();
    // Failed load logs (debug defaults to NODE_ENV !== 'production') and the
    // runtime recovers into a fresh active instance rather than leaving the
    // placeholder stuck in `loading` forever.
    expect(rt.getInstance(id)!.status).toBe("active");
    expect(rt.getInstance(id)!.step!.moduleId).toBe("account");
    warn.mockRestore();
  });

  it("hydrate() surfaces a JourneyHydrationError when onHydrate throws", () => {
    const onHydrate = () => {
      throw new Error("migration bailed");
    };
    const rt = createJourneyRuntime(
      [{ definition: { ...journey, onHydrate } as never, options: undefined }],
      { modules: { account: accountModule, debts: debtsModule }, debug: false },
    );
    const blob = {
      definitionId: "collect",
      version: "0.0.0",
      instanceId: "ji_throw",
      status: "active" as const,
      step: { moduleId: "account", entry: "review", input: { customerId: "C-throw" } },
      history: [] as never[],
      state: { customerId: "C-throw", attempts: 0 },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    // `onHydrate` throwing maps to the same "migration failed" path as a
    // version mismatch without `onHydrate` — the caller gets a typed
    // `JourneyHydrationError` instead of the raw thrown error.
    expect(() => rt.hydrate("collect", blob)).toThrow(/version mismatch/);
  });

  it("legacy blobs without rollbackSnapshots hydrate cleanly", () => {
    const rt = freshRuntime();
    const blob = {
      definitionId: "collect",
      version: "1.0.0",
      instanceId: "ji_legacy",
      status: "active" as const,
      step: { moduleId: "debts", entry: "negotiate", input: { customerId: "C-legacy" } },
      // One history entry, no rollbackSnapshots at all — the legacy blob
      // shape from releases before rollback support shipped.
      history: [{ moduleId: "account", entry: "review", input: { customerId: "C-legacy" } }],
      state: { customerId: "C-legacy", attempts: 1 },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    const id = rt.hydrate("collect", blob);
    const inst = rt.getInstance(id)!;
    expect(inst.step!.entry).toBe("negotiate");
    expect(inst.history).toHaveLength(1);
    // The serialized round-trip omits rollbackSnapshots when no slot
    // actually holds one — the in-memory record stays length-aligned with
    // history regardless.
    expect(inst.serialize().rollbackSnapshots).toBeUndefined();
  });

  it("defers persistence.remove until an in-flight save settles", async () => {
    // A slow adapter that lets us observe the order of save/remove calls.
    let releaseSave: () => void = () => {};
    const savePromise = new Promise<void>((r) => {
      releaseSave = r;
    });
    const calls: string[] = [];
    const persistence = {
      keyFor: () => "k:race",
      load: () => null,
      save: async (_k: string, _b: any) => {
        calls.push("save-start");
        await savePromise;
        calls.push("save-end");
      },
      remove: async () => {
        calls.push("remove");
      },
    };
    const rt = freshRuntime({ options: { persistence: persistence as any } });
    const id = rt.start("collect", { customerId: "C-race" });
    // save-start has already been queued by the start(). Before it settles,
    // fire the terminal transition — the runtime would otherwise call
    // remove immediately and race the save.
    const internals = getInternals(rt);
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, internals.__getRegistered("collect")!)
      .exit("cancelled");
    // remove should NOT have fired yet — it is deferred until save settles.
    expect(calls).toEqual(["save-start"]);
    releaseSave();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // Final ordering: save finished first, remove ran afterwards.
    expect(calls).toEqual(["save-start", "save-end", "remove"]);
  });

  it("coalesces pending saves even when an earlier save rejects", async () => {
    const outcomes: string[] = [];
    let attempts = 0;
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((r) => {
      releaseFirst = r;
    });
    const persistence = {
      keyFor: () => "k:reject-coalesce",
      load: () => null,
      save: async (_k: string, b: any) => {
        attempts += 1;
        if (attempts === 1) {
          await firstGate;
          outcomes.push(`reject:${b.updatedAt}`);
          throw new Error("transient");
        }
        outcomes.push(`ok:${b.updatedAt}`);
      },
      remove: async () => {},
    };
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const rt = freshRuntime({ options: { persistence: persistence as any } });
    const id = rt.start("collect", { customerId: "C-coalesce-reject" });
    const internals = getInternals(rt);
    // Queue a second save on top of the blocked first one. The pending
    // save should still flush after the first one rejects.
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, internals.__getRegistered("collect")!)
      .exit("wantsToNegotiate", { customerId: "C-coalesce-reject" });
    expect(attempts).toBe(1);
    releaseFirst();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(attempts).toBe(2);
    expect(outcomes[0]!.startsWith("reject")).toBe(true);
    expect(outcomes[1]!.startsWith("ok")).toBe(true);
    warn.mockRestore();
  });

  it("fires the definition onTransition before the registration-level onTransition", () => {
    const order: string[] = [];
    const defOnTransition = vi.fn(() => {
      order.push("definition");
    });
    const regOnTransition = vi.fn(() => {
      order.push("registration");
    });
    const rt = createJourneyRuntime(
      [
        {
          definition: { ...journey, onTransition: defOnTransition },
          options: { onTransition: regOnTransition },
        },
      ],
      { modules: { account: accountModule, debts: debtsModule }, debug: false },
    );
    rt.start("collect", { customerId: "C-order" });
    // Just the start transition is enough to observe the pair.
    expect(order).toEqual(["definition", "registration"]);
  });

  it("warns in debug mode when a transition handler returns a Promise", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const rt = createJourneyRuntime(
      [
        {
          definition: {
            ...journey,
            transitions: {
              account: {
                review: {
                  wantsToNegotiate: (() =>
                    Promise.resolve({ abort: { reason: "async-bad" } })) as never,
                  done: journey.transitions.account!.review!.done!,
                  cancelled: journey.transitions.account!.review!.cancelled!,
                },
              },
              debts: journey.transitions.debts!,
            },
          },
          options: undefined,
        },
      ],
      { modules: { account: accountModule, debts: debtsModule }, debug: true },
    );
    const id = rt.start("collect", { customerId: "C-async-handler" });
    const internals = getInternals(rt);
    internals
      .__bindStepCallbacks(internals.__getRecord(id)!, internals.__getRegistered("collect")!)
      .exit("wantsToNegotiate", { customerId: "C-async-handler" });
    expect(rt.getInstance(id)!.status).toBe("aborted");
    expect(
      warn.mock.calls.some((args) => String(args[0] ?? "").includes("returned a Promise")),
    ).toBe(true);
    warn.mockRestore();
  });
});
