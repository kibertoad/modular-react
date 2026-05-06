import type { AnyModuleDescriptor, NavigationItem, NavigationItemBase } from "./types.js";
import type { NavigationManifest, NavigationGroup } from "./runtime-types.js";

/**
 * Collect navigation items from every module into a sorted + grouped manifest.
 *
 * Items are sorted by `order` ascending (missing order sorts last); ties
 * preserve insertion order (modules in registration order, items in declared
 * order within each module, plugin items last). Items with a `group` key
 * land in the matching entry of `groups`; items without a group land in
 * `ungrouped`.
 *
 * Generic over `TNavItem` so host-specific NavigationItem subtypes (typed
 * labels, typed dynamic-href context, typed meta) are preserved end-to-end —
 * call `buildNavigationManifest<AppNavItem>([...])` or let inference pick it
 * up from the module list.
 *
 * Pass `extraItems` to merge additional items from non-module sources
 * (e.g. plugin-contributed items via `RegistryPlugin.contributeNavigation`).
 * They participate in the same sort/group logic as module items.
 */
export function buildNavigationManifest<TNavItem extends NavigationItemBase = NavigationItem>(
  modules: readonly AnyModuleDescriptor<TNavItem>[],
  extraItems?: readonly TNavItem[],
): NavigationManifest<TNavItem> {
  const allItems: TNavItem[] = [];

  for (const mod of modules) {
    if (mod.navigation) {
      allItems.push(...mod.navigation);
    }
  }

  if (extraItems && extraItems.length > 0) {
    allItems.push(...extraItems);
  }

  // Sort by `order` ascending; missing `order` sorts after every explicit
  // value (no upper-bound sentinel — an item with `order: 9999` still sorts
  // before unordered items). Ties preserve insertion order
  // (Array.prototype.sort is stable in ES2019+): modules in registration
  // order, items in declared order within each module's `navigation` array,
  // plugin `extraItems` last. Deterministic, SSR-safe, and matches developer
  // intent — the things you declared first render first. Label is
  // intentionally not a tiebreaker: labels are typed as i18n keys in host
  // apps (`TLabel` defaults to `string` but narrows to `ParseKeys`), so
  // lexicographic comparison would sort by translation-system artifact
  // rather than anything meaningful.
  const sorted = [...allItems].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  // Group items
  const groupMap = new Map<string, TNavItem[]>();
  const ungrouped: TNavItem[] = [];

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

  const groups: NavigationGroup<TNavItem>[] = [...groupMap.entries()].map(([group, items]) => ({
    group,
    items,
  }));

  return { items: sorted, groups, ungrouped };
}

/**
 * Resolve a {@link NavigationItem}'s `to` field to a concrete href string.
 *
 * - If `to` is a plain string, returns it unchanged.
 * - If `to` is a function, calls it with `context` (required in that case)
 *   and returns the resulting string.
 *
 * Typical use is in the shell at render time:
 *
 * ```ts
 * import { resolveNavHref } from "@modular-react/core"
 *
 * function Sidebar() {
 *   const nav = useNavigation()
 *   const workspaceId = useWorkspaceId()
 *   return (
 *     <ul>
 *       {nav.items.map(item => (
 *         <li key={item.label}>
 *           <Link to={resolveNavHref(item, { workspaceId })}>
 *             {t(item.label)}
 *           </Link>
 *         </li>
 *       ))}
 *     </ul>
 *   )
 * }
 * ```
 *
 * Passing context to an item whose `to` is a plain string is safe — the
 * context is ignored. Passing `undefined` to an item whose `to` is a
 * function throws rather than silently rendering `undefined`.
 */
export function resolveNavHref<TContext>(
  item: Pick<NavigationItem<string, TContext, unknown>, "to" | "label">,
  context?: TContext,
): string {
  const { to } = item;
  if (typeof to === "string") return to;
  if (typeof to === "function") {
    if (context === undefined) {
      throw new Error(
        `[@modular-react/core] resolveNavHref: navigation item "${item.label}" has a function \`to\` but no context was provided.`,
      );
    }
    return (to as (ctx: TContext) => string)(context);
  }
  throw new Error(
    `[@modular-react/core] resolveNavHref: navigation item "${item.label}" has an invalid \`to\` field (expected string or function, got ${typeof to}).`,
  );
}
