import { describe, it, expect } from "vitest";
import { defineSlots } from "./define-slots.js";

interface TestSlots {
  commands: { id: string; label: string }[];
  systems: { id: string; name: string }[];
}

describe("defineSlots", () => {
  it("returns a headless module descriptor with id and slots", () => {
    const mod = defineSlots<Record<string, any>, TestSlots>("nav", {
      commands: [{ id: "cmd1", label: "Command 1" }],
    });

    expect(mod.id).toBe("nav");
    expect(mod.version).toBe("0.0.0");
    expect(mod.slots?.commands).toEqual([{ id: "cmd1", label: "Command 1" }]);
  });

  it("has no component, routes, or lifecycle", () => {
    const mod = defineSlots("empty", {});

    expect(mod.component).toBeUndefined();
    expect(mod.createRoutes).toBeUndefined();
    expect(mod.lifecycle).toBeUndefined();
    expect(mod.meta).toBeUndefined();
  });
});
