import { describe, it, expect, vi, expectTypeOf } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useMatches: vi.fn(),
}));

import { useMatches } from "@tanstack/react-router";
import { useRouteData } from "./route-data.js";

/**
 * TanStack Router exposes route handles via `staticData`. These tests
 * mirror the React Router `useRouteData` behaviors one-for-one so the two
 * ecosystems offer the same semantics.
 */

const mockUseMatches = vi.mocked(useMatches);

describe("useRouteData (TanStack)", () => {
  it("returns empty object when no matches contribute staticData", () => {
    mockUseMatches.mockReturnValue([{ staticData: {} }, { staticData: {} }] as any);
    expect(useRouteData<Record<string, unknown>>()).toEqual({});
  });

  it("returns values from a single matched route", () => {
    mockUseMatches.mockReturnValue([{ staticData: { headerVariant: "portal" } }] as any);
    const data = useRouteData<{ headerVariant?: string }>();
    expect(data.headerVariant).toBe("portal");
  });

  it("deepest match wins — child route overrides parent", () => {
    mockUseMatches.mockReturnValue([
      { staticData: { headerVariant: "portal" } },
      { staticData: { headerVariant: "project" } },
    ] as any);
    expect(useRouteData<{ headerVariant?: string }>().headerVariant).toBe("project");
  });

  it("merges distinct keys across hierarchy", () => {
    mockUseMatches.mockReturnValue([
      { staticData: { pageTitle: "Parent" } },
      { staticData: { headerVariant: "project" } },
    ] as any);
    expect(useRouteData<{ pageTitle?: string; headerVariant?: string }>()).toEqual({
      pageTitle: "Parent",
      headerVariant: "project",
    });
  });

  it("skips undefined values so a parent's value isn't clobbered", () => {
    mockUseMatches.mockReturnValue([
      { staticData: { headerVariant: "portal" } },
      { staticData: { headerVariant: undefined } },
    ] as any);
    expect(useRouteData<{ headerVariant?: string }>().headerVariant).toBe("portal");
  });

  it("tolerates matches with no staticData field at all", () => {
    mockUseMatches.mockReturnValue([{}, { staticData: { headerVariant: "portal" } }, {}] as any);
    expect(useRouteData<{ headerVariant?: string }>().headerVariant).toBe("portal");
  });

  it("accepts non-component values — strings, numbers, objects", () => {
    interface RouteData {
      headerVariant?: "portal";
      maxResults?: number;
      pageTitle?: string;
    }
    mockUseMatches.mockReturnValue([
      { staticData: { headerVariant: "portal", maxResults: 50, pageTitle: "X" } },
    ] as any);
    expect(useRouteData<RouteData>()).toEqual({
      headerVariant: "portal",
      maxResults: 50,
      pageTitle: "X",
    });
  });

  it("type-level: returned shape is Partial<TRouteData>", () => {
    interface RouteData {
      headerVariant: "portal";
      pageTitle: string;
    }
    mockUseMatches.mockReturnValue([]);
    const data = useRouteData<RouteData>();
    expectTypeOf(data).toEqualTypeOf<Partial<RouteData>>();
  });
});
