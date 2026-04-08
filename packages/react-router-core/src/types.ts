import type { RouteObject } from "react-router";

/**
 * A reactive external source that components can subscribe to.
 * Matches React's useSyncExternalStore API — the standard way to
 * subscribe to external state that isn't a React/zustand store.
 *
 * Use for integrations you observe but don't control: call adapters,
 * presence systems, websocket connections, push notifications.
 *
 * @example
 * ```ts
 * const callReactiveService: ReactiveService<CallSnapshot> = {
 *   subscribe: (cb) => callAdapter.onCallEvent(cb),
 *   getSnapshot: () => ({
 *     state: callAdapter.getCallState(),
 *     caller: callAdapter.getCallerInfo(),
 *   }),
 * }
 * ```
 */
export interface ReactiveService<T> {
  /** Subscribe to changes. Returns unsubscribe function. */
  subscribe: (callback: () => void) => () => void;
  /** Get current snapshot. Must return a stable reference when state hasn't changed. */
  getSnapshot: () => T;
}

/**
 * Default type for slot definitions when no explicit type is provided.
 * Every slot value must be a readonly array — modules contribute items
 * and the registry concatenates them across all registered modules.
 *
 * When defining your own slot types, use a plain interface:
 * ```ts
 * interface AppSlots {
 *   commands: CommandDefinition[]
 *   systems: SystemRegistration[]
 * }
 * ```
 * The generic constraint accepts interfaces directly — no index signature needed.
 * Non-array values (e.g. `commands: string`) produce a compile error.
 */
export type SlotMap = Record<string, readonly unknown[]>;

/**
 * F-bounded constraint that enforces every value in T is a readonly array,
 * without requiring an index signature. Use this as a generic bound:
 *
 * ```ts
 * function foo<T extends SlotMapOf<T>>() {}
 * ```
 *
 * This accepts `interface AppSlots { commands: Cmd[] }` (no index signature)
 * while rejecting `interface Bad { commands: string }` (not an array).
 */
export type SlotMapOf<T> = { [K in keyof T]: readonly unknown[] };

/**
 * Constraint type for zone definitions.
 * Zone values are React component types — the active route declares which
 * components should render in named layout regions of the shell.
 *
 * Unlike SlotMap (arrays concatenated across all modules), ZoneMap values are
 * single components contributed by the currently matched route via React
 * Router's `handle`.
 */
export type ZoneMap = Record<string, React.ComponentType<any> | undefined>;

/**
 * F-bounded constraint that accepts interfaces without index signatures.
 * Use this as a generic bound for useZones<T>:
 *
 * ```ts
 * function useZones<T extends ZoneMapOf<T>>(): Partial<T> {}
 * ```
 *
 * This accepts `interface AppZones { contextualPanel?: ComponentType }` directly.
 */
export type ZoneMapOf<T> = { [K in keyof T]: React.ComponentType<any> | undefined };

/**
 * Describes a reactive module — a self-contained piece of UI that declares
 * its routes, navigation items, slot contributions, shared dependency requirements,
 * and lifecycle hooks.
 *
 * TSharedDependencies is the contract type defined by the host app (e.g. AppDependencies).
 * TSlots is the slot map type defined by the host app (e.g. AppSlots).
 *
 * createRoutes is optional — modules without routes are "headless" and
 * contribute only via slots, navigation, and lifecycle hooks.
 */
