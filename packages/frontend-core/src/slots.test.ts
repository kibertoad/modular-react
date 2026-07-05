import { describe, it, expect } from "vitest";
import { buildSlotsManifest, collectDynamicSlotFactories, evaluateDynamicSlots } from "./slots.js";
import type { ModuleDescriptor } from "./types.js";

function mod(overrides: Partial<ModuleDescriptor>): ModuleDescriptor {
  return { id: "test", version: "1.0.0", ...overrides };
}

describe("buildSlotsManifest", () => {
  it("returns defaults when no modules contribute", () => {
    const result = buildSlotsManifest([], { commands: [{ id: "default" }] } as any);
    expect(result).toEqual({ commands: [{ id: "default" }] });
  });

  it("concatenates contributions across modules", () => {
    const m1 = mod({ id: "a", slots: { commands: [{ id: "1" }] } });
    const m2 = mod({ id: "b", slots: { commands: [{ id: "2" }] } });
    const result = buildSlotsManifest([m1, m2] as any, { commands: [] } as any);
    expect(result.commands).toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("creates slot keys from modules even without defaults", () => {
    const m1 = mod({ slots: { systems: [{ name: "s1" }] } });
    const result = buildSlotsManifest([m1] as any);
    expect(result.systems).toEqual([{ name: "s1" }]);
  });
});

describe("collectDynamicSlotFactories", () => {
  it("collects dynamicSlots from modules", () => {
    const factory = () => ({});
    const m1 = mod({ dynamicSlots: factory });
    const m2 = mod({ id: "b" });
    const result = collectDynamicSlotFactories([m1, m2] as any);
    expect(result).toHaveLength(1);
  });

  it("returns empty array when no module has dynamicSlots", () => {
    expect(collectDynamicSlotFactories([mod({})] as any)).toEqual([]);
  });
});

describe("evaluateDynamicSlots", () => {
  it("merges factory contributions with base slots", () => {
    const base = { commands: [{ id: "static" }] } as any;
    const factory = () => ({ commands: [{ id: "dynamic" }] });
    const result = evaluateDynamicSlots(base, [factory], {});
    expect(result.commands).toEqual([{ id: "static" }, { id: "dynamic" }]);
  });

  it("applies slot filter after merging", () => {
    const base = { commands: [{ id: "a" }, { id: "b" }] } as any;
    const filter = (slots: any) => ({
      ...slots,
      commands: slots.commands.filter((c: any) => c.id === "a"),
    });
    const result = evaluateDynamicSlots(base, [], {}, filter);
    expect(result.commands).toEqual([{ id: "a" }]);
  });

  it("handles factories that return null/undefined gracefully", () => {
    const base = { commands: [] } as any;
    const factory = () => null as any;
    const result = evaluateDynamicSlots(base, [factory], {});
    expect(result.commands).toEqual([]);
  });
});
