import type { Route } from "@angular/router";
import type {
  ModuleDescriptor as BaseModuleDescriptor,
  NavigationItem,
  NavigationItemBase,
  SlotMap,
  SlotMapOf,
} from "@modular-frontend/core";

// Re-export shared types from @modular-frontend/core
export type {
  ReactiveService,
  SlotMap,
  SlotMapOf,
  ZoneMap,
  ZoneMapOf,
  NavigationItem,
  NavigationItemBase,
  ModuleLifecycle,
} from "@modular-frontend/core";

/**
 * Describes a reactive module — a self-contained piece of UI that declares
 * its routes, navigation items, slot contributions, shared dependency requirements,
 * and lifecycle hooks.
 *
 * Extends the base ModuleDescriptor from @modular-frontend/core with
 * Angular Router-specific createRoutes that returns Angular `Route`(s).
 */
export interface ModuleDescriptor<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
  TNavItem extends NavigationItemBase = NavigationItem,
> extends Omit<BaseModuleDescriptor<TSharedDependencies, TSlots, TMeta, TNavItem>, "createRoutes"> {
  /**
   * Returns the module's route subtree as Angular Router `Route`(s).
   *
   * The runtime rebuilds the full router config and installs it via
   * `router.resetConfig()` (PR-A22), so a module can contribute its routes at
   * registration time without freezing the tree up front.
   *
   * Optional — omit for "headless" modules that contribute only
   * via slots, navigation, and lifecycle hooks without owning routes.
   */
  readonly createRoutes?: () => Route | Route[];
}

/**
 * Descriptor for a lazily-loaded module.
 * The full module descriptor is loaded on demand when the route is first visited.
 *
 * Angular Router's `router.resetConfig()` lets the runtime graft the loaded
 * module's route subtree in on first visit, so — unlike the frozen-tree routers
 * — an Angular lazy module contributes a full `createRoutes()` subtree, not just
 * a single catch-all component. See the base
 * {@link import("@modular-frontend/core").LazyModuleDescriptor} JSDoc for the
 * list of fields that are ignored at lazy-load time — only `createRoutes()` is
 * honored.
 */
export interface LazyModuleDescriptor<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
  TNavItem extends NavigationItemBase = NavigationItem,
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

/**
 * Angular Router-narrowed {@link ModuleDescriptor} with every generic
 * defaulted except `TNavItem`.
 *
 * Shorthand for `ModuleDescriptor<any, any, any, TNavItem>` in internal
 * plumbing (manifest builders, registry signatures, test helpers) where
 * only the nav item shape matters and the other parameters would be
 * filler. Preserves the Angular Router-specific `createRoutes` signature
 * unlike {@link import("@modular-frontend/core").AnyModuleDescriptor}, which
 * targets the router-agnostic base descriptor.
 */
// Uses `any` (not `Record<string, any>` / `SlotMap` / `Record<string, unknown>`)
// for the filled-in generics on purpose: `any` is bivariant, so
// `AnyModuleDescriptor<TNavItem>` accepts `ModuleDescriptor<TDeps, TSlots, …,
// TNavItem>` for arbitrary concrete `TDeps` / `TSlots`. With the stricter
// constraint defaults, TS refuses the assignment at generic boundaries —
// which defeats the whole point of the alias.
export type AnyModuleDescriptor<TNavItem extends NavigationItemBase = NavigationItem> =
  ModuleDescriptor<any, any, any, TNavItem>;
