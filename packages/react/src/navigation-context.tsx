import { createContext, useContext } from "react";
import type { NavigationItem, NavigationItemBase, NavigationManifest } from "@modular-react/core";

export const NavigationContext = createContext<NavigationManifest<NavigationItemBase> | null>(null);

/**
 * Access the auto-generated navigation manifest from registered modules.
 * Use this in layout components to render sidebar/nav items.
 *
 * Pass your app-specific `TNavItem` alias to preserve typed labels, typed
 * dynamic-href context, and typed `meta` through the manifest:
 *
 * ```ts
 * type AppNavItem = NavigationItem<ParseKeys, { workspaceId: string }, { action?: Action }>
 *
 * function Sidebar() {
 *   const nav = useNavigation<AppNavItem>()
 *   // nav.items[0].label is ParseKeys
 *   // nav.items[0].meta?.action is Action | undefined
 * }
 * ```
 */
export function useNavigation<
  TNavItem extends NavigationItemBase = NavigationItem,
>(): NavigationManifest<TNavItem> {
  const nav = useContext(NavigationContext);
  if (!nav) {
    throw new Error("[@modular-react/react] useNavigation must be used within a <ModularApp />.");
  }
  return nav as NavigationManifest<TNavItem>;
}
