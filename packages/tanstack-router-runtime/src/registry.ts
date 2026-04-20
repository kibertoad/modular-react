import { createRouter } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import type { StoreApi } from "zustand";
import type {
  ModuleDescriptor,
  LazyModuleDescriptor,
  ReactiveService,
  SlotMap,
  SlotMapOf,
} from "@tanstack-react-modules/core";
import {
  buildNavigationManifest,
  buildSlotsManifest,
  collectDynamicSlotFactories,
  validateNoDuplicateIds,
  validateDependencies,
} from "@modular-react/core";
import type {
  NavigationItem,
  NavigationItemBase,
  SlotFilter,
  NavigationManifest,
  ModuleEntry,
} from "@modular-react/core";
import { createSlotsSignal } from "@modular-react/react";
import type { SlotsSignal } from "@modular-react/react";

import type {
  RegistryConfig,
  ApplicationManifest,
  ResolvedManifest,
  ResolveManifestOptions,
} from "./types.js";
import { buildRouteTree, type RouteBuilderOptions } from "./route-builder.js";
import { createAppComponent } from "./app.js";
import { createProvidersComponent } from "./providers.js";

export interface ModuleRegistry<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = NavigationItem,
> {
  /**
   * Register an eager module. The module's `TNavItem` must match the
   * registry's — pass the same alias (e.g. `AppNavItem`) on both sides so
   * typed i18n labels, typed dynamic-href context, and typed `meta` are
   * enforced end-to-end.
   */
  register(module: ModuleDescriptor<TSharedDependencies, TSlots, any, TNavItem>): void;

  /**
   * Register a lazily-loaded module. The loaded descriptor's `component` is
   * rendered at `basePath/$` via TanStack's `lazyRouteComponent` — every
   * other field (including `createRoutes`) is ignored because TanStack's
   * route tree is frozen at `createRouter` time. See
   * {@link LazyModuleDescriptor} for the full field list and rationale.
   *
   * Not supported in framework mode (`resolveManifest()`) — the host owns
   * route composition, so there's no parent for the catch-all. Register
   * eagerly instead, with `lazyRouteComponent()` inside the module's own
   * `createRoutes` for component-level code splitting.
   */
  registerLazy(descriptor: LazyModuleDescriptor<TSharedDependencies, TSlots, any, TNavItem>): void;

  /**
   * Resolve all modules and produce the application manifest, including a
   * `<RouterProvider />`-wrapped `App` component and a ready-to-use
   * TanStack `Router`. Single-use — throws on a second call.
   *
   * Use this in apps where the library owns routing. If your host owns
   * routing (TanStack Router file-based mode with `@tanstack/router-plugin`,
   * TanStack Start, etc.), use {@link ModuleRegistry.resolveManifest} instead.
   */
  resolve(
    options?: ResolveOptions<TSharedDependencies, TSlots>,
  ): ApplicationManifest<TSlots, TNavItem>;

  /**
   * Resolve all modules for framework-mode integrations. Returns the
   * navigation manifest, resolved slots, module entries, and a `Providers`
   * component that wraps the full context stack. Does NOT create or own a
   * router.
   *
   * Idempotent — may be called multiple times (e.g. from a shared registry
   * module imported by `__root.tsx` and elsewhere). The first call does all
   * work and caches the result; later calls return the cached manifest.
   * Options are honored only on the first call; passing options on a
   * subsequent call throws, so misconfiguration is loud instead of silently
   * ignored.
   *
   * May not be mixed with `resolve()` — the registry commits to one
   * router-ownership mode on first call.
   */
  resolveManifest(
    options?: ResolveManifestOptions<TSharedDependencies, TSlots>,
  ): ResolvedManifest<TSlots, TNavItem>;
}

