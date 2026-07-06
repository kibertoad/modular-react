import { describe, it, expect, vi } from "vitest";
import { reactive } from "vue";

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

// Each matched record carries zones on `meta` (vue-router's analog of the
// React Router `handle` channel).
function route(matched: unknown[]) {
  return { matched } as ReturnType<typeof useRoute>;
}

function PanelA() {
  return null;
}
function PanelB() {
  return null;
}

describe("useZones", () => {
  it("returns empty object when no matches have meta", () => {
    mockUseRoute.mockReturnValue(route([{ meta: {} }, { meta: {} }]));
    const result = useZones<TestZones>();
    expect(result.value).toEqual({});
  });

  it("returns zone component from matched route", () => {
    mockUseRoute.mockReturnValue(route([{ meta: { detailPanel: PanelA } }]));
    const result = useZones<TestZones>();
    expect(result.value.detailPanel).toBe(PanelA);
  });

  it("deepest match wins for the same zone key", () => {
    mockUseRoute.mockReturnValue(
      route([{ meta: { detailPanel: PanelA } }, { meta: { detailPanel: PanelB } }]),
    );
    const result = useZones<TestZones>();
    expect(result.value.detailPanel).toBe(PanelB);
  });

  it("merges zones across the match hierarchy", () => {
    mockUseRoute.mockReturnValue(
      route([{ meta: { headerActions: PanelA } }, { meta: { detailPanel: PanelB } }]),
    );
    const result = useZones<TestZones>();
    expect(result.value.headerActions).toBe(PanelA);
    expect(result.value.detailPanel).toBe(PanelB);
  });

  it("skips undefined values so parent zone is preserved", () => {
    mockUseRoute.mockReturnValue(
      route([{ meta: { detailPanel: PanelA } }, { meta: { detailPanel: undefined } }]),
    );
    const result = useZones<TestZones>();
    expect(result.value.detailPanel).toBe(PanelA);
  });

  it("handles matches with no meta", () => {
    mockUseRoute.mockReturnValue(route([{}, { meta: { detailPanel: PanelA } }]));
    const result = useZones<TestZones>();
    expect(result.value.detailPanel).toBe(PanelA);
  });

  it("recomputes when the matched hierarchy changes", () => {
    // The composable returns a ComputedRef over the reactive route — a
    // navigation that swaps `matched` re-drives the merge on next read.
    const current = reactive({ matched: [{ meta: { detailPanel: PanelA } }] });
    mockUseRoute.mockReturnValue(current as unknown as ReturnType<typeof useRoute>);
    const result = useZones<TestZones>();
    expect(result.value.detailPanel).toBe(PanelA);

    current.matched = [{ meta: { detailPanel: PanelB } }];
    expect(result.value.detailPanel).toBe(PanelB);
  });
});
