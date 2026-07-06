import { describe, it, expectTypeOf } from "vitest";
import type { NavigationItem } from "@modular-frontend/core";
import { useNavigation } from "./navigation-context.js";

describe("useNavigation typing", () => {
  it("passes typed i18n-label keys through to consumers", () => {
    type NavKey = "nav.home" | "nav.billing";
    type AppNavItem = NavigationItem<NavKey>;

    const nav = useNavigation<AppNavItem>();
    expectTypeOf(nav.items[0].label).toEqualTypeOf<NavKey>();
  });

  it("preserves typed meta through the manifest so shell code can read it type-safely", () => {
    interface NavMeta {
      action?: "manageThings" | "createThings";
    }
    type AppNavItem = NavigationItem<string, void, NavMeta>;

    const nav = useNavigation<AppNavItem>();
    expectTypeOf(nav.items[0].meta).toEqualTypeOf<NavMeta | undefined>();
  });
});
