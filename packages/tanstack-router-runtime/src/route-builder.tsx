import { createRootRoute, createRoute, lazyRouteComponent, Outlet } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import type { ModuleDescriptor, LazyModuleDescriptor } from "@tanstack-react-modules/core";

// TanStack lazy modules contribute a single `component` rendered at
// `basePath/$` — different semantics from the React Router adapter, which
// honors `createRoutes()` because React Router supports `useRoutes()` at
// render time. TanStack Router's route tree is frozen at `createRouter`
// time, so `createRoutes` can't be mounted post-hoc. This list captures
// the fields we warn about on a lazy descriptor, with the TanStack-specific
// semantics (note that `component` is *not* here — unlike the core helper).
const IGNORED_TANSTACK_LAZY_FIELDS = [
  "createRoutes",
  "navigation",
  "slots",
  "dynamicSlots",
  "zones",
  "meta",
  "requires",
  "optionalRequires",
  "lifecycle",
] as const;

function warnIgnoredTanStackLazyFields(descriptor: ModuleDescriptor<any, any, any, any>): void {
  const ignored = IGNORED_TANSTACK_LAZY_FIELDS.filter(
    (f) => (descriptor as unknown as Record<string, unknown>)[f] !== undefined,
  );
  if (ignored.length === 0) return;
  // eslint-disable-next-line no-console
  console.warn(
    `[@tanstack-react-modules/runtime] Lazy module "${descriptor.id}" declared fields that are ignored for lazy modules: ${ignored.join(", ")}. Only descriptor.component is honored (rendered at basePath/$ via lazyRouteComponent); TanStack Router's route tree is frozen at createRouter time, so createRoutes cannot be mounted post-hoc. Move these fields to an eagerly-registered module, or use lazyRouteComponent() inside the module's own createRoutes for code-splitting.`,
  );
}

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
 *
 * On first navigation to the module's `basePath`, the module descriptor is
 * fetched via the user-supplied `load()` function and its `component` is
 * rendered at the catch-all. TanStack's own `lazyRouteComponent` is used to
 * wire the async import into the route, so the usual caching / suspense
 * handling applies — `load()` fires at most once per module, regardless of
 * re-entries into the basePath.
 *
 * **Limitation: no route-structure loading.** TanStack Router's route tree
 * is frozen at `createRouter({ routeTree })` time; you cannot graft new
 * routes in after that. If a loaded descriptor declares `createRoutes`
 * without a `component`, we warn (via `warnIgnoredLazyFields`) — the routes
 * can't mount. Lazy modules that need to contribute multiple routes should
 * register eagerly and use `lazyRouteComponent()` inside their own
 * `createRoutes` to code-split individual components. See
 * docs/framework-mode-tanstack-router.md for the complete guidance.
 */
function createLazyModuleRoute(parentRoute: AnyRoute, lazyMod: LazyModuleDescriptor): AnyRoute {
  return createRoute({
    getParentRoute: () => parentRoute,
    path: lazyMod.basePath.replace(/^\//, "") + "/$",
    component: lazyRouteComponent(async () => {
      const { default: descriptor } = await lazyMod.load();
      warnIgnoredTanStackLazyFields(descriptor);
      // `descriptor.component` is the renderable surface for a lazy module.
      // Fallback to a no-op for headless modules that exist only to ship
      // navigation / slots / zones — the catch-all still matches so their
      // contributions continue to flow, there's just nothing to render.
      const Component = descriptor.component ?? (() => null);
      return { default: Component };
    }),
  });
}
