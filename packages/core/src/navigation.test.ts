import { describe, it, expect } from "vitest";
import { buildNavigationManifest } from "./navigation.js";
import type { ModuleDescriptor } from "./types.js";

function mod(nav: ModuleDescriptor["navigation"]): ModuleDescriptor {
  return { id: "test", version: "1.0.0", navigation: nav };
}

describe("buildNavigationManifest", () => {
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

  it("sorts by order first, then label alphabetically", () => {
    const m = mod([
      { label: "Zebra", to: "/z", order: 1 },
      { label: "Apple", to: "/a", order: 2 },
      { label: "Banana", to: "/b", order: 1 },
    ]);
    const result = buildNavigationManifest([m]);
    expect(result.items.map((i) => i.label)).toEqual(["Banana", "Zebra", "Apple"]);
  });

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
