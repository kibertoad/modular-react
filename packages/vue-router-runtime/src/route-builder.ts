import type { RouteRecordName, RouteRecordRaw, Router } from "vue-router";
import { warnIgnoredLazyFields } from "@modular-frontend/core";
import type { ModuleDescriptor, LazyModuleDescriptor } from "@modular-vue/core";

export interface RouteBuilderOptions {
  /**
   * Name of an already-registered parent route to graft module routes under.
   * When set, every module route is added as a child of this route via
   * `router.addRoute(parentName, route)` — the vue-router way to express an
   * auth boundary or a shared layout without the pathless-layout gymnastics
   * the React Router runtime needs. When omitted, module routes are added at
   * the top level.
   */
  parentName?: RouteRecordName;
}

/**
 * Grafts every module's route subtree onto a live vue-router instance via
 * `router.addRoute()`.
 *
 * Unlike the React Router / TanStack runtimes — which must compose a frozen
 * route tree before `createRouter` — vue-router registers routes at runtime,
 * so the runtime simply adds each module's `createRoutes()` output to the
 * router the app already created. Modules without `createRoutes` are skipped
 * (headless modules). Lazy modules get a catch-all placeholder that loads the
 * descriptor and grafts its real subtree on first visit.
 *
 * The React analog is `buildRouteTree` in `react-router-runtime/route-builder.tsx`.
 */
export function graftModuleRoutes(
  router: Router,
  modules: ModuleDescriptor<any, any, any, any>[],
  lazyModules: LazyModuleDescriptor<any, any, any, any>[],
  options?: RouteBuilderOptions,
): void {
  for (const mod of modules) {
    if (!mod.createRoutes) continue;
    const routes = mod.createRoutes();
    if (!routes) {
      throw new Error(
        `[@modular-vue/runtime] Module "${mod.id}" createRoutes() returned a falsy value.`,
      );
    }
    for (const route of Array.isArray(routes) ? routes : [routes]) {
      addRoute(router, route, options);
    }
  }

  for (const lazyMod of lazyModules) {
    addRoute(router, createLazyModuleRoute(router, lazyMod, options), options);
  }
}

function addRoute(router: Router, route: RouteRecordRaw, options?: RouteBuilderOptions): void {
  if (options?.parentName != null) {
    router.addRoute(options.parentName, route);
  } else {
    router.addRoute(route);
  }
}

/**
 * Builds a catch-all route for a lazily-loaded module. On first navigation into
 * `basePath`, the `beforeEnter` guard loads the descriptor, grafts its
 * `createRoutes()` subtree onto the router, removes this placeholder, and
 * redirects to the same location so vue-router re-resolves into the real
 * routes.
 *
 * vue-router's runtime `addRoute` makes this a straight port of intent from the
 * React `createLazyModuleRoute`, without React Router's `useRoutes` descendant
 * trick or TanStack's `$`-catch-all workaround: the loaded subtree becomes real
 * router state.
 *
 * Exported so a future framework-mode caller can graft lazy modules onto a
 * host-owned router with the same shape.
 */
export function createLazyModuleRoute(
  router: Router,
  lazyMod: LazyModuleDescriptor<any, any, any, any>,
  options?: RouteBuilderOptions,
): RouteRecordRaw {
  const basePath = normalizeBasePath(lazyMod.basePath);
  // A stable, unique name so the placeholder can remove itself after loading.
  const placeholderName = Symbol(`@modular-vue/runtime:lazy:${lazyMod.id}`);
  // Guards against re-entrancy while the load promise is in flight: two
  // concurrent navigations into the subtree must load and graft only once.
  let loading: Promise<void> | null = null;

  return {
    // `:pathMatch(.*)*` (zero-or-more) matches both the bare basePath and any
    // descendant, so the placeholder intercepts every first visit into the
    // module's subtree.
    path: `${basePath}/:pathMatch(.*)*`,
    name: placeholderName,
    // Never actually rendered: the guard redirects before this resolves. Vue
    // requires a component (or redirect) on a leaf record, so supply a stub.
    component: { render: () => null },
    beforeEnter: async (to) => {
      loading ??= (async () => {
        const { default: descriptor } = await lazyMod.load();
        warnIgnoredLazyFields(descriptor as any, "@modular-vue/runtime");
        if (descriptor.createRoutes) {
          const routes = descriptor.createRoutes();
          for (const route of Array.isArray(routes) ? routes : [routes]) {
            addRoute(router, route, options);
          }
        }
        // Drop the placeholder so this guard never runs again and the redirect
        // below resolves against the freshly grafted routes.
        router.removeRoute(placeholderName);
      })();
      await loading;
      // Re-resolve the original target now that the real routes exist.
      return to.fullPath;
    },
  };
}

/** Ensures a single leading slash and no trailing slash: `billing/` → `/billing`. */
function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
