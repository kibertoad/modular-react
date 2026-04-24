import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { createJourneyRuntime } from "./runtime.js";
import { createTestHarness } from "./testing.js";

const exits = {
  next: defineExit<{ amount: number }>(),
  done: defineExit<{ total: number }>(),
} as const;

const mod = defineModule({
  id: "m",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    first: defineEntry({
      component: (() => null) as any,
      input: schema<{ id: string }>(),
    }),
    second: defineEntry({
      component: (() => null) as any,
      input: schema<{ carried: number }>(),
      allowBack: "preserve-state",
    }),
  },
});

type Modules = { readonly m: typeof mod };

interface Input {
  readonly id: string;
}

const journey = defineJourney<Modules, { carried: number }>()({
  id: "t",
  version: "1.0.0",
  initialState: (_: Input) => ({ carried: 0 }),
  start: (_s, input) => ({ module: "m", entry: "first", input: { id: input.id } }),
  transitions: {
    m: {
      first: {
        next: ({ output }) => ({
          state: { carried: output.amount },
          next: { module: "m", entry: "second", input: { carried: output.amount } },
        }),
      },
      second: {
        allowBack: true,
        done: ({ output }) => ({ complete: { total: output.total } }),
      },
    },
  },
});

function makeRuntime() {
  return createJourneyRuntime([{ definition: journey, options: undefined }], {
    modules: { m: mod },
    debug: false,
  });
}

describe("createTestHarness", () => {
  it("inspect returns the current runtime record fields", () => {
    const rt = makeRuntime();
    const harness = createTestHarness(rt);
    const id = rt.start("t", { id: "a" });
    const snap = harness.inspect<{ carried: number }>(id);
    expect(snap.status).toBe("active");
    expect(snap.step).toEqual({ moduleId: "m", entry: "first", input: { id: "a" } });
    expect(snap.state.carried).toBe(0);
    expect(snap.stepToken).toBe(1);
    expect(snap.retryCount).toBe(0);
  });

  it("fireExit drives the runtime to the next step", () => {
    const rt = makeRuntime();
    const harness = createTestHarness(rt);
    const id = rt.start("t", { id: "b" });
    harness.fireExit(id, "next", { amount: 7 });
    const snap = harness.inspect<{ carried: number }>(id);
    expect(snap.step?.entry).toBe("second");
    expect(snap.state.carried).toBe(7);
  });

  it("goBack walks back to the prior step when the journey opts in", () => {
    const rt = makeRuntime();
    const harness = createTestHarness(rt);
    const id = rt.start("t", { id: "c" });
    harness.fireExit(id, "next", { amount: 3 });
    harness.goBack(id);
    expect(harness.inspect(id).step?.entry).toBe("first");
  });

  it("inspect returns a stable history snapshot that does not mutate as the runtime advances", () => {
    const rt = makeRuntime();
    const harness = createTestHarness(rt);
    const id = rt.start("t", { id: "d" });
    harness.fireExit(id, "next", { amount: 4 });
    const snap = harness.inspect(id);
    const historyLen = snap.history.length;
    harness.goBack(id);
    harness.fireExit(id, "next", { amount: 5 });
    expect(snap.history.length).toBe(historyLen);
  });

  it("throws a readable error when the instance id is unknown", () => {
    const rt = makeRuntime();
    const harness = createTestHarness(rt);
    expect(() => harness.inspect("ji_does_not_exist")).toThrow(/No instance with id/);
    expect(() => harness.fireExit("ji_does_not_exist", "next")).toThrow(/No instance with id/);
    expect(() => harness.goBack("ji_does_not_exist")).toThrow(/No instance with id/);
  });
});
