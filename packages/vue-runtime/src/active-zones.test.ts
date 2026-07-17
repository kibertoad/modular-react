import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";

vi.mock("vue-router", () => ({
  useRoute: vi.fn(),
}));

vi.mock("@modular-vue/vue", () => ({
  useModules: vi.fn(),
}));

import { useRoute } from "vue-router";
import { useModules } from "@modular-vue/vue";
import type { UiComponent } from "@modular-frontend/core";
import { useActiveZones } from "./active-zones.js";

interface TestZones {
  detailPanel?: UiComponent;
  headerActions?: UiComponent;
}

const mockUseRoute = vi.mocked(useRoute);
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

/** Build a route-location-shaped stub carrying the given matched records. */
function routeWithMatches(matched: unknown[]) {
  return { matched } as unknown as ReturnType<typeof useRoute>;
}

beforeEach(() => {
  mockUseRoute.mockReturnValue(routeWithMatches([]));
  mockUseModules.mockReturnValue([]);
});

describe("useActiveZones", () => {
  it("returns route zones when no activeModuleId is given", () => {
    mockUseRoute.mockReturnValue(routeWithMatches([{ meta: { detailPanel: PanelA } }]));

    const result = useActiveZones<TestZones>();
    expect(result.value.detailPanel).toBe(PanelA);
  });

  it("returns route zones when activeModuleId is null", () => {
    mockUseRoute.mockReturnValue(routeWithMatches([{ meta: { detailPanel: PanelA } }]));

    const result = useActiveZones<TestZones>(null);
    expect(result.value.detailPanel).toBe(PanelA);
  });

  it("returns route zones when active module has no zones", () => {
    mockUseRoute.mockReturnValue(routeWithMatches([{ meta: { detailPanel: PanelA } }]));
    mockUseModules.mockReturnValue([{ id: "billing", version: "1.0.0" }]);

    const result = useActiveZones<TestZones>("billing");
    expect(result.value.detailPanel).toBe(PanelA);
  });

  it("returns route zones when active module is not found", () => {
    mockUseRoute.mockReturnValue(routeWithMatches([{ meta: { detailPanel: PanelA } }]));
    mockUseModules.mockReturnValue([{ id: "billing", version: "1.0.0" }]);

    const result = useActiveZones<TestZones>("unknown");
    expect(result.value.detailPanel).toBe(PanelA);
  });

  it("merges module zones over route zones", () => {
    mockUseRoute.mockReturnValue(
      routeWithMatches([{ meta: { detailPanel: PanelA, headerActions: PanelB } }]),
    );
    mockUseModules.mockReturnValue([
      { id: "billing", version: "1.0.0", zones: { detailPanel: PanelC } },
    ]);

    const result = useActiveZones<TestZones>("billing");
    expect(result.value.detailPanel).toBe(PanelC);
    expect(result.value.headerActions).toBe(PanelB);
  });

  it("module zones override route zones for the same key", () => {
    mockUseRoute.mockReturnValue(routeWithMatches([{ meta: { detailPanel: PanelA } }]));
    mockUseModules.mockReturnValue([
      { id: "billing", version: "1.0.0", zones: { detailPanel: PanelB } },
    ]);

    const result = useActiveZones<TestZones>("billing");
    expect(result.value.detailPanel).toBe(PanelB);
  });

  it("reacts to a ref-based activeModuleId", () => {
    mockUseRoute.mockReturnValue(routeWithMatches([{ meta: { detailPanel: PanelA } }]));
    mockUseModules.mockReturnValue([
      { id: "billing", version: "1.0.0", zones: { detailPanel: PanelB } },
    ]);

    const active = ref<string | null>(null);
    const result = useActiveZones<TestZones>(active);

    // No active module selected → route zones only.
    expect(result.value.detailPanel).toBe(PanelA);

    // Select the module → the computed re-evaluates and its zone wins.
    active.value = "billing";
    expect(result.value.detailPanel).toBe(PanelB);
  });
});
