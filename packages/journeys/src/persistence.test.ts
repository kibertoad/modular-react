import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { SerializedJourney } from "./types.js";
import { defineJourney } from "./define-journey.js";
import { createJourneyRuntime } from "./runtime.js";
import { createMemoryPersistence, createWebStoragePersistence } from "./persistence.js";

interface TInput {
  readonly customerId: string;
}
interface TState {
  readonly step: number;
}

const makeBlob = (instanceId = "i-1"): SerializedJourney<TState> => ({
  definitionId: "onboarding",
  version: "1.0.0",
  instanceId,
  status: "active",
  step: { moduleId: "m", entry: "e", input: {} },
  history: [],
  state: { step: 1 },
  startedAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

describe("createWebStoragePersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("round-trips a blob through localStorage by default", () => {
    const adapter = createWebStoragePersistence<TInput, TState>({
      keyFor: ({ journeyId, input }) => `${journeyId}:${input.customerId}`,
    });
    const key = adapter.keyFor({ journeyId: "onboarding", input: { customerId: "C-1" } });
    const blob = makeBlob();

    adapter.save(key, blob);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(blob);
    expect(adapter.load(key)).toEqual(blob);
  });

  it("load returns null for a missing key", () => {
    const adapter = createWebStoragePersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
    });
    expect(adapter.load("does-not-exist")).toBeNull();
  });

  it("load removes and returns null on invalid JSON so a bad write doesn't wedge future loads", () => {
    const adapter = createWebStoragePersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
    });
    localStorage.setItem("corrupt", "{not json");

    expect(adapter.load("corrupt")).toBeNull();
    expect(localStorage.getItem("corrupt")).toBeNull();
  });

  it("remove deletes the key", () => {
    const adapter = createWebStoragePersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
    });
    adapter.save("k", makeBlob());
    adapter.remove("k");
    expect(localStorage.getItem("k")).toBeNull();
  });

  it("accepts sessionStorage for tab-scoped persistence", () => {
    const adapter = createWebStoragePersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
      storage: sessionStorage,
    });
    const blob = makeBlob();
    adapter.save("k", blob);

    expect(sessionStorage.getItem("k")).not.toBeNull();
    expect(localStorage.getItem("k")).toBeNull();
    expect(adapter.load("k")).toEqual(blob);
  });

  it("no-ops when storage is null (SSR path)", () => {
    const adapter = createWebStoragePersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
      storage: null,
    });
    expect(() => adapter.save("k", makeBlob())).not.toThrow();
    expect(adapter.load("k")).toBeNull();
    expect(() => adapter.remove("k")).not.toThrow();
  });

  it("evaluates a lazy storage getter on every call so feature detection can flip at runtime", () => {
    let available = false;
    const adapter = createWebStoragePersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
      storage: () => (available ? localStorage : null),
    });

    // Hydration phase — storage unavailable.
    adapter.save("k", makeBlob());
    expect(localStorage.getItem("k")).toBeNull();

    // Post-hydration — storage came online.
    available = true;
    adapter.save("k", makeBlob());
    expect(localStorage.getItem("k")).not.toBeNull();
  });

  it("keyFor is passed through verbatim so shells can probe storage outside the runtime", () => {
    const adapter = createWebStoragePersistence<TInput, TState>({
      keyFor: ({ journeyId, input }) => `journey:${input.customerId}:${journeyId}`,
    });
    expect(adapter.keyFor({ journeyId: "onboarding", input: { customerId: "C-1" } })).toBe(
      "journey:C-1:onboarding",
    );
  });

  it("save propagates storage errors (quota, private-mode Safari) so callers can handle them", () => {
    // Emulate a Safari private-mode / quota-exceeded failure. The runtime's
    // save path logs under `debug`, but direct callers need the error.
    const fakeStorage: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    const adapter = createWebStoragePersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
      storage: fakeStorage,
    });
    expect(() => adapter.save("k", makeBlob())).toThrow(/quota/i);
  });

  it("round-trips rollbackSnapshots with null placeholders so history stays aligned", () => {
    const adapter = createWebStoragePersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
    });
    const blob: SerializedJourney<TState> = {
      ...makeBlob(),
      rollbackSnapshots: [null, { step: 2 }, null],
    };
    adapter.save("k", blob);
    expect(adapter.load("k")).toEqual(blob);
  });
});

