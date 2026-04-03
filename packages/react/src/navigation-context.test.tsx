import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { NavigationContext, useNavigation } from "./navigation-context.js";
import type { NavigationManifest } from "@modular-react/core";

describe("useNavigation", () => {
  it("returns navigation manifest from context", () => {
    const nav: NavigationManifest = {
      items: [{ label: "Home", to: "/" }],
      groups: [],
      ungrouped: [{ label: "Home", to: "/" }],
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NavigationContext value={nav}>{children}</NavigationContext>
    );

    const { result } = renderHook(() => useNavigation(), { wrapper });
    expect(result.current).toBe(nav);
  });

  it("throws outside provider", () => {
    expect(() => renderHook(() => useNavigation())).toThrow(/useNavigation/);
  });
});
