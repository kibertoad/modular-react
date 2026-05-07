import { describe, expect, it } from "vitest";
import {
  defineTransition,
  isAnnotatedTransition,
  isTerminalSentinel,
} from "./define-transition.js";

describe("defineTransition", () => {
  it("returns a function callable with the same signature as the bare handler", () => {
    const handler = defineTransition({
      targets: [{ module: "plan", entry: "choose" }],
      handle: ({ output }: { output: { hint: string } }) => ({
        next: { module: "plan", entry: "choose", input: { hint: output.hint } },
      }),
    });
    expect(typeof handler).toBe("function");
    const result = handler({
      state: undefined,
      input: undefined,
      output: { hint: "cheap" },
    });
    expect(result).toEqual({
      next: { module: "plan", entry: "choose", input: { hint: "cheap" } },
    });
  });

  it("attaches `targets` as a non-enumerable readonly property", () => {
    const handler = defineTransition({
      targets: [
        { module: "plan", entry: "choose" },
        { module: "billing", entry: "collect" },
      ],
      handle: () => ({ abort: { reason: "noop" } }),
    });
    expect(handler.targets).toEqual([
      { module: "plan", entry: "choose" },
      { module: "billing", entry: "collect" },
    ]);
    // Non-enumerable: structural iteration over the transitions map should
    // not surface `targets` as a phantom exit name.
    expect(Object.keys(handler)).not.toContain("targets");
    // Frozen: cannot be mutated by accident — neither the array nor the
    // individual target objects.
    expect(() => {
      (handler.targets as unknown as { module: string }[])[0] = { module: "x" } as never;
    }).toThrow();
    expect(() => {
      (handler.targets[0] as unknown as { module: string }).module = "x";
    }).toThrow();
  });

  it("freezes a copy of the targets array (caller mutations don't leak in)", () => {
    const targets: { module: string; entry: string }[] = [{ module: "plan", entry: "choose" }];
    const handler = defineTransition({
      targets,
      handle: () => ({ abort: { reason: "noop" } }),
    });
    targets.push({ module: "billing", entry: "collect" });
    expect(handler.targets).toEqual([{ module: "plan", entry: "choose" }]);
  });

  it('supports handlers that return `complete` via the `"complete"` sentinel', () => {
    const handler = defineTransition({
      targets: ["complete"] as const,
      handle: ({ output }: { output: { id: string } }) => ({
        complete: { result: output.id },
      }),
    });
    expect(handler.targets).toEqual(["complete"]);
    expect(handler({ state: undefined, input: undefined, output: { id: "x" } })).toEqual({
      complete: { result: "x" },
    });
  });

  it('supports handlers that return `abort` via the `"abort"` sentinel', () => {
    const handler = defineTransition({
      targets: ["abort"] as const,
      handle: () => ({ abort: { reason: "user-cancelled" } }),
    });
    expect(handler.targets).toEqual(["abort"]);
    expect(handler({ state: undefined, input: undefined, output: undefined })).toEqual({
      abort: { reason: "user-cancelled" },
    });
  });

  it("mixes step refs and terminal sentinels in the same `targets` array", () => {
    const handler = defineTransition({
      targets: [{ module: "plan", entry: "choose" }, "abort"] as const,
      handle: ({ output }: { output: { kind: "ok" | "no" } }) =>
        output.kind === "ok"
          ? { next: { module: "plan", entry: "choose", input: {} } }
          : { abort: { reason: "rejected" } },
    });
    expect(handler.targets).toEqual([{ module: "plan", entry: "choose" }, "abort"]);
    expect(handler({ state: undefined, input: undefined, output: { kind: "ok" } })).toEqual({
      next: { module: "plan", entry: "choose", input: {} },
    });
    expect(handler({ state: undefined, input: undefined, output: { kind: "no" } })).toEqual({
      abort: { reason: "rejected" },
    });
  });

  it("freezes string sentinels in place (they're already immutable, but the array stays frozen)", () => {
    const handler = defineTransition({
      targets: ["complete"] as const,
      handle: () => ({ complete: undefined }),
    });
    expect(() => {
      (handler.targets as unknown as string[]).push("abort");
    }).toThrow();
  });

  it("throws an actionable error when the same handler is passed twice", () => {
    // Reusing the handler reference would crash on the second
    // `Object.defineProperty` call (the property is non-configurable so the
    // first stamp can't be silently overwritten). The guard surfaces a
    // clear message instead of the cryptic `Cannot redefine property` engine
    // error — protects authors who accidentally factor a shared handler.
    const shared = () => ({ abort: { reason: "x" } });
    defineTransition({ targets: ["abort"] as const, handle: shared });
    expect(() => defineTransition({ targets: ["abort"] as const, handle: shared })).toThrow(
      /passed to defineTransition twice/,
    );
  });

  it("curried form binds the journey's generics and stamps targets identically", () => {
    // No-arg call returns the binder. The binder behaves like the bare form
    // at runtime — the journey's generics flow only through the type system.
    const tx = defineTransition();
    const handler = tx({
      targets: [{ module: "plan", entry: "choose" }],
      handle: ({ output }) => ({
        next: {
          module: "plan",
          entry: "choose",
          input: { hint: (output as { hint: string }).hint },
        },
      }),
    });
    expect(handler.targets).toEqual([{ module: "plan", entry: "choose" }]);
    expect(typeof handler).toBe("function");
    // Same metadata stamping behavior as the bare form.
    expect(Object.keys(handler)).not.toContain("targets");
  });
});

