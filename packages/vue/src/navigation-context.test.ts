import { describe, it, expect } from "vitest";
import type { NavigationManifest } from "@modular-frontend/core";
import { navigationKey, useNavigation } from "./navigation-context.js";
import { renderComposable } from "./test-render.js";

describe("useNavigation", () => {
  it("returns navigation manifest from context", () => {
    const nav: NavigationManifest = {
      items: [{ label: "Home", to: "/" }],
      groups: [],
      ungrouped: [{ label: "Home", to: "/" }],
    };
    const { result } = renderComposable(() => useNavigation(), {
      provide: { [navigationKey as symbol]: nav },
    });
    expect(result()).toBe(nav);
  });

  it("throws outside provider", () => {
    expect(() => renderComposable(() => useNavigation())).toThrow(/useNavigation/);
  });
});