export interface ResolveOptions<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
> {
  /** Root layout component (renders <Outlet /> for child routes) */
  rootComponent?: () => React.JSX.Element;

  /**
   * Pre-built root route — if provided, used instead of auto-creating one.
   * Mutually exclusive with rootComponent/notFoundComponent/beforeLoad.
   */
  rootRoute?: AnyRoute;

  /** Component for the index route (/) */
  indexComponent?: () => React.JSX.Element;

  /** Component for 404 / not-found */
  notFoundComponent?: () => React.JSX.Element;

  /**
   * Called before every route loads — for observability, analytics, feature flags.
   * Runs for ALL routes including public ones like /login.
   * Ignored if rootRoute is provided.
   */
  beforeLoad?: (ctx: { location: { pathname: string } }) => void | Promise<void>;

  /**
   * Auth boundary — a pathless layout route that guards module routes and
   * the index route. Shell routes sit outside this boundary.
   */
  authenticatedRoute?: {
    /** Auth guard — throw redirect() to deny access */
    beforeLoad: (ctx: { location: { pathname: string } }) => void | Promise<void>;
    /** Layout component for authenticated pages. Defaults to <Outlet />. */
    component?: () => React.JSX.Element;
  };

  /** Additional routes owned by the shell (login, error pages, etc.) */
  shellRoutes?: (parentRoute: AnyRoute) => AnyRoute[];

  /**
   * Additional React providers to wrap around the app tree.
   * First element is outermost.
   */
  providers?: React.ComponentType<{ children: React.ReactNode }>[];

  /**
   * Global filter applied to the fully resolved slot manifest (static + dynamic)
   * on every `recalculateSlots()` call.
   */
  slotFilter?: (slots: TSlots, deps: TSharedDependencies) => TSlots;
}

/**
 * Internal — everything `resolve()` / `resolveManifest()` need that doesn't
 * depend on whether a router is created. Computed once, cached, and shared
 * across both entry points so that calling `resolveManifest()` from multiple
 * sites (e.g. a shared registry module imported by `__root.tsx` and
 * elsewhere) yields the same provider stack.
 */
interface CommonAssembly<
  TSlots extends SlotMapOf<TSlots>,
  TNavItem extends NavigationItemBase = NavigationItem,
> {
  modules: readonly ModuleEntry[];
  navigation: NavigationManifest<TNavItem>;
  slots: TSlots;
  stores: Record<string, StoreApi<unknown>>;
  services: Record<string, unknown>;
  reactiveServices: Record<string, ReactiveService<unknown>>;
  dynamicSlotFactories: ReturnType<typeof collectDynamicSlotFactories>;
  slotsSignal: SlotsSignal;
  recalculateSlots: () => void;
  slotFilter: SlotFilter | undefined;
  providers: React.ComponentType<{ children: React.ReactNode }>[] | undefined;
}

