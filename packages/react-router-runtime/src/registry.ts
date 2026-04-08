import { createBrowserRouter, createMemoryRouter } from "react-router";
import type { RouteObject } from "react-router";
import type { StoreApi } from "zustand";
import type {
  ModuleDescriptor,
  LazyModuleDescriptor,
  ReactiveService,
  SlotMap,
  SlotMapOf,
} from "@react-router-modules/core";
import {
  buildNavigationManifest,
  buildSlotsManifest,
  collectDynamicSlotFactories,
  validateNoDuplicateIds,
  validateDependencies,
} from "@modular-react/core";
import type { DynamicSlotFactory, SlotFilter, NavigationManifest, ModuleEntry } from "@modular-react/core";
import { createSlotsSignal } from "@modular-react/react";

import type {
  RegistryConfig,
  ApplicationManifest,
} from "./types.js";
import { buildRouteTree, type RouteBuilderOptions } from "./route-builder.js";
import { createAppComponent } from "./app.js";

export interface ModuleRegistry<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
> {
  /** Register an eager module */
  register(module: ModuleDescriptor<TSharedDependencies, TSlots>): void;

  /** Register a lazily-loaded module */
  registerLazy(descriptor: LazyModuleDescriptor<TSharedDependencies, TSlots>): void;

  /**
   * Resolve all modules and produce the application manifest.
   * Validates dependencies and builds the route tree.
   */
  resolve(options?: ResolveOptions<TSharedDependencies, TSlots>): ApplicationManifest<TSlots>;
}

export interface ResolveOptions<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
> {
  /** Root layout component (renders <Outlet /> for child routes) */
  rootComponent?: () => React.JSX.Element;

  /**
   * Pre-built root route — if provided, used instead of auto-creating one.
   * Mutually exclusive with rootComponent/notFoundComponent/loader.
   */
  rootRoute?: RouteObject;

  /** Component for the index route (/) */
  indexComponent?: () => React.JSX.Element;

  /** Component for 404 / not-found */
  notFoundComponent?: () => React.JSX.Element;

  /**
   * Called before every route loads — for observability, analytics, feature flags.
   * Runs for ALL routes including public ones like /login.
   * Ignored if rootRoute is provided.
   */
  loader?: (args: { request: Request; params: Record<string, string | undefined> }) => any;

  /**
   * Auth boundary — a pathless layout route that guards module routes and
   * the index route. Shell routes sit outside this boundary.
   */
  authenticatedRoute?: {
    /** Auth guard — throw redirect() to deny access */
    loader: (args: { request: Request; params: Record<string, string | undefined> }) => any;
    /** Layout component for authenticated pages. Defaults to <Outlet />. */
    Component?: () => React.JSX.Element;
  };

  /** Additional routes owned by the shell (login, error pages, etc.) */
  shellRoutes?: () => RouteObject[];

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

export function createRegistry<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
>(
  config: RegistryConfig<TSharedDependencies, TSlots>,
): ModuleRegistry<TSharedDependencies, TSlots> {
  const modules: ModuleDescriptor<TSharedDependencies, TSlots>[] = [];
  const lazyModules: LazyModuleDescriptor<TSharedDependencies, TSlots>[] = [];
  let resolved = false;

  // Collect all available dependency keys from all three buckets
  const availableKeys = new Set<string>([
    ...Object.keys(config.stores ?? {}),
    ...Object.keys(config.services ?? {}),
    ...Object.keys(config.reactiveServices ?? {}),
  ]);

  return {
    register(module) {
      if (resolved) {
        throw new Error(
          "[@react-router-modules/runtime] Cannot register modules after resolve() has been called.",
        );
      }
      modules.push(module);
    },

    registerLazy(descriptor) {
      if (resolved) {
        throw new Error(
          "[@react-router-modules/runtime] Cannot register modules after resolve() has been called.",
        );
      }
      lazyModules.push(descriptor);
    },

    resolve(options?: ResolveOptions<TSharedDependencies, TSlots>) {
      if (resolved) {
        throw new Error("[@react-router-modules/runtime] resolve() can only be called once.");
      }
      resolved = true;

      // Validate — cast is safe since validation only reads structural properties (id, requires)
      validateNoDuplicateIds(
        modules as ModuleDescriptor[],
        lazyModules as LazyModuleDescriptor[],
      );
      validateDependencies(modules as ModuleDescriptor[], availableKeys);

      // Run onRegister lifecycle hooks
      const deps = buildDepsObject<TSharedDependencies>(config);
      for (const mod of modules) {
        try {
          mod.lifecycle?.onRegister?.(deps);
        } catch (err) {
          throw new Error(
            `[@react-router-modules/runtime] Module "${mod.id}" lifecycle.onRegister() failed: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err },
          );
        }
      }

      // Build route tree
      const routeBuilderOptions: RouteBuilderOptions = {
        rootRoute: options?.rootRoute,
        rootComponent: options?.rootComponent,
        indexComponent: options?.indexComponent,
        notFoundComponent: options?.notFoundComponent,
        loader: options?.loader,
        authenticatedRoute: options?.authenticatedRoute,
        shellRoutes: options?.shellRoutes,
      };
      const routes = buildRouteTree(
        modules as ModuleDescriptor[],
        lazyModules as LazyModuleDescriptor[],
        routeBuilderOptions,
      );

      // Create React Router instance (use memory router when DOM is unavailable, e.g. tests)
      const router =
        typeof document !== "undefined" ? createBrowserRouter(routes) : createMemoryRouter(routes);

      // Build navigation, slots, and module entries
      const navigation: NavigationManifest = buildNavigationManifest(
        modules as ModuleDescriptor[],
      );
      const slots = buildSlotsManifest<TSlots>(modules, config.slots);
      const dynamicSlotFactories = collectDynamicSlotFactories(
        modules as ModuleDescriptor[],
      );
      const slotFilter = options?.slotFilter as SlotFilter | undefined;
      const moduleEntries: ModuleEntry[] = modules.map((mod) => ({
        id: mod.id,
        version: mod.version,
        meta: mod.meta,
        component: mod.component,
        zones: mod.zones,
      }));

      // Build stores, services, and reactive services maps for the context
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

      // Create signal for imperative recalculation of dynamic slots
      const slotsSignal = createSlotsSignal();
      const hasDynamicSlots = dynamicSlotFactories.length > 0 || slotFilter != null;
      const recalculateSlots = hasDynamicSlots ? () => slotsSignal.notify() : () => {};

      // Create App component
      const App = createAppComponent({
        router,
        stores,
        services,
        reactiveServices,
        navigation,
        slots,
        modules: moduleEntries,
        providers: options?.providers,
        dynamicSlotFactories,
        slotFilter,
        slotsSignal,
        recalculateSlots,
      });

      return { App, router, navigation, slots, modules: moduleEntries, recalculateSlots };
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
