import type {
  ModuleDescriptor,
  NavigationItem,
  NavigationItemBase,
  NavigationManifest,
  ModuleEntry,
  SlotMap,
  SlotMapOf,
} from "@modular-frontend/core";

// The registry config is framework-neutral — stores are `Store<T>` (the core
// contract satisfied by both zustand and `@modular-frontend/core`'s
// `createStore`), so vue-router reuses it directly rather than redeclaring a
// zustand-typed copy the way the React runtime does.
export type { RegistryConfig } from "@modular-frontend/core";

// Re-export shared runtime types from @modular-frontend/core.
export type { NavigationGroup, NavigationManifest, ModuleEntry } from "@modular-frontend/core";

/**
 * A module exit surfaced outside a journey host. Mirrors the React runtime's
 * `onModuleExit` event shape; carried on {@link ResolveManifestOptions} and
 * echoed back on {@link ResolvedManifest} for shells that wire module hosting
 * themselves.
 */
export interface ModuleExitEvent {
  readonly moduleId: string;
  readonly entry: string;
  readonly exit: string;
  readonly output: unknown;
  readonly tabId?: string;
}

/**
 * Options for {@link import("./registry.js").ModuleRegistry.resolveManifest}.
 *
 * The `Providers` component, the router-owning `resolve()` entry, and the
 * `providers` array they consume land in PR-22 (the route-building + app-shell
 * part). The options honored today are the ones that shape the resolved data:
 * `slotFilter` (also decides whether `recalculateSlots` is a no-op) and
 * `onModuleExit` (echoed back on the manifest).
 */
export interface ResolveManifestOptions<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
> {
  /**
   * Global filter applied to the fully resolved slot manifest (static + dynamic)
   * on every `recalculateSlots()` call. Its presence also makes
   * `recalculateSlots` a live notifier rather than a no-op.
   */
  slotFilter?: (slots: TSlots, deps: TSharedDependencies) => TSlots;

  /**
   * Called when a module emits an exit outside a journey host. The shell
   * typically uses this to close the tab, invoke navigation, or forward to
   * analytics. Surfaced back on {@link ResolvedManifest.onModuleExit}.
   */
  onModuleExit?: (event: ModuleExitEvent) => void;
}

/**
 * Result of {@link import("./registry.js").ModuleRegistry.resolveManifest} —
 * the resolved registry data. Gives you the navigation manifest, resolved
 * slots, module entries + descriptors, plugin extensions, and the
 * `recalculateSlots` trigger. Does NOT create or own a router.
 *
 * The `Providers` context component and the `routes` contributed via
 * `createRoutes()` land in PR-22 (route building and app shell), together with
 * the router-owning `resolve()` entry. This 0.1 surface carries the pieces the
 * registry assembles without a router or a Vue render tree.
 */
export interface ResolvedManifest<
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = NavigationItem,
  TExtensions extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Auto-generated navigation manifest from all modules (plus any
   * plugin-contributed items). Typed by the registry's `TNavItem` generic.
   */
  readonly navigation: NavigationManifest<TNavItem>;

  /** Collected slot contributions from all modules (static base — does not include dynamic). */
  readonly slots: TSlots;

  /** Registered module summaries — use `useModules()` to access in components. */
  readonly modules: readonly ModuleEntry[];

  /**
   * Full module descriptors keyed by id. Required by the journey/composition
   * outlets (PR-31/PR-34) to resolve `entryPoints[name].component`. The plain
   * `modules` array exposes only summary info; this map carries the
   * descriptors themselves.
   */
  readonly moduleDescriptors: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;

  /**
   * Plugin-contributed runtimes keyed by plugin name. Typed via the
   * `TExtensions` generic so well-known keys (e.g. `journeys`, once the Vue
   * journeys plugin lands in PR-30/PR-32) surface with their runtime type.
   * Plugins that aren't loaded do not appear here.
   */
  readonly extensions: TExtensions;

  /**
   * Convenience alias — `manifest.extensions.journeys` surfaced as
   * `manifest.journeys` when the journeys plugin is loaded. `never` when the
   * plugin is absent, so reading it produces a compile error instead of a
   * surprise `undefined`.
   */
  readonly journeys: TExtensions extends { journeys: infer R } ? R : never;

  /**
   * Resolved `onModuleExit` callback — echoed back for shells that host
   * modules themselves and want to forward to the configured handler.
   */
  readonly onModuleExit?: (event: ModuleExitEvent) => void;

  /**
   * Trigger re-evaluation of dynamic slots.
   *
   * Call this after a state change that affects `dynamicSlots` or `slotFilter`
   * results — for example after login, role change, or feature flag update.
   * Components consuming `useSlots()` re-render with the new values.
   *
   * No-op when no module uses `dynamicSlots` and no `slotFilter` is configured.
   */
  readonly recalculateSlots: () => void;
}
