import { describe, it, expect } from "vitest";
import { resolveComponentRegistry, pairById, type ComponentEntry } from "./component-registry.js";

// A stand-in for an opaque framework component. The helpers never inspect it.
type FakeComponent = { readonly name: string };
const comp = (name: string): FakeComponent => ({ name });

const entries = (
  ...pairs: readonly (readonly [string, FakeComponent, unknown?])[]
): ComponentEntry<FakeComponent>[] =>
  pairs.map(([id, component, meta]) => ({ id, component, meta }));

describe("resolveComponentRegistry", () => {
  it("indexes entries into an id -> component lookup", () => {
    const a = comp("A");
    const b = comp("B");
    const registry = resolveComponentRegistry(entries(["a", a], ["b", b]));

    expect(registry.get("a")).toBe(a);
    expect(registry.get("b")).toBe(b);
    expect(registry.get("missing")).toBeUndefined();
    expect(registry.has("a")).toBe(true);
    expect(registry.has("missing")).toBe(false);
  });

  it("exposes ids and entries in first-seen order", () => {
    const registry = resolveComponentRegistry(
      entries(["b", comp("B")], ["a", comp("A")], ["c", comp("C")]),
    );

    expect(registry.ids).toEqual(["b", "a", "c"]);
    expect(registry.entries.map((e) => e.id)).toEqual(["b", "a", "c"]);
  });

  it("exposes the full entry (component + meta) via getEntry", () => {
    const a = comp("A");
    const registry = resolveComponentRegistry(entries(["a", a, { title: "Alpha" }]));

    expect(registry.getEntry("a")).toEqual({ id: "a", component: a, meta: { title: "Alpha" } });
    expect(registry.getEntry("missing")).toBeUndefined();
  });

  it("throws on a duplicate id by default", () => {
    expect(() =>
      resolveComponentRegistry(entries(["dup", comp("first")], ["dup", comp("second")])),
    ).toThrow(/duplicate component id "dup"/);
  });

  it("keeps the first registration under onDuplicate: 'first-wins'", () => {
    const first = comp("first");
    const registry = resolveComponentRegistry(entries(["dup", first], ["dup", comp("second")]), {
      onDuplicate: "first-wins",
    });

    expect(registry.get("dup")).toBe(first);
    expect(registry.ids).toEqual(["dup"]);
  });

  it("keeps the last registration under onDuplicate: 'last-wins', preserving position", () => {
    const last = comp("last");
    const registry = resolveComponentRegistry(
      entries(["a", comp("A")], ["dup", comp("first")], ["b", comp("B")], ["dup", last]),
      { onDuplicate: "last-wins" },
    );

    expect(registry.get("dup")).toBe(last);
    // Position is the id's first appearance, not the winning entry's.
    expect(registry.ids).toEqual(["a", "dup", "b"]);
  });

  it("returns an empty registry for no entries", () => {
    const registry = resolveComponentRegistry<FakeComponent>([]);
    expect(registry.ids).toEqual([]);
    expect(registry.entries).toEqual([]);
    expect(registry.has("anything")).toBe(false);
  });
});

describe("pairById", () => {
  interface Kind {
    readonly kind: string;
    readonly resultView?: string;
  }

  const registry = resolveComponentRegistry(entries(["view-a", comp("A")], ["view-b", comp("B")]));

  it("partitions items into paired / missing / unref", () => {
    const items: Kind[] = [
      { kind: "alpha", resultView: "view-a" }, // paired
      { kind: "beta", resultView: "view-b" }, // paired
      { kind: "gamma", resultView: "view-x" }, // missing (dangling ref)
      { kind: "delta" }, // unref (no view requested)
    ];

    const { paired, missing, unref } = pairById(items, registry, (k) => k.resultView);

    expect(paired.map((p) => ({ kind: p.item.kind, id: p.id, name: p.component.name }))).toEqual([
      { kind: "alpha", id: "view-a", name: "A" },
      { kind: "beta", id: "view-b", name: "B" },
    ]);
    expect(missing).toEqual([{ item: { kind: "gamma", resultView: "view-x" }, id: "view-x" }]);
    expect(unref).toEqual([{ kind: "delta" }]);
  });

  it("treats an idOf that returns undefined as unref, not missing", () => {
    const { paired, missing, unref } = pairById(
      [{ kind: "delta" }],
      registry,
      (k: Kind) => k.resultView,
    );

    expect(paired).toEqual([]);
    expect(missing).toEqual([]);
    expect(unref).toEqual([{ kind: "delta" }]);
  });

  it("returns three empty buckets for no items", () => {
    const result = pairById([] as Kind[], registry, (k) => k.resultView);
    expect(result).toEqual({ paired: [], missing: [], unref: [] });
  });
});
