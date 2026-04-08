import type { ReactiveModuleDescriptor, NavigationItem } from "@tanstack-react-modules/core";
import type { NavigationManifest, NavigationGroup } from "./types.js";

export function buildNavigationManifest(modules: ReactiveModuleDescriptor[]): NavigationManifest {
  const allItems: NavigationItem[] = [];

  for (const mod of modules) {
    if (mod.navigation) {
      allItems.push(...mod.navigation);
    }
  }

  // Sort by order (lower first), then by label alphabetically
  const sorted = [...allItems].sort((a, b) => {
    const orderDiff = (a.order ?? 999) - (b.order ?? 999);
    if (orderDiff !== 0) return orderDiff;
    return a.label.localeCompare(b.label);
  });

  // Group items
  const groupMap = new Map<string, NavigationItem[]>();
  const ungrouped: NavigationItem[] = [];

  for (const item of sorted) {
    if (item.group) {
      let group = groupMap.get(item.group);
      if (!group) {
        group = [];
        groupMap.set(item.group, group);
      }
      group.push(item);
    } else {
      ungrouped.push(item);
    }
  }

  const groups: NavigationGroup[] = [...groupMap.entries()].map(([group, items]) => ({
    group,
    items,
  }));

  return { items: sorted, groups, ungrouped };
}
