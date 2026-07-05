import { describe, it, expect } from "vitest";
import { defineModule } from "./define-module.js";
import { defineSlots } from "./define-slots.js";

describe("defineModule", () => {
  it("returns the descriptor unchanged", () => {
    const descriptor = {
      id: "billing",
      version: "1.0.0",
      navigation: [{ label: "Billing", to: "/billing" }],
      slots: { commands: [{ id: "pay" }] },
      requires: ["auth"],
    };
    const result = defineModule(descriptor);
    expect(result).toBe(descriptor);
  });
});

describe("defineSlots", () => {
  it("returns a headless module descriptor", () => {
    const slots = { systems: [{ id: "sf", name: "Salesforce" }] };
    const result = defineSlots("external-systems", slots);

    expect(result.id).toBe("external-systems");
    expect(result.version).toBe("0.0.0");
    expect(result.slots).toBe(slots);
    expect(result.createRoutes).toBeUndefined();
    expect(result.component).toBeUndefined();
  });
});