export interface ReactiveModuleDescriptor<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
> {
  /** Unique module identifier, e.g. "billing", "user-profile" */
  readonly id: string;

  /** SemVer version string */
  readonly version: string;

  /**
   * Returns the module's route subtree as React Router RouteObject(s).
   *
   * Optional — omit for "headless" modules that contribute only
   * via slots, navigation, and lifecycle hooks without owning routes.
   */
  readonly createRoutes?: () => RouteObject | RouteObject[];

  /** Navigation items this module contributes to the app shell */
  readonly navigation?: readonly NavigationItem[];

  /**
   * Typed slot contributions this module provides to the shell.
   * Each key maps to an array of items that get concatenated with
   * contributions from other modules at resolve() time.
   */
  readonly slots?: { readonly [K in keyof TSlots]?: TSlots[K] };

  /**
   * Dynamic slot contributions evaluated when `recalculateSlots()` is called.
   * Receives the current shared dependencies snapshot and returns
   * conditional slot entries that are concatenated with static `slots`.
   *
   * Use this for slot contributions that depend on runtime state like
   * user role, permissions, or feature flags. Call `recalculateSlots()`
   * (returned from `registry.resolve()`) after the relevant state changes.
   *
   * @example
   * ```ts
   * dynamicSlots: (deps) => ({
   *   navItems: deps.auth.user?.isAdmin
   *     ? [{ label: "Admin", to: "/admin" }]
   *     : [],
   * })
   * ```
   */
  readonly dynamicSlots?: (deps: TSharedDependencies) => {
    readonly [K in keyof TSlots]?: TSlots[K];
  };

  /**
   * A React component the shell can render outside of routes — in a tab,
   * modal, panel, or any other container. Use this for workspace-style apps
   * where modules are rendered by the shell rather than by the router.
   *
   * Route-based modules use createRoutes instead (or both).
   */
  readonly component?: React.ComponentType<any>;

  /**
   * Zone components this module contributes to the shell when it is active.
   * Used by workspace-style apps where the active module is a tab rather than
   * a route — the shell reads zones from the active module's descriptor via
   * `useActiveZones(activeModuleId)`.
   *
   * Keys match the app's zone names (e.g. "contextualPanel", "headerActions").
   * Values are React components rendered by the shell in the corresponding
   * layout region.
   *
   * Route-based modules use `handle` on their routes instead.
   */
  readonly zones?: Readonly<Record<string, React.ComponentType<any>>>;

  /**
   * Catalog metadata — descriptive information the shell uses for discovery
   * UIs like directory pages, search, and command palettes.
   *
   * The framework collects meta from all modules and exposes it via useModules().
   * Values are opaque to the framework — the shell defines what keys matter.
   *
   * Use the TMeta generic on defineModule to get compile-time validation:
   * ```ts
   * interface JourneyMeta { name: string; category: string; icon: string }
   * defineModule<AppDeps, AppSlots, JourneyMeta>({ meta: { name: '...', ... } })
   * ```
   */
  readonly meta?: Readonly<TMeta>;

  /** Keys from TSharedDependencies that this module needs. Throws at resolve() if missing. */
  readonly requires?: readonly (keyof TSharedDependencies)[];

  /**
   * Keys from TSharedDependencies that this module can use but doesn't strictly need.
   * Logs a warning at resolve() if missing, but does not throw.
   * Access optional deps via useOptional() which returns null if not registered.
   */
  readonly optionalRequires?: readonly (keyof TSharedDependencies)[];

  /** Lifecycle hooks */
  readonly lifecycle?: ModuleLifecycle<TSharedDependencies>;
}

export interface NavigationItem {
  /** Display label */
  readonly label: string;

  /** Route path to navigate to */
  readonly to: string;

  /** Icon — either a string identifier or a React component */
  readonly icon?: string | React.ComponentType<{ className?: string }>;

  /** Grouping key for organizing nav items (e.g. "finance", "admin") */
  readonly group?: string;

  /** Sort order within group (lower = higher priority) */
  readonly order?: number;

  /** If true, item is registered but hidden from default nav rendering */
  readonly hidden?: boolean;
}

export interface ModuleLifecycle<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
> {
  /** Called once when the module is registered in the registry */
  onRegister?(deps: TSharedDependencies): void | Promise<void>;

  /** Called when the module's route subtree is first mounted */
  onMount?(deps: TSharedDependencies): void | Promise<void>;

  /** Called when the module's route subtree is unmounted */
  onUnmount?(): void | Promise<void>;
}

/**
 * Descriptor for a lazily-loaded module.
 * The full module descriptor is loaded on demand when the route is first visited.
 */
export interface LazyModuleDescriptor<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
> {
  /** Unique module identifier */
  readonly id: string;

  /** Base path prefix — used to create a catch-all route that triggers loading */
  readonly basePath: string;

  /** Dynamic import that returns the full module descriptor */
  readonly load: () => Promise<{
    default: ReactiveModuleDescriptor<TSharedDependencies, TSlots, TMeta>;
  }>;
}
