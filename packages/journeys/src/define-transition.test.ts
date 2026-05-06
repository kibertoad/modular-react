import { describe, expect, it } from "vitest";
import { defineTransition, isAnnotatedTransition } from "./define-transition.js";

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

  it("supports handlers that return `complete` (terminal exit, no targets)", () => {
    // A handler can declare empty targets if its only outcome is to complete
    // the journey — preload skips it (no entries to fetch), but the
    // annotation is preserved for symmetry with non-terminal handlers.
    const handler = defineTransition({
      targets: [],
      handle: ({ output }: { output: { id: string } }) => ({
        complete: { result: output.id },
      }),
    });
    expect(handler.targets).toEqual([]);
    expect(handler({ state: undefined, input: undefined, output: { id: "x" } })).toEqual({
      complete: { result: "x" },
    });
  });

  it("supports handlers that return `abort`", () => {
    const handler = defineTransition({
      targets: [],
      handle: () => ({ abort: { reason: "user-cancelled" } }),
    });
    expect(handler({ state: undefined, input: undefined, output: undefined })).toEqual({
      abort: { reason: "user-cancelled" },
    });
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

  it("returns false for non-function values", () => {
    expect(isAnnotatedTransition({})).toBe(false);
    expect(isAnnotatedTransition(null)).toBe(false);
    expect(isAnnotatedTransition("plan/choose")).toBe(false);
  });
});
