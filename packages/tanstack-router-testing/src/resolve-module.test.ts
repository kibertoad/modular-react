import { describe, it, expect, vi } from "vitest";
import { defineModule } from "@tanstack-react-modules/core";
import { resolveModule } from "./resolve-module.js";

interface TestSlots {
  commands: { id: string; label: string }[];
  systems: { id: string; name: string }[];
}

describe("resolveModule", () => {
  it("resolves slot contributions from a headless module", () => {
    const mod = defineModule<Record<string, any>, TestSlots>({
      id: "external-systems",
      version: "0.1.0",
      slots: {
        systems: [{ id: "sf", name: "Salesforce" }],
      },
    });

    const { slots, entry } = resolveModule(mod, {
      defaults: { commands: [], systems: [] },
    });

    expect(slots.systems).toEqual([{ id: "sf", name: "Salesforce" }]);
    expect(slots.commands).toEqual([]);
    expect(entry.id).toBe("external-systems");
    expect(entry.version).toBe("0.1.0");
  });

  it("builds ModuleEntry with meta and zones", () => {
    const Panel = () => null;
    const mod = defineModule({
      id: "test",
      version: "1.0.0",
      meta: { name: "Test Module", category: "testing" },
      zones: { detailPanel: Panel },
    });

    const { entry } = resolveModule(mod);

    expect(entry.meta).toEqual({ name: "Test Module", category: "testing" });
    expect(entry.zones?.detailPanel).toBe(Panel);
  });

  it("runs onRegister lifecycle hook with provided deps", () => {
    const onRegister = vi.fn();
    const mod = defineModule({
      id: "test",
      version: "1.0.0",
      lifecycle: { onRegister },
    });

    const deps = { auth: { user: "test" } };
    const { onRegisterCalled } = resolveModule(mod, { deps });

    expect(onRegisterCalled).toBe(true);
    expect(onRegister).toHaveBeenCalledWith(deps);
  });

  it("reports onRegisterCalled as false when no lifecycle", () => {
    const mod = defineModule({
      id: "test",
      version: "1.0.0",
    });

    const { onRegisterCalled } = resolveModule(mod);

    expect(onRegisterCalled).toBe(false);
  });
});
