import { describe, it, expectTypeOf } from "vitest";
import type { AnyModuleDescriptor, ModuleDescriptor, NavigationItem, SlotMap } from "./types.js";
import { buildNavigationManifest } from "./navigation.js";

// These tests are compile-only — they catch regressions in the alias
// definition itself. If `AnyModuleDescriptor` stops accepting arbitrary
// `TSharedDependencies` / `TSlots` / `TMeta` (as it would if the alias were
// pinned to `Record<string, any>` / `SlotMap` / `Record<string, unknown>`
// instead of `any` at those positions), these would stop compiling.

describe("AnyModuleDescriptor", () => {
  describe("assignment from concrete descriptors", () => {
    it("accepts a descriptor with concrete TSharedDependencies, TSlots, TMeta", () => {
      interface AppDeps {
        auth: { userId: string };
      }
      interface AppSlots extends SlotMap {
        commands: readonly { id: string }[];
      }
      interface AppMeta {
        owner: string;
      }
      type AppNavItem = NavigationItem<"home" | "settings">;

      type Concrete = ModuleDescriptor<AppDeps, AppSlots, AppMeta, AppNavItem>;
      expectTypeOf<Concrete>().toMatchTypeOf<AnyModuleDescriptor<AppNavItem>>();
    });

    it("accepts arrays of concrete descriptors wherever AnyModuleDescriptor[] is expected", () => {
      // Mirrors the real call site in registry code — `modules` is typed
      // against a concrete TDeps/TSlots, but is passed into helpers that
      // expect `readonly AnyModuleDescriptor<TNavItem>[]`.
      interface AppDeps {
        auth: { userId: string };
      }
      interface AppSlots extends SlotMap {
        commands: readonly string[];
      }
      type AppNavItem = NavigationItem<string>;

      const modules: readonly ModuleDescriptor<AppDeps, AppSlots, any, AppNavItem>[] = [];
      // Compile error here = alias variance regression.
      buildNavigationManifest<AppNavItem>(modules);
    });
  });

  describe("TNavItem narrowing is preserved", () => {
    it("keeps TNavItem visible through the alias (i18n-typed labels)", () => {
      type Keys = "nav.home" | "nav.billing";
      type LabeledNav = NavigationItem<Keys>;
      type Aliased = AnyModuleDescriptor<LabeledNav>;
      // `navigation` on the alias must still surface the narrowed label type.
      expectTypeOf<NonNullable<Aliased["navigation"]>[number]["label"]>().toEqualTypeOf<Keys>();
    });

    it("defaults TNavItem to NavigationItem when omitted", () => {
      type Default = AnyModuleDescriptor;
      type Explicit = AnyModuleDescriptor<NavigationItem>;
      expectTypeOf<Default>().toEqualTypeOf<Explicit>();
    });
  });
});
