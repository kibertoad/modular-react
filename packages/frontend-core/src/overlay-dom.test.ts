// Runs in the engine's node environment on purpose: what the engine can
// meaningfully assert about overlay-dom is that importing and calling it
// without a `document` is safe (the SSR guarantee) and that the shared stack
// instance is live. The DOM semantics (focus trap, initial-focus scan, actual
// body scroll lock) are exercised through both bindings' jsdom suites, which
// consume this same single implementation.
import { describe, it, expect } from "vitest";
import { lockBodyScroll, sharedOverlayStack, unlockBodyScroll } from "./overlay-dom.js";

describe("sharedOverlayStack", () => {
  it("is one live app-wide stack", () => {
    const before = sharedOverlayStack.size;
    const a = sharedOverlayStack.push();
    const b = sharedOverlayStack.push();
    expect(sharedOverlayStack.size).toBe(before + 2);
    expect(b.isTop()).toBe(true);
    expect(a.isTop()).toBe(false);
    b.release();
    expect(a.isTop()).toBe(true);
    a.release();
    expect(sharedOverlayStack.size).toBe(before);
  });
});

describe("body scroll lock (no document)", () => {
  it("no-ops without a document instead of throwing (SSR safety)", () => {
    expect(typeof document).toBe("undefined");
    expect(() => {
      lockBodyScroll();
      lockBodyScroll();
      unlockBodyScroll();
      unlockBodyScroll();
      unlockBodyScroll(); // over-release is safe too
    }).not.toThrow();
  });
});
