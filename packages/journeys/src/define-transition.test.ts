import { describe, expect, it } from "vitest";
import { defineTransition, isAnnotatedTransition } from "./define-transition.js";

describe("defineTransition", () => {
  it("returns a function callable with the same signature as the bare handler", () => {
    const handler = defineTransition({
      targets: ["plan/choose"] as const,
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
      targets: ["plan/choose", "billing/collect"] as const,
      handle: () => ({ abort: { reason: "noop" } }),
    });
    expect(handler.targets).toEqual(["plan/choose", "billing/collect"]);
    // Non-enumerable: structural iteration over the transitions map should
    // not surface `targets` as a phantom exit name.
    expect(Object.keys(handler)).not.toContain("targets");
    // Frozen: cannot be mutated by accident.
    expect(() => {
      (handler.targets as unknown as string[])[0] = "billing/collect";
    }).toThrow();
  });

  it("freezes a copy of the targets array (caller mutations don't leak in)", () => {
    const targets = ["plan/choose"];
    const handler = defineTransition({
      targets,
      handle: () => ({ abort: { reason: "noop" } }),
    });
    targets.push("billing/collect");
    expect(handler.targets).toEqual(["plan/choose"]);
  });
});

describe("isAnnotatedTransition", () => {
  it("returns true for a defineTransition-wrapped handler", () => {
    const handler = defineTransition({
      targets: ["plan/choose"] as const,
      handle: () => ({ abort: { reason: "noop" } }),
    });
    expect(isAnnotatedTransition(handler)).toBe(true);
  });

  it("returns false for a bare function handler", () => {
    const bare = () => ({ abort: { reason: "noop" } });
    expect(isAnnotatedTransition(bare)).toBe(false);
  });

  it("returns false for a handler with a non-string-array `targets`", () => {
    const fake = Object.assign(() => ({ abort: { reason: "noop" } }), {
      targets: [1, 2, 3] as unknown as readonly string[],
    });
    expect(isAnnotatedTransition(fake)).toBe(false);
  });

  it("returns false for non-function values", () => {
    expect(isAnnotatedTransition({})).toBe(false);
    expect(isAnnotatedTransition(null)).toBe(false);
    expect(isAnnotatedTransition("plan/choose")).toBe(false);
  });
});
