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

function route(matched: unknown[]) {
  return { matched } as ReturnType<typeof useRoute>;
}

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
  mockUseRoute.mockReturnValue(route([]));
  mockUseModules.mockReturnValue([]);
});

describe("useActiveZones", () => {
  it("returns route zones when no activeModuleId is given", () => {
    mockUseRoute.mockReturnValue(route([{ meta: { detailPanel: PanelA } }]));

    const result = useActiveZones<TestZones>();
    expect(result.value.detailPanel).toBe(PanelA);
  });

  it("returns route zones when activeModuleId is null", () => {
    mockUseRoute.mockReturnValue(route([{ meta: { detailPanel: PanelA } }]));

    const result = useActiveZones<TestZones>(null);
    expect(result.value.detailPanel).toBe(PanelA);
  });

  it("returns route zones when active module has no zones", () => {
    mockUseRoute.mockReturnValue(route([{ meta: { detailPanel: PanelA } }]));
    mockUseModules.mockReturnValue([{ id: "billing", version: "1.0.0" }]);

    const result = useActiveZones<TestZones>("billing");
    expect(result.value.detailPanel).toBe(PanelA);
  });

  it("returns route zones when active module is not found", () => {
    mockUseRoute.mockReturnValue(route([{ meta: { detailPanel: PanelA } }]));
    mockUseModules.mockReturnValue([{ id: "billing", version: "1.0.0" }]);

    const result = useActiveZones<TestZones>("unknown");
    expect(result.value.detailPanel).toBe(PanelA);
  });

  it("merges module zones over route zones", () => {
    mockUseRoute.mockReturnValue(route([{ meta: { detailPanel: PanelA, headerActions: PanelB } }]));
    mockUseModules.mockReturnValue([
      { id: "billing", version: "1.0.0", zones: { detailPanel: PanelC } },
    ]);

    const result = useActiveZones<TestZones>("billing");
    expect(result.value.detailPanel).toBe(PanelC);
    expect(result.value.headerActions).toBe(PanelB);
  });

  it("module zones override route zones for the same key", () => {
    mockUseRoute.mockReturnValue(route([{ meta: { detailPanel: PanelA } }]));
    mockUseModules.mockReturnValue([
      { id: "billing", version: "1.0.0", zones: { detailPanel: PanelB } },
    ]);

    const result = useActiveZones<TestZones>("billing");
    expect(result.value.detailPanel).toBe(PanelB);
  });

  it("tracks a reactive activeModuleId, re-merging when it changes", () => {
    // A tab switcher passes a ref; flipping it must re-drive the merge so the
    // newly active module's zones win.
    mockUseRoute.mockReturnValue(route([{ meta: { detailPanel: PanelA } }]));
    mockUseModules.mockReturnValue([
      { id: "billing", version: "1.0.0", zones: { detailPanel: PanelB } },
    ]);

    const activeId = ref<string | null>(null);
    const result = useActiveZones<TestZones>(activeId);
    // No active module → route zone.
    expect(result.value.detailPanel).toBe(PanelA);

    activeId.value = "billing";
    // Active module contributes → module zone wins.
    expect(result.value.detailPanel).toBe(PanelB);
  });
});
