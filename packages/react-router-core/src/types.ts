import type { RouteObject } from "react-router";
import type {
  ModuleDescriptor as BaseModuleDescriptor,
  NavigationItem,
  SlotMap,
  SlotMapOf,
} from "@modular-react/core";

// Re-export shared types from @modular-react/core
export type {
  ReactiveService,
  SlotMap,
  SlotMapOf,
  ZoneMap,
  ZoneMapOf,
  NavigationItem,
  ModuleLifecycle,
} from "@modular-react/core";

/**
 * Describes a reactive module — a self-contained piece of UI that declares
 * its routes, navigation items, slot contributions, shared dependency requirements,
 * and lifecycle hooks.
 *
 * Extends the base ModuleDescriptor from @modular-react/core with
 * React Router-specific createRoutes that returns RouteObject(s).
 */
export interface ModuleDescriptor<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
  TNavItem extends NavigationItem = NavigationItem,
> extends Omit<BaseModuleDescriptor<TSharedDependencies, TSlots, TMeta, TNavItem>, "createRoutes"> {
  /**
   * Returns the module's route subtree as React Router RouteObject(s).
   *
   * Optional — omit for "headless" modules that contribute only
   * via slots, navigation, and lifecycle hooks without owning routes.
   */
  readonly createRoutes?: () => RouteObject | RouteObject[];
}

/**
 * Descriptor for a lazily-loaded module.
 * The full module descriptor is loaded on demand when the route is first visited.
 *
 * See the base {@link import("@modular-react/core").LazyModuleDescriptor}
 * JSDoc for the list of fields that are ignored at lazy-load time — only
 * `createRoutes()` is honored.
 */
export interface LazyModuleDescriptor<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
  TNavItem extends NavigationItem = NavigationItem,
> {
  /** Unique module identifier */
  readonly id: string;

  /** Base path prefix — used to create a catch-all route that triggers loading */
  readonly basePath: string;

  /** Dynamic import that returns the full module descriptor */
  readonly load: () => Promise<{
    default: ModuleDescriptor<TSharedDependencies, TSlots, TMeta, TNavItem>;
  }>;
}
