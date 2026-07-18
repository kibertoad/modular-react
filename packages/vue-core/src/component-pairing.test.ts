import { describe, it, expect } from "vitest";
import { computed, ref } from "vue";
import { resolveComponentRegistry, pairById, type ComponentEntry } from "./index.js";

// Proves the framework-neutral pairing helpers (re-exported here from
// @modular-frontend/core) compose with Vue reactivity with NO library-specific
// glue: a plain `computed` that reads a reactive slot ref and a reactive
// manifest ref re-runs resolveComponentRegistry + pairById on change. This is
// the render-time shape a host uses inside a `computed` fed by
// useReactiveSlots() + a reactive capabilities service.

type FakeComponent = { readonly name: string };
const comp = (name: string): FakeComponent => ({ name });

interface AgentKind {
  readonly kind: string;
  readonly resultView?: string;
}

describe("pairing helpers under Vue reactivity", () => {
  it("recomputes a computed when the component slot changes", () => {
    const slot = ref<ComponentEntry<FakeComponent>[]>([
      { id: "summary", component: comp("Summary") },
    ]);
    const kinds = ref<AgentKind[]>([{ kind: "review", resultView: "diff" }]);

    const paired = computed(() => {
      const registry = resolveComponentRegistry(slot.value);
      return pairById(kinds.value, registry, (k) => k.resultView);
    });

    // "diff" isn't registered yet -> it's a dangling reference.
    expect(paired.value.paired).toEqual([]);
    expect(paired.value.missing).toEqual([
      { item: { kind: "review", resultView: "diff" }, id: "diff" },
    ]);

    // A module registers the "diff" view -> the same manifest entry now pairs.
    slot.value = [...slot.value, { id: "diff", component: comp("Diff") }];

    expect(paired.value.missing).toEqual([]);
    expect(
      paired.value.paired.map((p) => ({ kind: p.item.kind, id: p.id, name: p.component.name })),
    ).toEqual([{ kind: "review", id: "diff", name: "Diff" }]);
  });

  it("recomputes when the reactive manifest changes", () => {
    const slot = ref<ComponentEntry<FakeComponent>[]>([
      { id: "summary", component: comp("Summary") },
      { id: "diff", component: comp("Diff") },
    ]);
    const kinds = ref<AgentKind[]>([{ kind: "review", resultView: "summary" }]);

    const result = computed(() => {
      const registry = resolveComponentRegistry(slot.value);
      return pairById(kinds.value, registry, (k) => k.resultView);
    });

    expect(result.value.paired.map((p) => p.id)).toEqual(["summary"]);

    // Backend lights up another kind that references an installed view, plus one
    // with no view id at all.
    kinds.value = [
      { kind: "review", resultView: "summary" },
      { kind: "compare", resultView: "diff" },
      { kind: "note" },
    ];

    expect(result.value.paired.map((p) => p.id)).toEqual(["summary", "diff"]);
    expect(result.value.unref).toEqual([{ kind: "note" }]);
  });
});
