import { describe, it, expectTypeOf } from "vitest";
import type {
  AnyModuleDescriptor,
  ModuleDescriptor,
  NavigationItem,
  NavigationItemBase,
  SlotMap,
} from "./types.js";
import type { NavigationManifest } from "./runtime-types.js";
import { buildNavigationManifest } from "./navigation.js";

// Compile-only regression suite for `NavigationItemBase` — the structural
// upper bound used by every `TNavItem extends …` constraint in the library.
// If these tests fail to compile, consumers would be forced back into
// `@ts-expect-error` / `as unknown as` at every call site that passes a
// `NavigationItem<TLabel, TContext, TMeta>` as a type argument.

describe("NavigationItemBase", () => {
  describe("assignment from concrete NavigationItem variants", () => {
    it("accepts plain `to: string` items (TContext = void)", () => {
      type Plain = NavigationItem;
      expectTypeOf<Plain>().toExtend<NavigationItemBase>();
    });

    it("accepts typed-label items", () => {
      type Labeled = NavigationItem<"nav.home" | "nav.billing">;
      expectTypeOf<Labeled>().toExtend<NavigationItemBase>();
    });

    it("accepts items with a function `to` and a concrete TContext", () => {
      type Dynamic = NavigationItem<string, { workspaceId: string }>;
      expectTypeOf<Dynamic>().toExtend<NavigationItemBase>();
    });

    it("accepts items with typed meta", () => {
      type Action = "manageBilling" | "viewPortal";
      type WithMeta = NavigationItem<string, void, { action?: Action }>;
      expectTypeOf<WithMeta>().toExtend<NavigationItemBase>();
    });

    it("accepts items with all three generics narrowed at once", () => {
      type Keys = "nav.home" | "nav.billing";
      type Ctx = { workspaceId: string };
      type Meta = { action?: "manageBilling"; badge?: "beta" };
      type AppNavItem = NavigationItem<Keys, Ctx, Meta>;
      expectTypeOf<AppNavItem>().toExtend<NavigationItemBase>();
    });
  });

  describe("flows through the library surface without casts", () => {
    // Mirrors the exact consumer pattern that regressed before the fix:
    // `NavigationItem<Keys, Ctx, Meta>` passed as a type argument to
    // `AnyModuleDescriptor`, `ModuleDescriptor`, `buildNavigationManifest`,
    // and `NavigationManifest`. No `@ts-expect-error`, no `as unknown as`.
    type Keys = "nav.home" | "nav.billing";
    type Ctx = { workspaceId: string };
    type Meta = { action?: "manageBilling" };
    type AppNavItem = NavigationItem<Keys, Ctx, Meta>;

    it("works as `AnyModuleDescriptor<TNavItem>`", () => {
      type Aliased = AnyModuleDescriptor<AppNavItem>;
      // The narrowed AppNavItem must still surface through the alias.
      expectTypeOf<NonNullable<Aliased["navigation"]>[number]>().toEqualTypeOf<AppNavItem>();
    });

    it("works as the TNavItem slot on `ModuleDescriptor`", () => {
      type Concrete = ModuleDescriptor<
        Record<string, never>,
        SlotMap,
        Record<string, unknown>,
        AppNavItem
      >;
      expectTypeOf<NonNullable<Concrete["navigation"]>[number]>().toEqualTypeOf<AppNavItem>();
    });

    it("is inferred end-to-end through `buildNavigationManifest`", () => {
      const modules: readonly AnyModuleDescriptor<AppNavItem>[] = [];
      const manifest = buildNavigationManifest<AppNavItem>(modules);
      expectTypeOf(manifest).toEqualTypeOf<NavigationManifest<AppNavItem>>();
      // `to` keeps the function branch — before the fix, it collapsed to `string`.
      expectTypeOf<(typeof manifest.items)[number]["to"]>().toEqualTypeOf<
        string | ((ctx: Ctx) => string)
      >();
    });
  });

  describe("structural bound details", () => {
    it("accepts a minimal item with only `label` and `to`", () => {
      type Minimal = { label: "x"; to: "/x" };
      expectTypeOf<Minimal>().toExtend<NavigationItemBase>();
    });

    it("accepts a `to` function whose ctx is a concrete supertype of `never`", () => {
      type Dynamic = { label: "x"; to: (ctx: { tenantId: string }) => string };
      expectTypeOf<Dynamic>().toExtend<NavigationItemBase>();
    });
  });
});
