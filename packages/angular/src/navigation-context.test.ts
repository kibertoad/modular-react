import { describe, expect, it } from "vitest";
import type { NavigationManifest } from "@modular-frontend/core";
import { injectNavigation, provideNavigation } from "./navigation-context.js";
import { renderInContext } from "./test-injector.js";

describe("injectNavigation", () => {
  it("returns navigation manifest from context", () => {
    const nav: NavigationManifest = {
      items: [{ label: "Home", to: "/" }],
      groups: [],
      ungrouped: [{ label: "Home", to: "/" }],
    };
    const { result } = renderInContext(() => injectNavigation(), [provideNavigation(nav)]);
    expect(result).toBe(nav);
  });

  it("throws outside provider", () => {
    expect(() => renderInContext(() => injectNavigation())).toThrow(/injectNavigation/);
  });
});
