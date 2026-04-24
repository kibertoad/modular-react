import { describe, it, expect, expectTypeOf } from "vitest";
import { buildNavigationManifest, resolveNavHref } from "./navigation.js";
import type { AnyModuleDescriptor, NavigationItem, NavigationItemBase } from "./types.js";

function mod<TNavItem extends NavigationItemBase>(
  nav: readonly TNavItem[],
): AnyModuleDescriptor<TNavItem> {
  return {
    id: "test",
    version: "1.0.0",
    navigation: nav,
  } as AnyModuleDescriptor<TNavItem>;
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

  describe("extraItems (non-module contributions)", () => {
    it("merges extra items with module items into the same manifest", () => {
      const m = mod([{ label: "ModuleItem", to: "/m" }]);
      const result = buildNavigationManifest(
        [m],
        [{ label: "PluginItem", to: "/p" }],
      );
      expect(result.items.map((i) => i.label)).toEqual(["ModuleItem", "PluginItem"]);
    });

    it("extra items participate in sort + group logic", () => {
      const m = mod([{ label: "Module", to: "/m", order: 5, group: "finance" }]);
      const result = buildNavigationManifest(
        [m],
        [{ label: "Plugin", to: "/p", order: 1, group: "finance" }],
      );
      // Sorted by order asc — plugin (1) beats module (5).
      expect(result.items.map((i) => i.label)).toEqual(["Plugin", "Module"]);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].items.map((i) => i.label)).toEqual(["Plugin", "Module"]);
    });

    it("no module items + extra items still produces a manifest", () => {
      const result = buildNavigationManifest([], [{ label: "Only", to: "/o" }]);
      expect(result.items).toHaveLength(1);
      expect(result.ungrouped).toHaveLength(1);
    });

    it("an empty extraItems array is a no-op", () => {
      const m = mod([{ label: "A", to: "/a" }]);
      const result = buildNavigationManifest([m], []);
      expect(result.items).toHaveLength(1);
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

  describe("TContext type behavior", () => {
    // These tests are compile-only — they catch regressions in the conditional
    // type on NavigationItem.to (`TContext extends void ? string : string | fn`).
    // Failing compilation here means the `TContext = void` default silently
    // stopped restricting `to` to a plain string, letting dynamic-href modules
    // slip past hosts that never opted into a context shape.

    it("TContext = void keeps `to` as string only (no function allowed)", () => {
      const item: NavigationItem = { label: "x", to: "/x" };
      expectTypeOf(item.to).toEqualTypeOf<string>();
    });

    it("TContext set to an object widens `to` to string | (ctx) => string", () => {
      type Ctx = { workspaceId: string };
      const item: NavigationItem<string, Ctx> = { label: "x", to: "/x" };
      expectTypeOf(item.to).toEqualTypeOf<string | ((ctx: Ctx) => string)>();
    });

    it("resolveNavHref infers TContext from the passed context", () => {
      type Ctx = { id: string };
      const item: Pick<NavigationItem<string, Ctx>, "to" | "label"> = {
        label: "x",
        to: (c) => `/x/${c.id}`,
      };
      // Call site compiles only if TContext is inferred correctly.
      expect(resolveNavHref(item, { id: "7" })).toBe("/x/7");
    });
  });
});
