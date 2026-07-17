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
  for (const route of collectEagerRoutes(modules)) {
    addRoute(router, route, options);
  }

  for (const lazyMod of lazyModules) {
    addRoute(router, createLazyModuleRoute(router, lazyMod, options), options);
  }
}

/**
 * Flattens every eager module's `createRoutes()` output into a single route
 * list. Modules without `createRoutes` are skipped (headless); a `createRoutes`
 * that returns a falsy value throws with the module id.
 *
 * Shared by {@link graftModuleRoutes} (which adds these onto a live router) and
 * the registry's framework-mode `resolveManifest()` (which hands them back for
 * the host to spread into its own `createRouter`), so the skip / flatten /
 * validate contract lives in exactly one place.
 */
export function collectEagerRoutes(
  modules: ModuleDescriptor<any, any, any, any>[],
): RouteRecordRaw[] {
  const collected: RouteRecordRaw[] = [];
  for (const mod of modules) {
    if (!mod.createRoutes) continue;
    const routes = mod.createRoutes();
    if (!routes) {
      throw new Error(
        `[@modular-vue/runtime] Module "${mod.id}" createRoutes() returned a falsy value.`,
      );
    }
    collected.push(...(Array.isArray(routes) ? routes : [routes]));
  }
  return collected;
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
 * routes. A load that rejects is not cached: the guard resets its in-flight
 * promise so the next navigation retries (a transient chunk 404 or offline
 * blip must not brick the subtree). A descriptor that grafts no routes throws,
 * rather than removing the placeholder and stranding the user on a dead route.
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
        try {
          const { default: descriptor } = await lazyMod.load();
          warnIgnoredLazyFields(descriptor as any, "@modular-vue/runtime");
          const routes = descriptor.createRoutes?.();
          const list = routes ? (Array.isArray(routes) ? routes : [routes]) : [];
          if (list.length === 0) {
            // A lazy module that grafts nothing would leave the user on a dead
            // route once the placeholder is removed. Surface it instead.
            throw new Error(
              `[@modular-vue/runtime] Lazy module "${lazyMod.id}" loaded but contributed no ` +
                `routes (its descriptor has no createRoutes()), so nothing can be grafted under ` +
                `"${basePath}".`,
            );
          }
          for (const route of list) addRoute(router, route, options);
          // Drop the placeholder so this guard never runs again and the redirect
          // below resolves against the freshly grafted routes.
          router.removeRoute(placeholderName);
        } catch (err) {
          // Reset the in-flight guard so a transient failure retries on the next
          // navigation rather than caching the rejection forever. The placeholder
          // is untouched here (only removed on success above), so the guard still
          // intercepts the retry.
          loading = null;
          throw err;
        }
      })();
      await loading;
      // Re-resolve the original target now that the real routes exist.
      return to.fullPath;
    },
  };
}

/**
 * Ensures a single leading slash and no trailing slash: `billing/` → `/billing`.
 * The root (`/` or empty) collapses to an empty string so the caller's
 * `${basePath}/:pathMatch(.*)*` join stays single-slashed (`/:pathMatch(.*)*`)
 * instead of producing a malformed `//:pathMatch(.*)*`.
 */
function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.replace(/\/+$/, "");
  if (trimmed === "") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