describe("createMemoryPersistence", () => {
  it("round-trips a blob", () => {
    const store = createMemoryPersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
    });
    const blob = makeBlob();

    store.save("k", blob);
    expect(store.load("k")).toEqual(blob);
  });

  it("load returns null for a missing key", () => {
    const store = createMemoryPersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
    });
    expect(store.load("missing")).toBeNull();
  });

  it("seed entries preload the store", () => {
    const blob = makeBlob();
    const store = createMemoryPersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
      initial: [["pre", blob]],
    });
    expect(store.load("pre")).toEqual(blob);
    expect(store.size()).toBe(1);
  });

  it("clones seed entries — mutating the source blob doesn't corrupt storage", () => {
    const blob = makeBlob();
    const store = createMemoryPersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
      initial: [["pre", blob]],
    });

    (blob.state as { step: number }).step = 999;

    expect(store.load("pre")!.state.step).toBe(1);
  });

  it("clones on save — mutating the passed blob afterwards doesn't corrupt storage", () => {
    const store = createMemoryPersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
    });
    const blob = makeBlob();
    store.save("k", blob);

    (blob.state as { step: number }).step = 999;

    expect(store.load("k")!.state.step).toBe(1);
  });

  it("clones on load — mutating the returned blob doesn't corrupt storage", () => {
    const store = createMemoryPersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
    });
    store.save("k", makeBlob());

    const first = store.load("k")!;
    (first.state as { step: number }).step = 42;

    expect(store.load("k")!.state.step).toBe(1);
  });

  it("clone: false returns aliased references (opt-in escape hatch)", () => {
    const store = createMemoryPersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
      clone: false,
    });
    store.save("k", makeBlob());

    const a = store.load("k")!;
    const b = store.load("k")!;
    expect(a).toBe(b);
  });

  it("remove deletes and clear empties", () => {
    const store = createMemoryPersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
    });
    store.save("a", makeBlob("i-a"));
    store.save("b", makeBlob("i-b"));
    expect(store.size()).toBe(2);

    store.remove("a");
    expect(store.load("a")).toBeNull();
    expect(store.size()).toBe(1);

    store.clear();
    expect(store.size()).toBe(0);
  });

  it("entries returns a snapshot copy, not a live view", () => {
    const store = createMemoryPersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
    });
    store.save("k", makeBlob());

    const snapshot = store.entries();
    store.clear();

    expect(snapshot).toHaveLength(1);
    expect(store.size()).toBe(0);
  });

  it("entries clones each blob so mutating a returned entry doesn't corrupt storage", () => {
    const store = createMemoryPersistence<TInput, TState>({
      keyFor: ({ input }) => `x:${input.customerId}`,
    });
    store.save("k", makeBlob());

    const [[, entryBlob]] = store.entries();
    (entryBlob.state as { step: number }).step = 999;

    expect(store.load("k")!.state.step).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Runtime integration smoke tests
//
// Wire each stock factory into a real `createJourneyRuntime` to confirm the
// adapter satisfies the runtime's expectations end-to-end (types fit,
// `start()` is idempotent, blobs actually reach the backing store). The rest
// of the persistence lifecycle — async ordering, remove-after-save — is
// covered by `runtime.test.ts` against mock adapters.
// ---------------------------------------------------------------------------

describe("stock adapters end-to-end with createJourneyRuntime", () => {
  const stepModule = defineModule({
    id: "step",
    version: "1.0.0",
    exitPoints: { done: defineExit() },
    entryPoints: {
      view: defineEntry({
        component: (() => null) as any,
        input: schema<{ customerId: string }>(),
      }),
    },
  });

  type Modules = { readonly step: typeof stepModule };
  interface SmokeState {
    readonly customerId: string;
  }
  interface SmokeInput {
    readonly customerId: string;
  }

  const smokeJourney = defineJourney<Modules, SmokeState>()({
    id: "smoke",
    version: "1.0.0",
    initialState: ({ customerId }: SmokeInput) => ({ customerId }),
    start: (s) => ({ module: "step", entry: "view", input: { customerId: s.customerId } }),
    transitions: {
      step: {
        view: {
          done: () => ({ complete: { ok: true } }),
        },
      },
    },
  });

  const drainSaveQueue = async () => {
    // The runtime serializes `save()` off the microtask queue.
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it("createMemoryPersistence: start() twice with same input returns the same instanceId", async () => {
    const persistence = createMemoryPersistence<SmokeInput, SmokeState>({
      keyFor: ({ journeyId, input }) => `${journeyId}:${input.customerId}`,
    });
    const rt = createJourneyRuntime([{ definition: smokeJourney, options: { persistence } }], {
      modules: { step: stepModule },
      debug: false,
    });

    const idA = rt.start("smoke", { customerId: "C-42" });
    await drainSaveQueue();

    // Blob actually reached the backing store (tests the adapter's save path,
    // not just the runtime's intent to save).
    expect(persistence.size()).toBe(1);
    expect(persistence.load("smoke:C-42")!.instanceId).toBe(idA);

    const idB = rt.start("smoke", { customerId: "C-42" });
    expect(idB).toBe(idA);
  });

  it("createWebStoragePersistence: start() twice with same input returns the same instanceId", async () => {
    const persistence = createWebStoragePersistence<SmokeInput, SmokeState>({
      keyFor: ({ journeyId, input }) => `${journeyId}:${input.customerId}`,
    });
    const rt = createJourneyRuntime([{ definition: smokeJourney, options: { persistence } }], {
      modules: { step: stepModule },
      debug: false,
    });

    const idA = rt.start("smoke", { customerId: "C-77" });
    await drainSaveQueue();

    // Direct localStorage inspection: confirms the adapter serialized through
    // to the actual Web Storage API, not just its own in-memory surface.
    const raw = localStorage.getItem("smoke:C-77");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).instanceId).toBe(idA);

    const idB = rt.start("smoke", { customerId: "C-77" });
    expect(idB).toBe(idA);
  });
});
