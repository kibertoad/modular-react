import { describe, expect, it } from "vitest";
import { isJourneyDefinition, isModuleDescriptor } from "./detect.js";

describe("isModuleDescriptor", () => {
  it("recognizes a routed module", () => {
    expect(
      isModuleDescriptor({
        id: "x",
        version: "1.0.0",
        createRoutes: () => [],
      }),
    ).toBe(true);
  });

  it("recognizes a slot-only module", () => {
    expect(
      isModuleDescriptor({
        id: "x",
        version: "1.0.0",
        slots: { commands: [] },
      }),
    ).toBe(true);
  });

  it("rejects a bare {id, version} pair", () => {
    expect(isModuleDescriptor({ id: "x", version: "1.0.0" })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isModuleDescriptor(null)).toBe(false);
    expect(isModuleDescriptor("not a module")).toBe(false);
    expect(isModuleDescriptor(123)).toBe(false);
  });

  it("rejects objects with non-string id/version", () => {
    expect(isModuleDescriptor({ id: 5, version: "1.0.0", slots: {} })).toBe(false);
    expect(isModuleDescriptor({ id: "x", version: 1, slots: {} })).toBe(false);
  });
});

describe("isJourneyDefinition", () => {
  it("recognizes a journey", () => {
    expect(
      isJourneyDefinition({
        id: "j",
        version: "1.0.0",
        transitions: {},
        start: () => ({ module: "x", entry: "y", input: {} }),
        initialState: () => ({}),
      }),
    ).toBe(true);
  });

  it("rejects a module shape (no transitions)", () => {
    expect(
      isJourneyDefinition({
        id: "j",
        version: "1.0.0",
        createRoutes: () => [],
      }),
    ).toBe(false);
  });

  it("rejects when transitions is not an object", () => {
    expect(
      isJourneyDefinition({
        id: "j",
        version: "1.0.0",
        transitions: null,
        start: () => null,
        initialState: () => null,
      }),
    ).toBe(false);
  });
});
