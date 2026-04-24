import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { createJourneyRuntime, getInternals } from "./runtime.js";
import { defineJourneyHandle } from "./handle.js";

const exits = {
  finish: defineExit<{ amount: number }>(),
} as const;

const mod = defineModule({
  id: "m",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    step: defineEntry({
      component: (() => null) as any,
      input: schema<{ id: string }>(),
    }),
  },
});

type Modules = { readonly m: typeof mod };

interface Input {
  readonly id: string;
}

const journey = defineJourney<Modules, Input>()({
  id: "demo",
  version: "1.0.0",
  initialState: (input: Input) => ({ id: input.id }),
  start: (s) => ({ module: "m", entry: "step", input: { id: s.id } }),
  transitions: {
    m: {
      step: {
        finish: ({ output }) => ({ complete: { amount: output.amount } }),
      },
    },
  },
});

describe("defineJourneyHandle", () => {
  it("exposes the journey id", () => {
    const handle = defineJourneyHandle(journey);
    expect(handle.id).toBe("demo");
  });
});

describe("JourneyRuntime.start — handle overload", () => {
  it("accepts a handle and drives the same underlying state machine", () => {
    const rt = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: { m: mod },
      debug: false,
    });
    const handle = defineJourneyHandle(journey);
    const id = rt.start(handle, { id: "h-1" });
    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("active");
    expect(inst.step).toEqual({ moduleId: "m", entry: "step", input: { id: "h-1" } });
  });

  it("produces the same instance id as the string-id form for a persisted journey", () => {
    // With persistence, calling start twice with the same input returns the
    // same instance id. Confirm that start(handle, input) and
    // start(id, input) reach the same idempotency path.
    const store = new Map<string, unknown>();
    const persistence = {
      keyFor: ({ input }: { input: unknown }) => `demo:${(input as Input).id}`,
      load: (key: string) => (store.get(key) ?? null) as never,
      save: (key: string, blob: unknown) => void store.set(key, blob),
      remove: (key: string) => void store.delete(key),
    };
    const rt = createJourneyRuntime(
      [{ definition: journey, options: { persistence: persistence as never } }],
      { modules: { m: mod }, debug: false },
    );
    const handle = defineJourneyHandle(journey);
    const idA = rt.start("demo", { id: "same" });
    const idB = rt.start(handle, { id: "same" });
    expect(idA).toBe(idB);
  });

  it("surfaces the handle's id in the step that hydrates the journey", () => {
    // Smoke test: the runtime's internals resolve the registered definition
    // via the same path whether we pass a string or a handle.
    const rt = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: { m: mod },
      debug: false,
    });
    const handle = defineJourneyHandle(journey);
    const id = rt.start(handle, { id: "x" });
    const internals = getInternals(rt);
    expect(internals.__getRegistered("demo")).toBeDefined();
    expect(rt.getInstance(id)!.journeyId).toBe("demo");
  });
});
