import { describe, it, expect, expectTypeOf } from "vitest";
import { renderHook } from "@testing-library/react";
import { NavigationContext, useNavigation } from "./navigation-context.js";
import type { NavigationItem, NavigationManifest } from "@modular-react/core";

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

  it("passes typed i18n-label keys through to consumers", () => {
    // Narrowed NavItem — labels must be "nav.home" | "nav.billing"
    type NavKey = "nav.home" | "nav.billing";
    type AppNavItem = NavigationItem<NavKey>;

    const nav: NavigationManifest<AppNavItem> = {
      items: [{ label: "nav.home", to: "/" }],
      groups: [],
      ungrouped: [{ label: "nav.home", to: "/" }],
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NavigationContext value={nav}>{children}</NavigationContext>
    );

    const { result } = renderHook(() => useNavigation<AppNavItem>(), { wrapper });
    expect(result.current.items[0].label).toBe("nav.home");
    expectTypeOf(result.current.items[0].label).toEqualTypeOf<NavKey>();
  });

  it("preserves typed meta through the manifest so shell code can read it type-safely", () => {
    interface NavMeta {
      action?: "manageThings" | "createThings";
    }
    type AppNavItem = NavigationItem<string, void, NavMeta>;

    const nav: NavigationManifest<AppNavItem> = {
      items: [{ label: "Restricted", to: "/x", meta: { action: "manageThings" } }],
      groups: [],
      ungrouped: [{ label: "Restricted", to: "/x", meta: { action: "manageThings" } }],
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NavigationContext value={nav}>{children}</NavigationContext>
    );

    const { result } = renderHook(() => useNavigation<AppNavItem>(), { wrapper });
    expect(result.current.items[0].meta?.action).toBe("manageThings");
    expectTypeOf(result.current.items[0].meta).toEqualTypeOf<NavMeta | undefined>();
  });
});
