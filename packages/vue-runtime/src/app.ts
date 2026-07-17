import type {
  NavigationItem,
  NavigationItemBase,
  SlotMap,
  SlotMapOf,
} from "@modular-frontend/core";
import type { ModuleRegistry } from "./registry.js";
import type { ApplicationManifest, ResolveOptions } from "./types.js";

/**
 * Resolves a registry and returns its application manifest — a Vue plugin that
 * installs the modular contexts, plus the router (with module routes grafted)
 * and the resolved navigation / slots / modules surface.
 *
 * The manifest is itself installable, so the common wiring is one line:
 *
 * ```ts
 * const router = createRouter({ history: createWebHistory(), routes: shellRoutes })
 * const app = createApp(RootComponent)
 * app.use(router)
 * app.use(createModularApp(registry, { router }))
 * app.mount('#app')
 * ```
 *
 * Thin convenience over {@link ModuleRegistry.resolve}; call `registry.resolve`
 * directly if you need to name the manifest before installing it.
 */
export function createModularApp<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = NavigationItem,
>(
  registry: ModuleRegistry<TSharedDependencies, TSlots, TNavItem, any>,
  options: ResolveOptions<TSharedDependencies, TSlots>,
): ApplicationManifest<TSlots, TNavItem> {
  return registry.resolve(options);
}
