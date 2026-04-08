import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react-router", () => ({
  useMatches: vi.fn(),
}));

vi.mock("@modular-react/react", () => ({
  useModules: vi.fn(),
}));

import { useMatches } from "react-router";
import { useModules } from "@modular-react/react";
import type { ComponentType } from "react";
import { useActiveZones } from "./active-zones.js";

interface TestZones {
  detailPanel?: ComponentType;
  headerActions?: ComponentType;
}

const mockUseMatches = vi.mocked(useMatches);
const mockUseModules = vi.mocked(useModules);

function PanelA() {
  return null;
}
function PanelB() {
  return null;
}
function PanelC() {
  return null;
}

beforeEach(() => {
  mockUseMatches.mockReturnValue([]);
  mockUseModules.mockReturnValue([]);
});

describe("useActiveZones", () => {
  it("returns route zones when no activeModuleId is given", () => {
    mockUseMatches.mockReturnValue([{ handle: { detailPanel: PanelA } }] as any);

    const result = useActiveZones<TestZones>();
    expect(result.detailPanel).toBe(PanelA);
  });

  it("returns route zones when activeModuleId is null", () => {
    mockUseMatches.mockReturnValue([{ handle: { detailPanel: PanelA } }] as any);

    const result = useActiveZones<TestZones>(null);
    expect(result.detailPanel).toBe(PanelA);
  });

  it("returns route zones when active module has no zones", () => {
    mockUseMatches.mockReturnValue([{ handle: { detailPanel: PanelA } }] as any);
    mockUseModules.mockReturnValue([{ id: "billing", version: "1.0.0" }]);

    const result = useActiveZones<TestZones>("billing");
    expect(result.detailPanel).toBe(PanelA);
  });

  it("returns route zones when active module is not found", () => {
    mockUseMatches.mockReturnValue([{ handle: { detailPanel: PanelA } }] as any);
    mockUseModules.mockReturnValue([{ id: "billing", version: "1.0.0" }]);

    const result = useActiveZones<TestZones>("unknown");
    expect(result.detailPanel).toBe(PanelA);
  });

  it("merges module zones over route zones", () => {
    mockUseMatches.mockReturnValue([
      { handle: { detailPanel: PanelA, headerActions: PanelB } },
    ] as any);
    mockUseModules.mockReturnValue([
      { id: "billing", version: "1.0.0", zones: { detailPanel: PanelC } },
    ]);

    const result = useActiveZones<TestZones>("billing");
    expect(result.detailPanel).toBe(PanelC);
    expect(result.headerActions).toBe(PanelB);
  });

  it("module zones override route zones for the same key", () => {
    mockUseMatches.mockReturnValue([{ handle: { detailPanel: PanelA } }] as any);
    mockUseModules.mockReturnValue([
      { id: "billing", version: "1.0.0", zones: { detailPanel: PanelB } },
    ]);

    const result = useActiveZones<TestZones>("billing");
    expect(result.detailPanel).toBe(PanelB);
  });
});
