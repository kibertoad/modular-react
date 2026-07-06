import { inject, InjectionToken, type Provider } from "@angular/core";
import type {
  NavigationItem,
  NavigationItemBase,
  NavigationManifest,
} from "@modular-frontend/core";
import { type InjectionContextOptions, runInContext } from "./injection-context.js";

/** Injection token holding the auto-generated navigation manifest. */
export const NAVIGATION = new InjectionToken<NavigationManifest<NavigationItemBase>>(
  "modular-angular.navigation",
);

/**
 * Provider factory that installs the navigation manifest. Analog of rendering
 * `<NavigationContext value={nav}>`.
 */
export function provideNavigation(nav: NavigationManifest<NavigationItemBase>): Provider {
  return { provide: NAVIGATION, useValue: nav };
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
 * // In a Sidebar component field initializer:
 * readonly nav = injectNavigation<AppNavItem>()
 * // nav.items[0].label is ParseKeys
 * // nav.items[0].meta?.action is Action | undefined
 * ```
 */
export function injectNavigation<TNavItem extends NavigationItemBase = NavigationItem>(
  options?: InjectionContextOptions,
): NavigationManifest<TNavItem> {
  return runInContext(options, injectNavigation, () => {
    const nav = inject(NAVIGATION, { optional: true });
    if (!nav) {
      throw new Error(
        "[@modular-angular/angular] injectNavigation must be used within a modular app.",
      );
    }
    return nav as NavigationManifest<TNavItem>;
  });
}
