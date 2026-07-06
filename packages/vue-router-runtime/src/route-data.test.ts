import { describe, it, expect, vi, expectTypeOf } from "vitest";

vi.mock("vue-router", () => ({
  useRoute: vi.fn(),
}));

import { useRoute } from "vue-router";
import { useRouteData } from "./route-data.js";

/**
 * `useRouteData` is the relaxed-typing counterpart to `useZones` — same
 * deepest-wins merge over `route.meta`, but values don't have to be component
 * types. These tests exercise the behaviors the shell relies on: merging
 * across route hierarchies, deepest-wins conflict resolution, preserving
 * parent values when a deeper match doesn't override, and handling of matches
 * with no `meta` at all.
 */

const mockUseRoute = vi.mocked(useRoute);

function route(matched: unknown[]) {
  return { matched } as ReturnType<typeof useRoute>;
}

describe("useRouteData", () => {
  describe("merge semantics", () => {
    it("returns an empty object when no matches contribute meta", () => {
      mockUseRoute.mockReturnValue(route([{ meta: {} }, { meta: {} }]));
      expect(useRouteData<Record<string, unknown>>().value).toEqual({});
    });

    it("returns values from a single matched route", () => {
      mockUseRoute.mockReturnValue(route([{ meta: { headerVariant: "portal" } }]));
      const data = useRouteData<{ headerVariant?: string }>();
      expect(data.value.headerVariant).toBe("portal");
    });

    it("deepest match wins for the same key — child route overrides parent", () => {
      mockUseRoute.mockReturnValue(
        route([{ meta: { headerVariant: "portal" } }, { meta: { headerVariant: "project" } }]),
      );
      const data = useRouteData<{ headerVariant?: string }>();
      expect(data.value.headerVariant).toBe("project");
    });

    it("merges distinct keys across the hierarchy", () => {
      mockUseRoute.mockReturnValue(
        route([{ meta: { pageTitle: "Parent" } }, { meta: { headerVariant: "project" } }]),
      );
      const data = useRouteData<{ pageTitle?: string; headerVariant?: string }>();
      expect(data.value).toEqual({ pageTitle: "Parent", headerVariant: "project" });
    });

    it("skips undefined values so a parent's value isn't clobbered by a child that didn't declare the key", () => {
      // Typical case: a parent sets headerVariant, an intermediate layout
      // doesn't touch it (so its meta doesn't include the key at all), and a
      // leaf neither sets nor overrides it — parent's value survives.
      mockUseRoute.mockReturnValue(
        route([
          { meta: { headerVariant: "portal" } },
          { meta: {} },
          { meta: { headerVariant: undefined } },
        ]),
      );
      const data = useRouteData<{ headerVariant?: string }>();
      expect(data.value.headerVariant).toBe("portal");
    });

    it("tolerates matches with no meta field at all", () => {
      mockUseRoute.mockReturnValue(route([{}, { meta: { headerVariant: "portal" } }, {}]));
      const data = useRouteData<{ headerVariant?: string }>();
      expect(data.value.headerVariant).toBe("portal");
    });
  });

  describe("value types", () => {
    it("accepts non-component values — strings, numbers, objects, enums", () => {
      interface RouteData {
        headerVariant?: "portal" | "project";
        maxResults?: number;
        pageTitle?: string;
        featureFlags?: { experimentalSearch: boolean };
      }

      mockUseRoute.mockReturnValue(
        route([
          {
            meta: {
              headerVariant: "project" as const,
              maxResults: 50,
              pageTitle: "Requests",
              featureFlags: { experimentalSearch: true },
            },
          },
        ]),
      );

      const data = useRouteData<RouteData>();
      expect(data.value.headerVariant).toBe("project");
      expect(data.value.maxResults).toBe(50);
      expect(data.value.pageTitle).toBe("Requests");
      expect(data.value.featureFlags).toEqual({ experimentalSearch: true });
    });

    it("type-level: returned value shape is Partial<TRouteData> — every key is optional", () => {
      interface RouteData {
        headerVariant: "portal" | "project";
        pageTitle: string;
      }
      mockUseRoute.mockReturnValue(route([]));
      const data = useRouteData<RouteData>();
      expectTypeOf(data.value).toEqualTypeOf<Partial<RouteData>>();
    });
  });

  describe("coexists with useZones in the same meta", () => {
    it("reads only the keys declared in TRouteData, leaving component zones untouched for useZones", () => {
      // A route can legitimately contribute both: a HeaderActions component
      // (consumed by useZones) AND a headerVariant enum (consumed by
      // useRouteData). Both composables read the same match, each narrows to
      // its own declared shape.
      interface RouteData {
        headerVariant?: "portal" | "project";
      }
      function HeaderActions() {
        return null;
      }
      mockUseRoute.mockReturnValue(route([{ meta: { HeaderActions, headerVariant: "project" } }]));

      const data = useRouteData<RouteData>();
      expect(data.value.headerVariant).toBe("project");
      // Non-declared keys are still present in the merged value — the
      // composable doesn't filter; it's the consumer's TypeScript signature
      // that narrows access. This is intentional so the two composables don't
      // have to coordinate on key sets.
      expect((data.value as Record<string, unknown>).HeaderActions).toBe(HeaderActions);
    });
  });
});
