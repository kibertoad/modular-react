import { describe, it, expect } from "vitest";
import { defineShellStaticData } from "./shell-static-data.js";

describe("defineShellStaticData", () => {
  it("returns the input unchanged at runtime (identity)", () => {
    const data = { HeaderTitle: "title", HeaderActions: "actions" };
    expect(defineShellStaticData(data)).toBe(data);
  });

  it("preserves nested values verbatim", () => {
    const Component = () => null;
    const data = { HeaderTitle: Component, headerVariant: "project" as const };
    const result = defineShellStaticData(data);
    expect(result).toEqual(data);
  });

  it("does not mutate the input", () => {
    const data: { HeaderTitle?: string; extra?: string } = { HeaderTitle: "title" };
    const snapshot = { ...data };
    defineShellStaticData(data);
    expect(data).toEqual(snapshot);
  });
});
