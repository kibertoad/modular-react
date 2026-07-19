import { describe, it, expect, vi } from "vitest";
import {
  createOverlayStack,
  defineOverlayHost,
  resolveOverlay,
  resolveOverlayTitle,
  type OverlayEntry,
} from "./overlay.js";

// A stand-in for an opaque framework component. The resolver never inspects it.
type FakeComponent = { readonly name: string };
const comp = (name: string): FakeComponent => ({ name });

// The subject the agent-run result windows key on.
interface StepRef {
  readonly instanceId: string;
  readonly stepIndex: number;
}

const win = (
  id: string,
  extra?: Partial<Omit<OverlayEntry<StepRef>, "id" | "component">>,
): OverlayEntry<StepRef> => ({ id, component: comp(id), ...extra });

describe("defineOverlayHost", () => {
  it("carries the slot key as its only runtime field", () => {
    const host = defineOverlayHost<StepRef>("resultViews");
    expect(host.slotKey).toBe("resultViews");
    expect(Object.keys(host)).toEqual(["slotKey"]);
  });
});

describe("resolveOverlay", () => {
  it("picks the one entry the active id names", () => {
    const entries = [win("test-report"), win("merger-verdict")];
    expect(resolveOverlay(entries, "merger-verdict")?.id).toBe("merger-verdict");
  });

  it("resolves exactly one entry, never a concatenation (pick-one, not render-all)", () => {
    const entries = [win("a"), win("b"), win("c")];
    const active = resolveOverlay(entries, "b");
    expect(active).not.toBeInstanceOf(Array);
    expect(active?.id).toBe("b");
  });

  it("returns null for a null or undefined active id", () => {
    const entries = [win("a")];
    expect(resolveOverlay(entries, null)).toBeNull();
    expect(resolveOverlay(entries, undefined)).toBeNull();
  });

  it("returns null for a dangling id (data, not a crash)", () => {
    expect(resolveOverlay([win("a")], "not-registered")).toBeNull();
    expect(resolveOverlay([], "anything")).toBeNull();
  });

  it("throws on duplicate ids by default, even while nothing is open", () => {
    const entries = [win("a"), win("a")];
    // Before the null-id guard: the registration bug surfaces deterministically
    // on first resolve, not only once a window is opened.
    expect(() => resolveOverlay(entries, null)).toThrowError(/duplicate overlay id "a"/);
    expect(() => resolveOverlay(entries, "a")).toThrowError(/duplicate overlay id "a"/);
  });

  it("supports first-wins / last-wins shadowing", () => {
    const first = win("a", { title: "first" });
    const last = win("a", { title: "last" });
    expect(resolveOverlay([first, last], "a", { onDuplicate: "first-wins" })?.title).toBe("first");
    expect(resolveOverlay([first, last], "a", { onDuplicate: "last-wins" })?.title).toBe("last");
  });

  it("does not mutate the input entries", () => {
    const entries = [win("a"), win("b")];
    const before = [...entries];
    resolveOverlay(entries, "a");
    expect(entries).toEqual(before);
  });
});

describe("resolveOverlayTitle", () => {
  const step: StepRef = { instanceId: "i1", stepIndex: 3 };

  it("returns a string title as-is", () => {
    expect(resolveOverlayTitle(win("a", { title: "Test report" }), step)).toBe("Test report");
  });

  it("calls a function title with the subject", () => {
    const entry = win("a", { title: (s) => (s ? `Step ${s.stepIndex}` : "No step") });
    expect(resolveOverlayTitle(entry, step)).toBe("Step 3");
  });

  it("passes null through to a function title (selection is by id, not subject)", () => {
    const entry = win("a", { title: (s) => (s ? "with" : "without") });
    expect(resolveOverlayTitle(entry, null)).toBe("without");
  });

  it("resolves to undefined when the entry has no title", () => {
    expect(resolveOverlayTitle(win("a"), step)).toBeUndefined();
  });
});

describe("createOverlayStack", () => {
  it("the newest live registration is the top", () => {
    const stack = createOverlayStack();
    const a = stack.push();
    expect(a.isTop()).toBe(true);
    const b = stack.push();
    expect(a.isTop()).toBe(false);
    expect(b.isTop()).toBe(true);
    expect(stack.size).toBe(2);
  });

  it("releasing the top re-tops the one below (Escape closes top-first, then the next)", () => {
    const stack = createOverlayStack();
    const a = stack.push();
    const b = stack.push();
    b.release();
    expect(a.isTop()).toBe(true);
    expect(b.isTop()).toBe(false);
    expect(stack.size).toBe(1);
  });

  it("supports out-of-order release (a lower overlay closing under a higher one)", () => {
    const stack = createOverlayStack();
    const a = stack.push();
    const b = stack.push();
    const c = stack.push();
    b.release();
    expect(c.isTop()).toBe(true);
    expect(a.isTop()).toBe(false);
    expect(stack.size).toBe(2);
  });

  it("release is idempotent", () => {
    const stack = createOverlayStack();
    const a = stack.push();
    const b = stack.push();
    a.release();
    a.release();
    expect(stack.size).toBe(1);
    expect(b.isTop()).toBe(true);
  });

  it("notifies subscribers on push and release, and honors unsubscribe", () => {
    const stack = createOverlayStack();
    const listener = vi.fn();
    const unsubscribe = stack.subscribe(listener);
    const a = stack.push();
    expect(listener).toHaveBeenCalledTimes(1);
    a.release();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    stack.push();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("a listener unsubscribing mid-notify does not skip its peers", () => {
    const stack = createOverlayStack();
    const calls: string[] = [];
    const unsubA = stack.subscribe(() => {
      calls.push("a");
      unsubA();
    });
    stack.subscribe(() => calls.push("b"));
    stack.push();
    expect(calls).toEqual(["a", "b"]);
  });
});
