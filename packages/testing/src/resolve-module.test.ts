import { describe, it, expect, vi } from "vitest";
import { resolveModule } from "./resolve-module.js";
import type { ModuleDescriptor } from "@modular-react/core";

interface TestSlots {
  commands: { id: string }[];
  systems: { name: string }[];
}

function mod(overrides: Partial<ModuleDescriptor<any, TestSlots>>): ModuleDescriptor<any, TestSlots> {
  return { id: "test-mod", version: "1.0.0", ...overrides } as ModuleDescriptor<any, TestSlots>;
}

describe("resolveModule", () => {
  it("resolves static slots with defaults", () => {
    const m = mod({ slots: { commands: [{ id: "cmd-1" }] } });
    const { slots } = resolveModule(m, {
      defaults: { commands: [], systems: [] },
    });
    expect(slots.commands).toEqual([{ id: "cmd-1" }]);
    expect(slots.systems).toEqual([]);
  });

  it("evaluates dynamic slots when present", () => {
    const m = mod({
      slots: { commands: [{ id: "static" }] },
      dynamicSlots: (deps: any) =>
        deps.isAdmin ? { commands: [{ id: "admin-cmd" }] } : {},
    });

    const { slots } = resolveModule(m, {
      defaults: { commands: [], systems: [] },
      deps: { isAdmin: true },
    });
    expect(slots.commands).toEqual([{ id: "static" }, { id: "admin-cmd" }]);
  });

  it("does not evaluate dynamic slots when absent", () => {
    const m = mod({ slots: { commands: [{ id: "only" }] } });
    const { slots } = resolveModule(m, {
      defaults: { commands: [], systems: [] },
    });
    expect(slots.commands).toEqual([{ id: "only" }]);
  });

  it("builds ModuleEntry correctly", () => {
    const Component = () => null;
    const m = mod({
      id: "billing",
      version: "2.0.0",
      meta: { category: "finance" },
      component: Component,
      zones: { panel: Component },
    });

    const { entry } = resolveModule(m);
    expect(entry.id).toBe("billing");
    expect(entry.version).toBe("2.0.0");
    expect(entry.meta).toEqual({ category: "finance" });
    expect(entry.component).toBe(Component);
    expect(entry.zones).toEqual({ panel: Component });
  });

  it("runs onRegister lifecycle hook", () => {
    const onRegister = vi.fn();
    const m = mod({ lifecycle: { onRegister } });

    const { onRegisterCalled } = resolveModule(m, { deps: { key: "value" } });
    expect(onRegisterCalled).toBe(true);
    expect(onRegister).toHaveBeenCalledWith({ key: "value" });
  });

  it("reports onRegisterCalled=false when no lifecycle", () => {
    const m = mod({});
    const { onRegisterCalled } = resolveModule(m);
    expect(onRegisterCalled).toBe(false);
  });
});
