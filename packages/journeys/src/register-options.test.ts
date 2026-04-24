import { describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { createJourneyRuntime, getInternals } from "./runtime.js";

// Minimal fixture — one module with two exits, one that completes, one that
// aborts. Keeps each test scenario small without pulling in the broader
// runtime.test.ts fixtures.

const exits = {
  finish: defineExit<{ amount: number }>(),
  cancel: defineExit(),
  boom: defineExit(),
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

const makeJourney = (
  definitionHooks: {
    onComplete?: (ctx: any, r: unknown) => void;
    onAbort?: (ctx: any, r: unknown) => void;
    onAbandon?: (ctx: any) => any;
    onHydrate?: (b: any) => any;
  } = {},
) =>
  defineJourney<Modules, { id: string }>()({
    id: "j",
    version: "1.0.0",
    initialState: (input: { id: string }) => ({ id: input.id }),
    start: (s) => ({ module: "m", entry: "step", input: { id: s.id } }),
    transitions: {
      m: {
        step: {
          finish: ({ output }) => ({ complete: { amount: output.amount } }),
          cancel: () => ({ abort: { reason: "user-cancelled" } }),
          boom: () => {
            throw new Error("transition threw");
          },
        },
      },
    },
    ...definitionHooks,
  });

function driveExit(
  rt: ReturnType<typeof createJourneyRuntime>,
  id: string,
  exit: string,
  output?: unknown,
) {
  const internals = getInternals(rt);
  const rec = internals.__getRecord(id)!;
  const reg = internals.__getRegistered("j")!;
  internals.__bindStepCallbacks(rec, reg).exit(exit, output);
}

describe("JourneyRegisterOptions — registration-level hooks", () => {
  describe("onComplete", () => {
    it("fires after the definition-level onComplete", () => {
      const order: string[] = [];
      const journey = makeJourney({
        onComplete: () => void order.push("def"),
      });
      const rt = createJourneyRuntime(
        [
          {
            definition: journey,
            options: {
              onComplete: () => void order.push("reg"),
            },
          },
        ],
        { modules: { m: mod }, debug: false },
      );
      const id = rt.start("j", { id: "a" });
      driveExit(rt, id, "finish", { amount: 5 });
      expect(order).toEqual(["def", "reg"]);
    });

    it("fires standalone when no definition-level hook is set", () => {
      const regComplete = vi.fn();
      const rt = createJourneyRuntime(
        [{ definition: makeJourney(), options: { onComplete: regComplete } }],
        { modules: { m: mod }, debug: false },
      );
      const id = rt.start("j", { id: "b" });
      driveExit(rt, id, "finish", { amount: 7 });
      expect(regComplete).toHaveBeenCalledTimes(1);
      expect(regComplete.mock.calls[0][1]).toEqual({ amount: 7 });
    });

    it("a throw in one hook does not suppress the other, and the journey still completes", () => {
      const defComplete = vi.fn(() => {
        throw new Error("def-complete-boom");
      });
      const regComplete = vi.fn(() => {
        throw new Error("reg-complete-boom");
      });
      const rt = createJourneyRuntime(
        [
          {
            definition: makeJourney({ onComplete: defComplete }),
            options: { onComplete: regComplete },
          },
        ],
        { modules: { m: mod }, debug: false },
      );
      const id = rt.start("j", { id: "a2" });
      expect(() => driveExit(rt, id, "finish", { amount: 1 })).not.toThrow();
      expect(defComplete).toHaveBeenCalledTimes(1);
      expect(regComplete).toHaveBeenCalledTimes(1);
      expect(rt.getInstance(id)!.status).toBe("completed");
      expect(rt.getInstance(id)!.terminalPayload).toEqual({ amount: 1 });
    });
  });

  describe("onAbort", () => {
    it("fires after the definition-level onAbort on `{ abort }` transition", () => {
      const order: string[] = [];
      const journey = makeJourney({
        onAbort: () => void order.push("def"),
      });
      const rt = createJourneyRuntime(
        [{ definition: journey, options: { onAbort: () => void order.push("reg") } }],
        { modules: { m: mod }, debug: false },
      );
      const id = rt.start("j", { id: "c" });
      driveExit(rt, id, "cancel");
      expect(order).toEqual(["def", "reg"]);
    });
  });

  describe("onAbandon", () => {
    it("registration overrides the definition's handler", () => {
      const defAbandon = vi.fn(() => ({ abort: { reason: "def-abandoned" } }));
      const regAbandon = vi.fn(() => ({ abort: { reason: "reg-abandoned" } }));
      const journey = makeJourney({ onAbandon: defAbandon });
      const rt = createJourneyRuntime(
        [{ definition: journey, options: { onAbandon: regAbandon } }],
        { modules: { m: mod }, debug: false },
      );
      const id = rt.start("j", { id: "d" });
      rt.end(id);
      expect(regAbandon).toHaveBeenCalledTimes(1);
      expect(defAbandon).not.toHaveBeenCalled();
      expect(rt.getInstance(id)!.terminalPayload).toEqual({ reason: "reg-abandoned" });
    });

    it("falls back to the definition when no registration-level handler is set", () => {
      const defAbandon = vi.fn(() => ({ abort: { reason: "def-abandoned" } }));
      const rt = createJourneyRuntime(
        [{ definition: makeJourney({ onAbandon: defAbandon }), options: undefined }],
        { modules: { m: mod }, debug: false },
      );
      const id = rt.start("j", { id: "e" });
      rt.end(id);
      expect(defAbandon).toHaveBeenCalledTimes(1);
      expect(rt.getInstance(id)!.terminalPayload).toEqual({ reason: "def-abandoned" });
    });

    it("a throw in onAbandon surfaces through onError and falls back to the default abort", () => {
      const regOnError = vi.fn();
      const regAbandon = vi.fn(() => {
        throw new Error("abandon-boom");
      });
      const rt = createJourneyRuntime(
        [
          {
            definition: makeJourney(),
            options: { onAbandon: regAbandon, onError: regOnError },
          },
        ],
        { modules: { m: mod }, debug: false },
      );
      const id = rt.start("j", { id: "e2" });
      rt.end(id);
      expect(regAbandon).toHaveBeenCalledTimes(1);
      expect(regOnError).toHaveBeenCalledTimes(1);
      const [err] = regOnError.mock.calls[0];
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("abandon-boom");
      expect(rt.getInstance(id)!.status).toBe("aborted");
      expect(rt.getInstance(id)!.terminalPayload).toEqual({ reason: "abandoned" });
    });
  });

  describe("onHydrate", () => {
    it("layers on top of the definition-level onHydrate", () => {
      const marks: string[] = [];
      const defOnHydrate = vi.fn((blob: any) => {
        marks.push("def");
        return { ...blob, version: "1.0.0", state: { ...blob.state, tag: "def" } };
      });
      const regOnHydrate = vi.fn((blob: any) => {
        marks.push("reg");
        return { ...blob, state: { ...blob.state, tag: `${blob.state.tag}+reg` } };
      });
      const journey = makeJourney({ onHydrate: defOnHydrate });
      const rt = createJourneyRuntime(
        [{ definition: journey, options: { onHydrate: regOnHydrate } }],
        { modules: { m: mod }, debug: false },
      );

      // Hand-crafted blob with a version mismatch — the definition's onHydrate
      // rewrites it to a matching version, then the registration's layers on.
      const blob = {
        definitionId: "j",
        version: "0.9.0",
        instanceId: "ji_test_old",
        status: "active" as const,
        step: { moduleId: "m", entry: "step", input: { id: "x" } },
        history: [],
        rollbackSnapshots: undefined,
        terminalPayload: undefined,
        state: { id: "x" },
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      const id = rt.hydrate("j", blob as never);
      expect(marks).toEqual(["def", "reg"]);
      expect((rt.getInstance(id)!.state as any).tag).toBe("def+reg");
    });

    it("wraps a throw from the registration-level onHydrate as JourneyHydrationError", async () => {
      const { JourneyHydrationError } = await import("./validation.js");
      const regOnHydrate = vi.fn(() => {
        throw new Error("reg-hydrate-boom");
      });
      const rt = createJourneyRuntime(
        [{ definition: makeJourney(), options: { onHydrate: regOnHydrate } }],
        { modules: { m: mod }, debug: false },
      );
      const blob = {
        definitionId: "j",
        version: "1.0.0",
        instanceId: "ji_hydrate_reg_throw",
        status: "active" as const,
        step: { moduleId: "m", entry: "step", input: { id: "x" } },
        history: [],
        rollbackSnapshots: undefined,
        terminalPayload: undefined,
        state: { id: "x" },
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      expect(() => rt.hydrate("j", blob as never)).toThrow(JourneyHydrationError);
      expect(regOnHydrate).toHaveBeenCalledTimes(1);
    });
  });

  describe("onError", () => {
    it("fires on a transition handler throw alongside the abort", () => {
      const regOnError = vi.fn();
      const rt = createJourneyRuntime(
        [{ definition: makeJourney(), options: { onError: regOnError } }],
        { modules: { m: mod }, debug: false },
      );
      const id = rt.start("j", { id: "f" });
      driveExit(rt, id, "boom");
      expect(regOnError).toHaveBeenCalledTimes(1);
      const [err, ctx] = regOnError.mock.calls[0];
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("transition threw");
      expect(ctx.step).toMatchObject({ moduleId: "m", entry: "step" });
      expect(rt.getInstance(id)!.status).toBe("aborted");
    });
  });
});
