import { describe, it, expect, expectTypeOf } from "vitest";
import { buildNavigationManifest, resolveNavHref } from "./navigation.js";
import type { ModuleDescriptor, NavigationItem } from "./types.js";

function mod<TNavItem extends NavigationItem>(
  nav: readonly TNavItem[],
): ModuleDescriptor<any, any, any, TNavItem> {
  return { id: "test", version: "1.0.0", navigation: nav } as ModuleDescriptor<
    any,
    any,
    any,
    TNavItem
  >;
}

describe("buildNavigationManifest", () => {
  describe("shape", () => {
    it("returns empty manifest for no modules", () => {
      const result = buildNavigationManifest([]);
      expect(result.items).toEqual([]);
      expect(result.groups).toEqual([]);
      expect(result.ungrouped).toEqual([]);
    });

    it("collects items from all modules", () => {
      const m1 = mod([{ label: "A", to: "/a" }]);
      const m2 = mod([{ label: "B", to: "/b" }]);
      const result = buildNavigationManifest([m1, m2]);
      expect(result.items).toHaveLength(2);
    });
  });

  describe("sorting", () => {
    it("sorts by order first, then label alphabetically", () => {
      const m = mod([
        { label: "Zebra", to: "/z", order: 1 },
        { label: "Apple", to: "/a", order: 2 },
        { label: "Banana", to: "/b", order: 1 },
      ]);
      const result = buildNavigationManifest([m]);
      expect(result.items.map((i) => i.label)).toEqual(["Banana", "Zebra", "Apple"]);
    });

    it("items without order sort after items with order, alphabetically among themselves", () => {
      const m = mod([
        { label: "Cherry", to: "/c" },
        { label: "Apple", to: "/a" },
        { label: "Banana", to: "/b", order: 5 },
      ]);
      const result = buildNavigationManifest([m]);
      expect(result.items.map((i) => i.label)).toEqual(["Banana", "Apple", "Cherry"]);
    });
  });

  describe("grouping", () => {
    it("groups items by group key", () => {
      const m = mod([
        { label: "A", to: "/a", group: "finance" },
        { label: "B", to: "/b", group: "finance" },
        { label: "C", to: "/c" },
      ]);
      const result = buildNavigationManifest([m]);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].group).toBe("finance");
      expect(result.groups[0].items).toHaveLength(2);
      expect(result.ungrouped).toHaveLength(1);
    });
  });

  describe("preserves dynamic `to` functions through the manifest", () => {
    it("keeps function references in manifest.items so the shell can resolve at render time", () => {
      type Ctx = { workspaceId: string };
      const toFn = ({ workspaceId }: Ctx) => `/w/${workspaceId}/x`;
      const m = mod<NavigationItem<string, Ctx>>([{ label: "Dynamic", to: toFn }]);
      const manifest = buildNavigationManifest<NavigationItem<string, Ctx>>([m]);
      expect(typeof manifest.items[0].to).toBe("function");
      // Type-level: manifest items carry the original NavigationItem<TLabel, TContext> shape
      expectTypeOf(manifest.items[0].to).toEqualTypeOf<string | ((ctx: Ctx) => string)>();
    });
  });

  describe("preserves `meta` through the manifest", () => {
    it("preserves app-owned meta so the shell can filter on it (e.g. permissions)", () => {
      interface NavMeta {
        action?: string;
      }
      const m = mod<NavigationItem<string, void, NavMeta>>([
        { label: "Restricted", to: "/x", meta: { action: "manageThings" } },
        { label: "Public", to: "/y" },
      ]);
      const manifest = buildNavigationManifest<NavigationItem<string, void, NavMeta>>([m]);
      const byLabel = Object.fromEntries(manifest.items.map((i) => [i.label, i]));
      expect(byLabel.Restricted!.meta).toEqual({ action: "manageThings" });
      expect(byLabel.Public!.meta).toBeUndefined();
    });
  });

  describe("generic NavigationItem type propagation", () => {
    // These tests don't assert runtime behavior — they exist to catch
    // regressions in the generic plumbing. Failing compilation here means
    // the TNavItem generic stopped flowing through ModuleDescriptor /
    // buildNavigationManifest.

    it("TLabel narrows label field at compile time", () => {
      type Keys = "nav.home" | "nav.settings";
      type Item = NavigationItem<Keys>;
      const m = mod<Item>([{ label: "nav.home", to: "/" }]);
      const manifest = buildNavigationManifest<Item>([m]);
      expectTypeOf(manifest.items[0].label).toEqualTypeOf<Keys>();
    });

    it("TMeta flows through into manifest.items[_].meta", () => {
      interface Meta {
        action: string;
      }
      type Item = NavigationItem<string, void, Meta>;
      const m = mod<Item>([{ label: "x", to: "/x", meta: { action: "foo" } }]);
      const manifest = buildNavigationManifest<Item>([m]);
      expectTypeOf(manifest.items[0].meta).toEqualTypeOf<Meta | undefined>();
    });
  });
});

describe("resolveNavHref", () => {
  describe("string `to`", () => {
    it("returns the string unchanged", () => {
      expect(resolveNavHref({ label: "x", to: "/settings" })).toBe("/settings");
    });

    it("ignores any provided context — a static to shouldn't break if the shell always passes context", () => {
      expect(resolveNavHref({ label: "x", to: "/settings" }, { workspaceId: "ws1" })).toBe(
        "/settings",
      );
    });
  });

  describe("function `to`", () => {
    it("invokes the function with context and returns the result", () => {
      const item = {
        label: "portal",
        to: ({ workspaceId }: { workspaceId: string }) => `/portal/${workspaceId}/requests`,
      };
      expect(resolveNavHref(item, { workspaceId: "ws-42" })).toBe("/portal/ws-42/requests");
    });

    it("receives the exact context object (reference equality, not a clone)", () => {
      const ctx = { workspaceId: "ws-1" };
      let received: unknown = null;
      const item = {
        label: "x",
        to: (c: typeof ctx) => {
          received = c;
          return "/x";
        },
      };
      resolveNavHref(item, ctx);
      expect(received).toBe(ctx);
    });

    it("throws with a helpful message if context is missing for a function to", () => {
      const item = { label: "portal", to: () => "/portal" };
      expect(() => resolveNavHref(item)).toThrow(/"portal".*no context was provided/);
    });
  });

  describe("invalid `to`", () => {
    it("throws for non-string, non-function values — surfaces bad descriptor shapes early", () => {
      const item = { label: "broken", to: 42 as unknown as string };
      expect(() => resolveNavHref(item)).toThrow(/"broken".*invalid `to` field/);
    });
  });
});
