import { describe, it, expect, vi } from "vitest";

vi.mock("vue-router", () => ({
  useRoute: vi.fn(),
}));

import { useRoute } from "vue-router";
import type { UiComponent } from "@modular-frontend/core";
import { useZones } from "./zones.js";

interface TestZones {
  detailPanel?: UiComponent;
  headerActions?: UiComponent;
}

const mockUseRoute = vi.mocked(useRoute);

function PanelA() {
  return null;
}
function PanelB() {
  return null;
}

/** Build a route-location-shaped stub carrying the given matched records. */
function routeWithMatches(matched: unknown[]) {
  return { matched } as unknown as ReturnType<typeof useRoute>;
}

describe("useZones", () => {
  it("returns empty object when no matches have meta", () => {
    mockUseRoute.mockReturnValue(routeWithMatches([{ meta: {} }, { meta: {} }]));
    const result = useZones<TestZones>();
    expect(result.value).toEqual({});
  });

  it("returns zone component from matched route", () => {
    mockUseRoute.mockReturnValue(routeWithMatches([{ meta: { detailPanel: PanelA } }]));
    const result = useZones<TestZones>();
    expect(result.value.detailPanel).toBe(PanelA);
  });

  it("deepest match wins for the same zone key", () => {
    mockUseRoute.mockReturnValue(
      routeWithMatches([{ meta: { detailPanel: PanelA } }, { meta: { detailPanel: PanelB } }]),
    );
    const result = useZones<TestZones>();
    expect(result.value.detailPanel).toBe(PanelB);
  });

  it("merges zones across the match hierarchy", () => {
    mockUseRoute.mockReturnValue(
      routeWithMatches([{ meta: { headerActions: PanelA } }, { meta: { detailPanel: PanelB } }]),
    );
    const result = useZones<TestZones>();
    expect(result.value.headerActions).toBe(PanelA);
    expect(result.value.detailPanel).toBe(PanelB);
  });

  it("skips undefined values so parent zone is preserved", () => {
    mockUseRoute.mockReturnValue(
      routeWithMatches([{ meta: { detailPanel: PanelA } }, { meta: { detailPanel: undefined } }]),
    );
    const result = useZones<TestZones>();
    expect(result.value.detailPanel).toBe(PanelA);
  });

  it("handles matches with no meta", () => {
    mockUseRoute.mockReturnValue(routeWithMatches([{}, { meta: { detailPanel: PanelA } }]));
    const result = useZones<TestZones>();
    expect(result.value.detailPanel).toBe(PanelA);
  });
});
