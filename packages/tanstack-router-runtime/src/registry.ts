import { createRouter } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import type { StoreApi } from "zustand";
import type {
  ReactiveModuleDescriptor,
  LazyModuleDescriptor,
  ReactiveService,
  SlotMap,
  SlotMapOf,
} from "@tanstack-react-modules/core";

import type {
  RegistryConfig,
  ApplicationManifest,
  NavigationManifest,
  ModuleEntry,
} from "./types.js";
import { validateNoDuplicateIds, validateDependencies } from "./validation.js";
import { buildNavigationManifest } from "./navigation.js";
import { buildSlotsManifest } from "./slots.js";
import { buildRouteTree, type RouteBuilderOptions } from "./route-builder.js";
import { createAppComponent } from "./app.js";

export interface ReactiveRegistry<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
> {
  /** Register an eager module */
  register(module: ReactiveModuleDescriptor<TSharedDependencies, TSlots>): void;

  /** Register a lazily-loaded module */
  registerLazy(descriptor: LazyModuleDescriptor<TSharedDependencies, TSlots>): void;

  /**
   * Resolve all modules and produce the application manifest.
   * Validates dependencies and builds the route tree.
   */
  resolve(options?: ResolveOptions): ApplicationManifest<TSlots>;
}

export interface ResolveOptions {
  /** Root layout component (renders <Outlet /> for child routes) */
  rootComponent?: () => React.JSX.Element;

  /**
   * Pre-built root route — if provided, used instead of auto-creating one.
   * Use this when you need full control over the root route config
   * (beforeLoad, loader, errorComponent, pendingComponent, etc.).
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
   * Throw a `redirect()` from @tanstack/react-router to redirect.
   * Ignored if rootRoute is provided (configure beforeLoad on your root route instead).
   *
   * For auth guards, use `authenticatedRoute` instead — it creates a layout route
   * boundary that only wraps protected routes.
   */
  beforeLoad?: (ctx: { location: { pathname: string } }) => void | Promise<void>;

  /**
   * Auth boundary — a pathless layout route that guards module routes and
   * the index route. Shell routes (login, error pages) sit outside this
   * boundary and are NOT guarded.
   *
   * Follows TanStack Router's recommended `_authenticated` layout pattern:
   * ```
   * Root (beforeLoad runs for ALL routes — observability, etc.)
   * ├── shellRoutes (public — /login, /signup)
   * └── _authenticated (layout — auth guard)
   *     ├── / (indexComponent)
   *     └── module routes
   * ```
   *
   * @example
   * ```ts
   * registry.resolve({
   *   authenticatedRoute: {
   *     beforeLoad: async () => {
   *       const res = await fetch('/api/auth/session')
   *       if (!res.ok) throw redirect({ to: '/login' })
   *     },
   *     component: ShellLayout,
   *   },
   *   shellRoutes: (root) => [
   *     createRoute({ getParentRoute: () => root, path: '/login', component: LoginPage }),
   *   ],
   * })
   * ```
   */
  authenticatedRoute?: {
    /** Auth guard — throw redirect() to deny access */
    beforeLoad: (ctx: { location: { pathname: string } }) => void | Promise<void>;
    /** Layout component for authenticated pages. Defaults to <Outlet />. */
    component?: () => React.JSX.Element;
  };

  /**
   * Additional routes owned by the shell (login, error pages, onboarding, etc.)
   * that sit alongside module routes at the root level.
   *
   * When `authenticatedRoute` is used, shell routes are NOT guarded — they
   * are siblings of the auth layout, not children. This is the natural place
   * for public pages like /login.
   */
  shellRoutes?: (parentRoute: AnyRoute) => AnyRoute[];

  /**
   * Additional React providers to wrap around the app tree.
   *
   * **Nesting order:** First element is outermost. `[A, B, C]` produces:
   * ```tsx
   * <A>
   *   <B>
   *     <C>
   *       ...app...
   *     </C>
   *   </B>
   * </A>
   * ```
   *
   * Place providers that other providers depend on **first** in the array.
   * For example, if your data-fetching provider reads from a theme context,
   * list the theme provider before the data-fetching provider.
   *
   * @example
   * ```ts
   * providers: [SWRConfigProvider, ThemeProvider, TooltipProvider]
   * // Produces: <SWRConfigProvider><ThemeProvider><TooltipProvider>...app...</TooltipProvider></ThemeProvider></SWRConfigProvider>
   * ```
   */
  providers?: React.ComponentType<{ children: React.ReactNode }>[];
}

export function createRegistry<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
>(
  config: RegistryConfig<TSharedDependencies, TSlots>,
): ReactiveRegistry<TSharedDependencies, TSlots> {
  const modules: ReactiveModuleDescriptor<TSharedDependencies, TSlots>[] = [];
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
          "[@tanstack-react-modules/runtime] Cannot register modules after resolve() has been called.",
        );
      }
      modules.push(module);
    },

    registerLazy(descriptor) {
      if (resolved) {
        throw new Error(
          "[@tanstack-react-modules/runtime] Cannot register modules after resolve() has been called.",
        );
      }
      lazyModules.push(descriptor);
    },

    resolve(options?: ResolveOptions) {
      if (resolved) {
        throw new Error("[@tanstack-react-modules/runtime] resolve() can only be called once.");
      }
      resolved = true;

      // Validate (cast is safe — these functions only read structural properties)
      const mods = modules as ReactiveModuleDescriptor[];
      const lazyMods = lazyModules as LazyModuleDescriptor[];
      validateNoDuplicateIds(mods, lazyMods);
      validateDependencies(mods, availableKeys);

      // Run onRegister lifecycle hooks
      const deps = buildDepsObject<TSharedDependencies>(config);
      for (const mod of modules) {
        mod.lifecycle?.onRegister?.(deps);
      }

      // Build route tree
      const routeBuilderOptions: RouteBuilderOptions = {
        rootRoute: options?.rootRoute,
        rootComponent: options?.rootComponent,
        indexComponent: options?.indexComponent,
        notFoundComponent: options?.notFoundComponent,
        beforeLoad: options?.beforeLoad,
        authenticatedRoute: options?.authenticatedRoute,
        shellRoutes: options?.shellRoutes,
      };
      const routeTree = buildRouteTree(mods, lazyMods, routeBuilderOptions);

      // Create TanStack Router instance
      const router = createRouter({
        routeTree,
        defaultPreload: "intent",
      });

      // Build navigation, slots, and module entries
      const navigation: NavigationManifest = buildNavigationManifest(mods);
      const slots = buildSlotsManifest<TSlots>(modules, config.slots);
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
      });

      return { App, router, navigation, slots, modules: moduleEntries };
    },
  };
}

function buildDepsObject<TSharedDependencies extends Record<string, any>>(
  config: RegistryConfig<TSharedDependencies, any>,
): TSharedDependencies {
  const deps: Record<string, unknown> = {};

  // For stores, get current state as the deps value
  // (lifecycle hooks get a snapshot, components use useStore for reactivity)
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
  // For reactive services, get current snapshot
  if (config.reactiveServices) {
    for (const [key, rs] of Object.entries(config.reactiveServices)) {
      if (rs) {
        deps[key] = (rs as ReactiveService<unknown>).getSnapshot();
      }
    }
  }

  return deps as TSharedDependencies;
}