describe("isAnnotatedTransition", () => {
  it("returns true for a defineTransition-wrapped handler", () => {
    const handler = defineTransition({
      targets: [{ module: "plan", entry: "choose" }],
      handle: () => ({ abort: { reason: "noop" } }),
    });
    expect(isAnnotatedTransition(handler)).toBe(true);
  });

  it("returns false for a bare function handler", () => {
    const bare = () => ({ abort: { reason: "noop" } });
    expect(isAnnotatedTransition(bare)).toBe(false);
  });

  it("returns false for a handler with a non-{module,entry} `targets`", () => {
    const fake = Object.assign(() => ({ abort: { reason: "noop" } }), {
      // Old slash-string form should NOT pass — both keys must be present
      // as separate properties on each target object.
      targets: ["plan/choose"] as unknown as readonly { module: string; entry: string }[],
    });
    expect(isAnnotatedTransition(fake)).toBe(false);
  });

  it("returns false when target objects miss the `entry` field", () => {
    const fake = Object.assign(() => ({ abort: { reason: "noop" } }), {
      targets: [{ module: "plan" }] as unknown as readonly { module: string; entry: string }[],
    });
    expect(isAnnotatedTransition(fake)).toBe(false);
  });

  it("returns true when targets contain only terminal sentinels", () => {
    const handler = defineTransition({
      targets: ["abort"] as const,
      handle: () => ({ abort: { reason: "x" } }),
    });
    expect(isAnnotatedTransition(handler)).toBe(true);
  });

  it("returns true for a mixed array of step refs and sentinels", () => {
    const handler = defineTransition({
      targets: [{ module: "plan", entry: "choose" }, "complete"] as const,
      handle: () => ({ complete: undefined }),
    });
    expect(isAnnotatedTransition(handler)).toBe(true);
  });

  it("returns false for unknown sentinel strings", () => {
    const fake = Object.assign(() => ({ abort: { reason: "noop" } }), {
      targets: ["maybe"] as unknown as readonly ("complete" | "abort" | "invoke")[],
    });
    expect(isAnnotatedTransition(fake)).toBe(false);
  });

  it("returns false for non-function values", () => {
    expect(isAnnotatedTransition({})).toBe(false);
    expect(isAnnotatedTransition(null)).toBe(false);
    expect(isAnnotatedTransition("plan/choose")).toBe(false);
  });
});

describe("isTerminalSentinel", () => {
  it("recognizes the three documented sentinels", () => {
    expect(isTerminalSentinel("complete")).toBe(true);
    expect(isTerminalSentinel("abort")).toBe(true);
    expect(isTerminalSentinel("invoke")).toBe(true);
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isTerminalSentinel("done")).toBe(false);
    expect(isTerminalSentinel("")).toBe(false);
    expect(isTerminalSentinel({ module: "plan", entry: "choose" })).toBe(false);
    expect(isTerminalSentinel(undefined)).toBe(false);
    expect(isTerminalSentinel(null)).toBe(false);
  });
});
