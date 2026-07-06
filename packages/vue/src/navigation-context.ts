import { inject, provide, type InjectionKey } from "vue";
import type {
  NavigationItem,
  NavigationItemBase,
  NavigationManifest,
} from "@modular-frontend/core";

/** Injection key holding the auto-generated navigation manifest. */
export const navigationKey: InjectionKey<NavigationManifest<NavigationItemBase>> =
  Symbol("modular-vue.navigation");

/**
 * Provide the navigation manifest to descendant components. Analog of rendering
 * `<NavigationContext value={nav}>`.
 */
export function provideNavigation(nav: NavigationManifest<NavigationItemBase>): void {
  provide(navigationKey, nav);
}

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
 * // In a Sidebar component's <script setup>:
 * const nav = useNavigation<AppNavItem>()
 * // nav.items[0].label is ParseKeys
 * // nav.items[0].meta?.action is Action | undefined
 * ```
 */
export function useNavigation<
  TNavItem extends NavigationItemBase = NavigationItem,
>(): NavigationManifest<TNavItem> {
  const nav = inject(navigationKey, null);
  if (!nav) {
    throw new Error("[@modular-vue/vue] useNavigation must be used within a modular app.");
  }
  return nav as NavigationManifest<TNavItem>;
}
