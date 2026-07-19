import { describe, it, expect } from "vitest";
import { definePanelGroup, resolvePanels, type PanelEntry } from "./panels.js";

// A stand-in for an opaque framework component. The resolver never inspects it.
type FakeComponent = { readonly name: string };
const comp = (name: string): FakeComponent => ({ name });

// The subject the inspector panels key on.
interface Block {
  readonly level: "frame" | "leaf";
  readonly type: string;
  readonly failed?: boolean;
}

const panel = (
  id: string,
  extra?: Partial<Omit<PanelEntry<Block>, "id" | "component">>,
): PanelEntry<Block> => ({ id, component: comp(id), ...extra });

describe("definePanelGroup", () => {
  it("carries the slot key as its only runtime field", () => {
    const group = definePanelGroup<Block>("inspectorPanels");
    expect(group.slotKey).toBe("inspectorPanels");
    expect(Object.keys(group)).toEqual(["slotKey"]);
  });
});

describe("resolvePanels", () => {
  const frame: Block = { level: "frame", type: "frontend" };

  it("returns empty for a null or undefined subject without running predicates", () => {
    let ran = false;
    const entries = [
      panel("a", {
        when: () => {
          ran = true;
          return true;
        },
      }),
    ];
    expect(resolvePanels(entries, null)).toEqual([]);
    expect(resolvePanels(entries, undefined)).toEqual([]);
    expect(ran).toBe(false);
  });

  it("keeps panels without a predicate whenever a subject is present", () => {
    const entries = [panel("a"), panel("b")];
    expect(resolvePanels(entries, frame).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("filters by when(subject), passing the non-null subject", () => {
    const entries = [
      panel("frontend-config", { when: (b) => b.type === "frontend" }),
      panel("leaf-only", { when: (b) => b.level === "leaf" }),
    ];
    expect(resolvePanels(entries, frame).map((p) => p.id)).toEqual(["frontend-config"]);
  });

  it("renders all matching panels (not pick-one)", () => {
    const entries = [
      panel("a", { when: (b) => b.level === "frame" }),
      panel("b", { when: (b) => b.type === "frontend" }),
      panel("c", { when: (b) => b.level === "leaf" }),
    ];
    expect(resolvePanels(entries, frame).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("stable-sorts by order (ascending), preserving contribution order on ties", () => {
    const entries = [
      panel("z", { order: 20 }),
      panel("a", { order: 10 }),
      panel("m"), // no order → 0
      panel("n"), // no order → 0, contributed after m
      panel("b", { order: 10 }), // ties with a, contributed later
    ];
    expect(resolvePanels(entries, frame).map((p) => p.id)).toEqual(["m", "n", "a", "b", "z"]);
  });

  it("does not mutate the input slot array", () => {
    const entries = [panel("z", { order: 20 }), panel("a", { order: 10 })];
    const before = entries.map((p) => p.id);
    resolvePanels(entries, frame);
    expect(entries.map((p) => p.id)).toEqual(before);
  });

  it("throws on a duplicate id by default", () => {
    expect(() => resolvePanels([panel("dup"), panel("dup")], frame)).toThrow(
      /duplicate panel id "dup"/,
    );
  });

  it("throws on a duplicate id even when the subject hides one of them", () => {
    // Dedup runs over all contributions before the `when` filter, so the throw
    // is deterministic regardless of the current subject.
    const entries = [
      panel("dup", { when: (b) => b.level === "frame" }),
      panel("dup", { when: (b) => b.level === "leaf" }),
    ];
    expect(() => resolvePanels(entries, frame)).toThrow(/duplicate panel id "dup"/);
  });

  it("keeps the first contribution under onDuplicate: 'first-wins'", () => {
    const first = panel("dup", { order: 1 });
    const resolved = resolvePanels([first, panel("dup", { order: 2 })], frame, {
      onDuplicate: "first-wins",
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toBe(first);
  });

  it("keeps the last contribution under onDuplicate: 'last-wins', preserving position", () => {
    const last = panel("dup", { order: 5 });
    const resolved = resolvePanels(
      [panel("a", { order: 1 }), panel("dup", { order: 9 }), last, panel("b", { order: 3 })],
      frame,
      { onDuplicate: "last-wins" },
    );
    // The shadowed "dup" keeps its first-seen slot in the contribution order,
    // then the whole set is order-sorted: a(1) → dup(5) → b(3)? no — order wins.
    expect(resolved.map((p) => p.id)).toEqual(["a", "b", "dup"]);
    expect(resolved.find((p) => p.id === "dup")).toBe(last);
  });
});
