import { describe, it, expect } from "vitest";
import { componentPairingPlugin } from "./component-pairing-plugin.js";
import type { ComponentEntry } from "./component-registry.js";
import type { ModuleDescriptor } from "./types.js";

type FakeComponent = { readonly name: string };
const comp = (name: string): FakeComponent => ({ name });

// A module contributing component entries to `resultViews` and/or referencing
// them via a data slot `agentKinds`.
function mod(
  id: string,
  slots: Record<string, readonly unknown[]>,
): ModuleDescriptor<any, any, any, any> {
  return { id, version: "1.0.0", slots } as ModuleDescriptor<any, any, any, any>;
}

// The refs a real host would extract from its data slot; here we read the
// `agentKinds` slot's `resultView` field across all modules.
const refsFromAgentKinds = (modules: readonly ModuleDescriptor<any, any, any, any>[]) => {
  const refs: { id: string; from?: string }[] = [];
  for (const m of modules) {
    const kinds = (m.slots as Record<string, unknown> | undefined)?.agentKinds;
    if (!Array.isArray(kinds)) continue;
    for (const k of kinds as { resultView?: string }[]) {
      if (k.resultView) refs.push({ id: k.resultView, from: `module "${m.id}"` });
    }
  }
  return refs;
};

const views = (...ids: string[]): ComponentEntry<FakeComponent>[] =>
  ids.map((id) => ({ id, component: comp(id) }));

describe("componentPairingPlugin", () => {
  it("conforms to the RegistryPlugin contract", () => {
    const plugin = componentPairingPlugin({ componentSlot: "resultViews", staticRefs: () => [] });
    expect(plugin.name).toBe("componentPairing");
    expect(plugin.extend({ markDirty: () => {} })).toEqual({});
    expect(plugin.validate).toBeTypeOf("function");
  });

  it("passes when every static ref resolves against the component slot", () => {
    const plugin = componentPairingPlugin({
      componentSlot: "resultViews",
      staticRefs: refsFromAgentKinds,
    });
    const modules = [
      mod("views", { resultViews: views("summary", "diff") }),
      mod("kinds", { agentKinds: [{ resultView: "summary" }, { resultView: "diff" }] }),
    ];

    expect(() => plugin.validate!({ modules })).not.toThrow();
  });

  it("throws listing dangling refs (with source) when a ref has no registered component", () => {
    const plugin = componentPairingPlugin({
      componentSlot: "resultViews",
      staticRefs: refsFromAgentKinds,
    });
    const modules = [
      mod("views", { resultViews: views("summary") }),
      mod("kinds", { agentKinds: [{ resultView: "summary" }, { resultView: "ghost" }] }),
    ];

    expect(() => plugin.validate!({ modules })).toThrow(
      /no registered component in slot "resultViews"/,
    );
    expect(() => plugin.validate!({ modules })).toThrow(/"ghost" \(from module "kinds"\)/);
  });

  it("accepts bare-string refs", () => {
    const plugin = componentPairingPlugin({
      componentSlot: "resultViews",
      staticRefs: () => ["summary", "missing"],
    });
    const modules = [mod("views", { resultViews: views("summary") })];

    expect(() => plugin.validate!({ modules })).toThrow(/"missing"/);
  });

  it("surfaces a duplicate component id at validate time (default throw)", () => {
    const plugin = componentPairingPlugin({ componentSlot: "resultViews", staticRefs: () => [] });
    const modules = [
      mod("views-a", { resultViews: views("summary") }),
      mod("views-b", { resultViews: views("summary") }),
    ];

    expect(() => plugin.validate!({ modules })).toThrow(/duplicate component id "summary"/);
  });

  it("honors onDuplicate so an intentional consumer override does not fail resolve", () => {
    const plugin = componentPairingPlugin({
      componentSlot: "resultViews",
      staticRefs: () => ["summary"],
      onDuplicate: "last-wins",
    });
    const modules = [
      mod("first-party", { resultViews: views("summary") }),
      mod("consumer", { resultViews: views("summary") }),
    ];

    expect(() => plugin.validate!({ modules })).not.toThrow();
  });

  it("ignores modules that don't contribute to the component slot", () => {
    const plugin = componentPairingPlugin({
      componentSlot: "resultViews",
      staticRefs: () => [],
    });
    const modules = [mod("headless", {}), mod("other", { somethingElse: [{ id: "x" }] })];

    expect(() => plugin.validate!({ modules })).not.toThrow();
  });
});
