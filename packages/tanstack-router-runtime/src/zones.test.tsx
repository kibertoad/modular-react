import { describe, it, expect, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useMatches: vi.fn(),
}));

import { useMatches } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { useZones } from "./zones.js";

interface TestZones {
  detailPanel?: ComponentType;
  headerActions?: ComponentType;
}

const mockUseMatches = vi.mocked(useMatches);

function PanelA() {
  return null;
}
function PanelB() {
  return null;
}

describe("useZones", () => {
  it("returns empty object when no matches have staticData", () => {
    mockUseMatches.mockReturnValue([{ staticData: {} }, { staticData: {} }] as any);
    const result = useZones<TestZones>();
    expect(result).toEqual({});
  });

  it("returns zone component from matched route", () => {
    mockUseMatches.mockReturnValue([{ staticData: { detailPanel: PanelA } }] as any);
    const result = useZones<TestZones>();
    expect(result.detailPanel).toBe(PanelA);
  });

  it("deepest match wins for the same zone key", () => {
    mockUseMatches.mockReturnValue([
      { staticData: { detailPanel: PanelA } },
      { staticData: { detailPanel: PanelB } },
    ] as any);
    const result = useZones<TestZones>();
    expect(result.detailPanel).toBe(PanelB);
  });

  it("merges zones across the match hierarchy", () => {
    mockUseMatches.mockReturnValue([
      { staticData: { headerActions: PanelA } },
      { staticData: { detailPanel: PanelB } },
    ] as any);
    const result = useZones<TestZones>();
    expect(result.headerActions).toBe(PanelA);
    expect(result.detailPanel).toBe(PanelB);
  });

  it("skips undefined values so parent zone is preserved", () => {
    mockUseMatches.mockReturnValue([
      { staticData: { detailPanel: PanelA } },
      { staticData: { detailPanel: undefined } },
    ] as any);
    const result = useZones<TestZones>();
    expect(result.detailPanel).toBe(PanelA);
  });

  it("handles matches with no staticData", () => {
    mockUseMatches.mockReturnValue([{}, { staticData: { detailPanel: PanelA } }] as any);
    const result = useZones<TestZones>();
    expect(result.detailPanel).toBe(PanelA);
  });
});
