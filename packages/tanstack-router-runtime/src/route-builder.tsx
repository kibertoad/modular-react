import { createRootRoute, createRoute, Outlet } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import type { ModuleDescriptor, LazyModuleDescriptor } from "@tanstack-react-modules/core";
import { warnIgnoredLazyFields } from "@modular-react/core";

export interface RouteBuilderOptions {
  /**
   * Pre-built root route. If provided, rootComponent/notFoundComponent/beforeLoad
   * are ignored — configure them directly on this route instead.
   */
  rootRoute?: AnyRoute;
  /** Component for the root layout (renders <Outlet /> for child routes) */
  rootComponent?: () => React.JSX.Element;
  /** Component for the index route (/) */
  indexComponent?: () => React.JSX.Element;
  /** Component for the 404 / not-found route */
  notFoundComponent?: () => React.JSX.Element;
  /**
   * Called before every route loads — for observability, feature flags, etc.
   * Runs for ALL routes including public ones.
   * Ignored if rootRoute is provided.
   */
  beforeLoad?: (ctx: { location: { pathname: string } }) => void | Promise<void>;
  /**
   * Auth boundary — a pathless layout route that wraps module routes and
   * the index route. Shell routes (login, error pages) sit outside this
   * boundary and are NOT guarded.
   *
   * Follows TanStack Router's recommended `_authenticated` layout pattern.
   *
   * When provided, the route tree becomes:
   * ```
   * Root (beforeLoad runs for ALL routes)
   * ├── shellRoutes (public — /login, /signup, etc.)
   * └── _authenticated (layout — beforeLoad guards children)
   *     ├── / (indexComponent)
   *     └── module routes
   * ```
   *
   * When omitted, all routes are direct children of root (no auth boundary).
   */
  authenticatedRoute?: {
    /** Auth guard — throw redirect() to deny access */
    beforeLoad: (ctx: { location: { pathname: string } }) => void | Promise<void>;
    /** Layout component for authenticated pages. Defaults to <Outlet />. */
    component?: () => React.JSX.Element;
  };
  /** Additional routes owned by the shell (login, error pages, etc.) */
  shellRoutes?: (parentRoute: AnyRoute) => AnyRoute[];
}

/**
 * Composes all module route subtrees into a single TanStack Router route tree.
 * Modules without createRoutes are skipped (headless modules).
 */
export function buildRouteTree(
  modules: ModuleDescriptor[],
  lazyModules: LazyModuleDescriptor[],
  options?: RouteBuilderOptions,
): AnyRoute {
  // Use provided root route or create one from options
  const rootRoute =
    options?.rootRoute ??
    createRootRoute({
      component: options?.rootComponent,
      notFoundComponent: options?.notFoundComponent,
      beforeLoad: options?.beforeLoad,
    });

  const rootChildren: AnyRoute[] = [];

  // Shell-owned routes (login, error pages) — always direct children of root
  if (options?.shellRoutes) {
    rootChildren.push(...options.shellRoutes(rootRoute));
  }

  // Determine parent for protected routes (index + modules)
  const protectedParent = options?.authenticatedRoute
    ? createAuthenticatedLayoutRoute(rootRoute, options.authenticatedRoute)
    : rootRoute;

  const protectedChildren: AnyRoute[] = [];

  // Add index route if provided
  if (options?.indexComponent) {
    protectedChildren.push(
      createRoute({
        getParentRoute: () => protectedParent,
        path: "/",
        component: options.indexComponent,
      }),
    );
  }

  // Eager modules: call createRoutes with protectedParent as parent
  for (const mod of modules) {
    if (!mod.createRoutes) continue;
    const route = mod.createRoutes(protectedParent);
    if (!route) {
      throw new Error(
        `[@tanstack-react-modules/runtime] Module "${mod.id}" createRoutes() returned a falsy value.`,
      );
    }
    protectedChildren.push(route);
  }

  // Lazy modules
  for (const lazyMod of lazyModules) {
    protectedChildren.push(createLazyModuleRoute(protectedParent, lazyMod));
  }

  if (options?.authenticatedRoute) {
    // Auth layout is a child of root, protected routes are children of the layout
    rootChildren.push(protectedParent.addChildren(protectedChildren));
  } else {
    // No auth boundary — everything is a direct child of root
    rootChildren.push(...protectedChildren);
  }

  return rootRoute.addChildren(rootChildren);
}

function createAuthenticatedLayoutRoute(
  rootRoute: AnyRoute,
  auth: NonNullable<RouteBuilderOptions["authenticatedRoute"]>,
): AnyRoute {
  return createRoute({
    getParentRoute: () => rootRoute,
    id: "_authenticated",
    component: auth.component ?? (() => <Outlet />),
    beforeLoad: auth.beforeLoad,
  });
}

/**
 * Creates a catch-all route for a lazily-loaded module.
 * On first navigation, the module descriptor is loaded and its routes
 * are resolved and cached.
 */
function createLazyModuleRoute(parentRoute: AnyRoute, lazyMod: LazyModuleDescriptor): AnyRoute {
  let cachedRoute: AnyRoute | null = null;

  const lazyRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: lazyMod.basePath.replace(/^\//, "") + "/$",
    beforeLoad: async () => {
      if (!cachedRoute) {
        const { default: descriptor } = await lazyMod.load();
        warnIgnoredLazyFields(descriptor, "@tanstack-react-modules/runtime");
        if (descriptor.createRoutes) {
          cachedRoute = descriptor.createRoutes(parentRoute);
        }
      }
    },
    component: () => null,
  });

  return lazyRoute;
}
