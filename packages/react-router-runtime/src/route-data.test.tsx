import { describe, it, expect, vi, expectTypeOf } from "vitest";

vi.mock("react-router", () => ({
  useMatches: vi.fn(),
}));

import { useMatches } from "react-router";
import { useRouteData } from "./route-data.js";

/**
 * `useRouteData` is the relaxed-typing counterpart to `useZones` — same
 * deepest-wins merge over `match.handle`, but values don't have to be
 * component types. These tests exercise the behaviors the shell relies on:
 * merging across route hierarchies, deepest-wins conflict resolution,
 * preserving parent values when a deeper match doesn't override, and
 * handling of matches with no `handle` at all.
 */

const mockUseMatches = vi.mocked(useMatches);

describe("useRouteData", () => {
  describe("merge semantics", () => {
    it("returns an empty object when no matches contribute handles", () => {
      mockUseMatches.mockReturnValue([{ handle: {} }, { handle: {} }] as any);
      expect(useRouteData<Record<string, unknown>>()).toEqual({});
    });

    it("returns values from a single matched route", () => {
      mockUseMatches.mockReturnValue([{ handle: { headerVariant: "portal" } }] as any);
      const data = useRouteData<{ headerVariant?: string }>();
      expect(data.headerVariant).toBe("portal");
    });

    it("deepest match wins for the same key — child route overrides parent", () => {
      mockUseMatches.mockReturnValue([
        { handle: { headerVariant: "portal" } },
        { handle: { headerVariant: "project" } },
      ] as any);
      const data = useRouteData<{ headerVariant?: string }>();
      expect(data.headerVariant).toBe("project");
    });

    it("merges distinct keys across the hierarchy", () => {
      mockUseMatches.mockReturnValue([
        { handle: { pageTitle: "Parent" } },
        { handle: { headerVariant: "project" } },
      ] as any);
      const data = useRouteData<{ pageTitle?: string; headerVariant?: string }>();
      expect(data).toEqual({ pageTitle: "Parent", headerVariant: "project" });
    });

    it("skips undefined values so a parent's value isn't clobbered by a child that didn't declare the key", () => {
      // Typical case: a parent sets headerVariant, an intermediate layout
      // doesn't touch it (so its handle doesn't include the key at all),
      // and a leaf neither sets nor overrides it — parent's value survives.
      mockUseMatches.mockReturnValue([
        { handle: { headerVariant: "portal" } },
        { handle: {} },
        { handle: { headerVariant: undefined } },
      ] as any);
      const data = useRouteData<{ headerVariant?: string }>();
      expect(data.headerVariant).toBe("portal");
    });

    it("tolerates matches with no handle field at all", () => {
      mockUseMatches.mockReturnValue([{}, { handle: { headerVariant: "portal" } }, {}] as any);
      const data = useRouteData<{ headerVariant?: string }>();
      expect(data.headerVariant).toBe("portal");
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

      mockUseMatches.mockReturnValue([
        {
          handle: {
            headerVariant: "project" as const,
            maxResults: 50,
            pageTitle: "Requests",
            featureFlags: { experimentalSearch: true },
          },
        },
      ] as any);

      const data = useRouteData<RouteData>();
      expect(data.headerVariant).toBe("project");
      expect(data.maxResults).toBe(50);
      expect(data.pageTitle).toBe("Requests");
      expect(data.featureFlags).toEqual({ experimentalSearch: true });
    });

    it("type-level: returned object shape is Partial<TRouteData> — every key is optional", () => {
      interface RouteData {
        headerVariant: "portal" | "project";
        pageTitle: string;
      }
      mockUseMatches.mockReturnValue([]);
      const data = useRouteData<RouteData>();
      expectTypeOf(data).toEqualTypeOf<Partial<RouteData>>();
    });
  });

  describe("coexists with useZones in the same handle", () => {
    it("reads only the keys declared in TRouteData, leaving component zones untouched for useZones", () => {
      // A route can legitimately contribute both: a HeaderActions component
      // (consumed by useZones) AND a headerVariant enum (consumed by
      // useRouteData). Both hooks read the same match, each narrows to its
      // own declared shape.
      interface RouteData {
        headerVariant?: "portal" | "project";
      }
      function HeaderActions() {
        return null;
      }
      mockUseMatches.mockReturnValue([
        { handle: { HeaderActions, headerVariant: "project" } },
      ] as any);

      const data = useRouteData<RouteData>();
      expect(data.headerVariant).toBe("project");
      // Non-declared keys are still present in the returned object — the
      // hook doesn't filter; it's the consumer's TypeScript signature that
      // narrows access. This is intentional so the two hooks don't have to
      // coordinate on key sets.
      expect((data as Record<string, unknown>).HeaderActions).toBe(HeaderActions);
    });
  });
});