export function createRegistry<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = NavigationItem,
>(
  config: RegistryConfig<TSharedDependencies, TSlots>,
): ModuleRegistry<TSharedDependencies, TSlots, TNavItem> {
  const modules: ModuleDescriptor<TSharedDependencies, TSlots, any, TNavItem>[] = [];
  const lazyModules: LazyModuleDescriptor<TSharedDependencies, TSlots, any, TNavItem>[] = [];

  // A registry commits to one mode on first call:
  //   - "resolve"          → library owns the router; single-use
  //   - "resolveManifest"  → host owns the router; idempotent
  //   - null               → neither has been called yet
  type Mode = "resolve" | "resolveManifest";
  let mode: Mode | null = null;
  let registrationLocked = false;

  // Cached manifest — populated on the first resolveManifest() call so later
  // calls from a second site return the same Providers/navigation/etc.
  let cachedManifest: ResolvedManifest<TSlots, TNavItem> | null = null;

  // Options captured from the first resolveManifest() invocation, honored by
  // every subsequent call (including retries after a failed buildAssembly).
  // We commit to "there has been a first call" *before* anything that can
  // throw — otherwise a first call that throws in buildAssembly would leave
  // `cachedManifest` null and let a retry slip different options past the
  // "options may only be passed on the first call" guard.
  let firstCallCompleted = false;
  let capturedOptions: ResolveManifestOptions<TSharedDependencies, TSlots> | undefined = undefined;

  // onRegister must run at most once per module for the lifetime of the
  // registry — modules commonly use it to subscribe to stores or register
  // side-effects against a framework singleton, and double-firing would
  // double-register those. We track this independently of cachedManifest
  // because cachedManifest is only populated on *successful* manifest build:
  // if buildAssembly throws after onRegister ran, a retry of
  // resolveManifest() would otherwise walk the hooks a second time.
  let onRegisterRan = false;

  const availableKeys = new Set<string>([
    ...Object.keys(config.stores ?? {}),
    ...Object.keys(config.services ?? {}),
    ...Object.keys(config.reactiveServices ?? {}),
  ]);

  function assertCanRegister() {
    if (registrationLocked) {
      throw new Error(
        "[@tanstack-react-modules/runtime] Cannot register modules after resolve() or resolveManifest() has been called.",
      );
    }
  }

  function buildAssembly(options: {
    providers?: React.ComponentType<{ children: React.ReactNode }>[];
    slotFilter?: (slots: TSlots, deps: TSharedDependencies) => TSlots;
  }): CommonAssembly<TSlots, TNavItem> {
    validateNoDuplicateIds(modules as ModuleDescriptor[], lazyModules as LazyModuleDescriptor[]);
    validateDependencies(modules as ModuleDescriptor[], availableKeys);

    if (!onRegisterRan) {
      const deps = buildDepsObject<TSharedDependencies>(config);
      for (const mod of modules) {
        try {
          mod.lifecycle?.onRegister?.(deps);
        } catch (err) {
          // Flip the flag before throwing so a retry doesn't re-walk hooks
          // that may have already run for earlier modules before this one
          // threw. A half-registered state is still better than a
          // double-registered one.
          onRegisterRan = true;
          throw new Error(
            `[@tanstack-react-modules/runtime] Module "${mod.id}" lifecycle.onRegister() failed: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err },
          );
        }
      }
      onRegisterRan = true;
    }

    const navigation = buildNavigationManifest<TNavItem>(modules);
    const slots = buildSlotsManifest<TSlots>(modules, config.slots);
    const dynamicSlotFactories = collectDynamicSlotFactories(modules as ModuleDescriptor[]);
    const slotFilter = options.slotFilter as SlotFilter | undefined;

    const stores: Record<string, StoreApi<unknown>> = {};
    const services: Record<string, unknown> = {};
    const reactiveServices: Record<string, ReactiveService<unknown>> = {};

    if (config.stores) {
      for (const [key, store] of Object.entries(config.stores)) {
        if (store) stores[key] = store as StoreApi<unknown>;
      }
    }
    if (config.services) {
      for (const [key, service] of Object.entries(config.services)) {
        if (service !== undefined) services[key] = service;
      }
    }
    if (config.reactiveServices) {
      for (const [key, rs] of Object.entries(config.reactiveServices)) {
        if (rs) reactiveServices[key] = rs as ReactiveService<unknown>;
      }
    }

    const slotsSignal = createSlotsSignal();
    const hasDynamicSlots = dynamicSlotFactories.length > 0 || slotFilter != null;
    const recalculateSlots = hasDynamicSlots ? () => slotsSignal.notify() : () => {};

    return {
      modules: modules.map((mod) => ({
        id: mod.id,
        version: mod.version,
        meta: mod.meta,
        component: mod.component,
        zones: mod.zones,
      })),
      navigation,
      slots,
      stores,
      services,
      reactiveServices,
      dynamicSlotFactories,
      slotsSignal,
      recalculateSlots,
      slotFilter,
      providers: options.providers,
    };
  }

  return {
    register(module) {
      assertCanRegister();
      modules.push(module);
    },

    registerLazy(descriptor) {
      assertCanRegister();
      lazyModules.push(descriptor);
    },

    resolve(
      options?: ResolveOptions<TSharedDependencies, TSlots>,
    ): ApplicationManifest<TSlots, TNavItem> {
      if (mode === "resolveManifest") {
        throw new Error(
          "[@tanstack-react-modules/runtime] resolve() cannot be called after resolveManifest() — the registry is already in framework-mode.",
        );
      }
      if (mode === "resolve") {
        throw new Error("[@tanstack-react-modules/runtime] resolve() can only be called once.");
      }
      mode = "resolve";
      registrationLocked = true;

      const assembly = buildAssembly({
        providers: options?.providers,
        slotFilter: options?.slotFilter,
      });

      const routeBuilderOptions: RouteBuilderOptions = {
        rootRoute: options?.rootRoute,
        rootComponent: options?.rootComponent,
        indexComponent: options?.indexComponent,
        notFoundComponent: options?.notFoundComponent,
        beforeLoad: options?.beforeLoad,
        authenticatedRoute: options?.authenticatedRoute,
        shellRoutes: options?.shellRoutes,
      };
      const routeTree = buildRouteTree(
        modules as ModuleDescriptor[],
        lazyModules as LazyModuleDescriptor[],
        routeBuilderOptions,
      );

      const router = createRouter({
        routeTree,
        defaultPreload: "intent",
      });

      const App = createAppComponent({
        router,
        stores: assembly.stores,
        services: assembly.services,
        reactiveServices: assembly.reactiveServices,
        navigation: assembly.navigation,
        slots: assembly.slots as object,
        modules: assembly.modules,
        providers: assembly.providers,
        dynamicSlotFactories: assembly.dynamicSlotFactories,
        slotFilter: assembly.slotFilter,
        slotsSignal: assembly.slotsSignal,
        recalculateSlots: assembly.recalculateSlots,
      });

      return {
        App,
        router,
        navigation: assembly.navigation,
        slots: assembly.slots,
        modules: assembly.modules,
        recalculateSlots: assembly.recalculateSlots,
      };
    },

    resolveManifest(
      options?: ResolveManifestOptions<TSharedDependencies, TSlots>,
    ): ResolvedManifest<TSlots, TNavItem> {
      if (mode === "resolve") {
        throw new Error(
          "[@tanstack-react-modules/runtime] resolveManifest() cannot be called after resolve() — the registry already owns a router.",
        );
      }

      if (firstCallCompleted) {
        // Idempotent: first call captured options; later calls must pass none.
        // Enforced here (rather than gated on `cachedManifest`) so that a
        // retry after a failed first call can't slip different options past
        // the guard — the captured options win either way.
        if (options !== undefined) {
          throw new Error(
            "[@tanstack-react-modules/runtime] resolveManifest() has already been called — options may only be passed on the first call. Extract the manifest into a shared module and import it from both sites.",
          );
        }
        if (cachedManifest) return cachedManifest;
        // Fall through: first call threw before producing a manifest; retry
        // using the captured options.
      } else {
        capturedOptions = options;
        firstCallCompleted = true;
      }

      // `registerLazy()` contributes a whole module descriptor under a
      // runtime-loaded catch-all parent — it's a library-level mechanism for
      // plugin-host apps where the route *structure* isn't known until
      // runtime. In framework mode the host owns route composition, so
      // there's nowhere to attach such a catch-all. Silently accepting
      // lazy-module registrations would produce a working-looking manifest
      // missing every lazy-module route — throw instead.
      //
      // Note: this does NOT disable lazy *code-splitting*. Use TanStack
      // Router's built-in primitives (`lazyRouteComponent(() =>
      // import(...))` inside a regular module's `createRoutes`, or
      // file-based `.lazy.tsx` / `createLazyFileRoute`) to code-split
      // routes in framework mode. Those work independently of the module
      // system.
      if (lazyModules.length > 0) {
        throw new Error(
          `[@tanstack-react-modules/runtime] resolveManifest() does not support registerLazy() — the host owns route composition in framework mode, so there is no parent route to attach a lazy catch-all to. Register the module(s) eagerly with register() (use lazyRouteComponent() or .lazy.tsx inside the module's route files for code-splitting), or use resolve() if you need runtime-loaded route structure. Lazy modules registered: ${lazyModules.map((m) => m.id).join(", ")}.`,
        );
      }

      mode = "resolveManifest";
      registrationLocked = true;

      const assembly = buildAssembly({
        providers: capturedOptions?.providers,
        slotFilter: capturedOptions?.slotFilter,
      });
      const Providers = createProvidersComponent({
        stores: assembly.stores,
        services: assembly.services,
        reactiveServices: assembly.reactiveServices,
        navigation: assembly.navigation,
        slots: assembly.slots as object,
        modules: assembly.modules,
        providers: assembly.providers,
        dynamicSlotFactories: assembly.dynamicSlotFactories,
        slotFilter: assembly.slotFilter,
        slotsSignal: assembly.slotsSignal,
        recalculateSlots: assembly.recalculateSlots,
      });

      cachedManifest = {
        Providers,
        navigation: assembly.navigation,
        slots: assembly.slots,
        modules: assembly.modules,
        recalculateSlots: assembly.recalculateSlots,
      };

      return cachedManifest;
    },
  };
}

function buildDepsObject<TSharedDependencies extends Record<string, any>>(
  config: RegistryConfig<TSharedDependencies, any>,
): TSharedDependencies {
  const deps: Record<string, unknown> = {};

  if (config.stores) {
    for (const [key, store] of Object.entries(config.stores)) {
      if (store) {
        deps[key] = (store as StoreApi<unknown>).getState();
      }
    }
  }
  if (config.services) {
    for (const [key, service] of Object.entries(config.services)) {
      if (service !== undefined) deps[key] = service;
    }
  }
  if (config.reactiveServices) {
    for (const [key, rs] of Object.entries(config.reactiveServices)) {
      if (rs) {
        deps[key] = (rs as ReactiveService<unknown>).getSnapshot();
      }
    }
  }

  return deps as TSharedDependencies;
}
