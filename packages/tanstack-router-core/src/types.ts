import type { AnyRoute } from "@tanstack/react-router";
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
 * TanStack Router-specific createRoutes that receives a parent route.
 */
export interface ModuleDescriptor<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
  TNavItem extends NavigationItem = NavigationItem,
> extends Omit<BaseModuleDescriptor<TSharedDependencies, TSlots, TMeta, TNavItem>, "createRoutes"> {
  /**
   * Receives a parent route and returns the module's route subtree.
   * Uses TanStack Router's createRoute directly.
   *
   * Optional — omit for "headless" modules that contribute only
   * via slots, navigation, and lifecycle hooks without owning routes.
   */
  readonly createRoutes?: (parentRoute: AnyRoute) => AnyRoute;
}

/**
 * Descriptor for a lazily-loaded module (TanStack Router adapter).
 *
 * TanStack Router's route tree is frozen at `createRouter({ routeTree })`
 * time; routes cannot be added post-hoc. That makes the TanStack semantics
 * **different from the React Router adapter** — here a lazy module
 * contributes a single `component` rendered at `basePath/$` via TanStack's
 * `lazyRouteComponent`, rather than a route subtree via `createRoutes`.
 *
 * ## What a lazy module can and cannot contribute (TanStack)
 *
 * **Honored:** `component` — rendered at the catch-all for any sub-path
 * under `basePath`. Use this for simple code-splitting of a feature's
 * entry component.
 *
 * **Ignored (the runtime warns at load time):** `createRoutes`, `navigation`,
 * `slots`, `dynamicSlots`, `zones`, `meta`, `requires`, `optionalRequires`,
 * `lifecycle`. Navigation / slots / lifecycle happen at registry resolve
 * time, before the lazy module has loaded; `createRoutes` is ignored
 * specifically because TanStack's route tree is static.
 *
 * For multi-route code splitting, register the module eagerly and use
 * `lazyRouteComponent()` inside its own `createRoutes`. For runtime-loaded
 * route *structure* (genuine plugin-host apps), TanStack Router is the
 * wrong model entirely — those apps want React Router's `useRoutes()`.
 *
 * Lazy modules are rejected by `resolveManifest()` (framework mode): in
 * that mode the host owns route composition, so there is no parent route
 * for a catch-all to attach to. See docs/framework-mode-tanstack-router.md.
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

/**
 * TanStack Router-narrowed {@link ModuleDescriptor} with every generic
 * defaulted except `TNavItem`.
 *
 * Shorthand for `ModuleDescriptor<any, any, any, TNavItem>` in internal
 * plumbing (manifest builders, registry signatures, test helpers) where
 * only the nav item shape matters and the other parameters would be
 * filler. Preserves the TanStack Router-specific `createRoutes` signature
 * unlike {@link import("@modular-react/core").AnyModuleDescriptor}, which
 * targets the router-agnostic base descriptor.
 */
// Uses `any` (not `Record<string, any>` / `SlotMap` / `Record<string, unknown>`)
// for the filled-in generics on purpose: `any` is bivariant, so
// `AnyModuleDescriptor<TNavItem>` accepts `ModuleDescriptor<TDeps, TSlots, …,
// TNavItem>` for arbitrary concrete `TDeps` / `TSlots`. With the stricter
// constraint defaults, TS refuses the assignment at generic boundaries —
// which defeats the whole point of the alias.
export type AnyModuleDescriptor<TNavItem extends NavigationItem = NavigationItem> =
  ModuleDescriptor<any, any, any, TNavItem>;
