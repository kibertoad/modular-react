import { describe, it, expect, vi } from "vitest";
import { buildRouteTree } from "./route-builder.js";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import type { ReactiveModuleDescriptor } from "@tanstack-react-modules/core";
import type { AnyRoute } from "@tanstack/react-router";

function fakeModule(overrides: Partial<ReactiveModuleDescriptor> = {}): ReactiveModuleDescriptor {
  return {
    id: overrides.id ?? "test",
    version: "0.1.0",
    ...overrides,
  };
}

function moduleWithRoutes(id: string, path: string): ReactiveModuleDescriptor {
  return fakeModule({
    id,
    createRoutes: (parent: AnyRoute) => {
      return createRoute({
        getParentRoute: () => parent,
        path,
        component: () => <></>,
      });
    },
  });
}

describe("buildRouteTree", () => {
  it("builds a route tree with module routes", () => {
    const tree = buildRouteTree([moduleWithRoutes("billing", "/billing")], [], {
      indexComponent: () => <></>,
    });

    const children = (tree as any).children;
    expect(children).toHaveLength(2); // index + billing
  });

  it("skips headless modules (no createRoutes)", () => {
    const headless = fakeModule({ id: "headless" }); // no createRoutes
    const withRoutes = moduleWithRoutes("billing", "/billing");

    const tree = buildRouteTree([headless, withRoutes], [], {});
    const children = (tree as any).children;
    // Only billing route, no index
    expect(children).toHaveLength(1);
  });

  it("adds shell routes alongside module routes", () => {
    const tree = buildRouteTree([moduleWithRoutes("billing", "/billing")], [], {
      shellRoutes: (parent) => [
        createRoute({
          getParentRoute: () => parent,
          path: "/login",
          component: () => <></>,
        }),
        createRoute({
          getParentRoute: () => parent,
          path: "/error",
          component: () => <></>,
        }),
      ],
    });

    const children = (tree as any).children;
    // login + error + billing = 3
    expect(children).toHaveLength(3);
  });

  it("passes beforeLoad to the root route", () => {
    const beforeLoad = vi.fn();
    const tree = buildRouteTree([], [], { beforeLoad });

    expect((tree as any).options.beforeLoad).toBe(beforeLoad);
  });

  it("uses a custom rootRoute when provided", () => {
    const customRoot = createRootRoute({
      component: () => <></>,
    });

    const tree = buildRouteTree([moduleWithRoutes("billing", "/billing")], [], {
      rootRoute: customRoot,
    });

    // The returned tree IS the custom root
    expect(tree).toBe(customRoot);
    expect((tree as any).children).toHaveLength(1);
  });

  it("ignores rootComponent/notFoundComponent/beforeLoad when rootRoute is provided", () => {
    const customRoot = createRootRoute({});
    const beforeLoad = vi.fn();

    const tree = buildRouteTree([], [], {
      rootRoute: customRoot,
      rootComponent: () => <></>,
      notFoundComponent: () => <></>,
      beforeLoad,
    });

    expect(tree).toBe(customRoot);
    // beforeLoad should NOT be on the custom root (it wasn't passed to createRootRoute)
    expect((tree as any).options.beforeLoad).toBeUndefined();
  });

  it("combines index, shell routes, and module routes", () => {
    const tree = buildRouteTree(
      [moduleWithRoutes("billing", "/billing"), moduleWithRoutes("users", "/users")],
      [],
      {
        indexComponent: () => <></>,
        shellRoutes: (parent) => [
          createRoute({ getParentRoute: () => parent, path: "/login", component: () => <></> }),
        ],
      },
    );

    const children = (tree as any).children;
    // index + login + billing + users = 4
    expect(children).toHaveLength(4);
  });

  describe("authenticatedRoute", () => {
    it("creates a layout route that wraps module routes and index", () => {
      const authBeforeLoad = vi.fn();
      const tree = buildRouteTree([moduleWithRoutes("billing", "/billing")], [], {
        indexComponent: () => <></>,
        authenticatedRoute: { beforeLoad: authBeforeLoad },
        shellRoutes: (parent) => [
          createRoute({ getParentRoute: () => parent, path: "/login", component: () => <></> }),
        ],
      });

      const rootChildren = (tree as any).children;
      // login (public) + _authenticated (layout) = 2
      expect(rootChildren).toHaveLength(2);

      // The auth layout is one of the root children (the other is /login)
      // TanStack Router stores the id in options.id, and the route exposes it as .id
      const authLayout = rootChildren.find(
        (r: any) => r.options?.id === "_authenticated" || r.id === "/_authenticated",
      );
      expect(authLayout).toBeDefined();
      expect(authLayout.options.beforeLoad).toBe(authBeforeLoad);

      // Auth layout should have index + billing as children
      expect(authLayout.children).toHaveLength(2);
    });

    it("keeps shell routes outside the auth boundary", () => {
      const authBeforeLoad = vi.fn();
      const tree = buildRouteTree([], [], {
        authenticatedRoute: { beforeLoad: authBeforeLoad },
        shellRoutes: (parent) => [
          createRoute({ getParentRoute: () => parent, path: "/login", component: () => <></> }),
        ],
      });

      const rootChildren = (tree as any).children;
      // login sits at root level, not inside auth layout
      const loginRoute = rootChildren.find((r: any) => r.options?.path === "/login");
      expect(loginRoute).toBeDefined();

      // login's parent is root, not auth layout
      expect(loginRoute.options.getParentRoute()).toBe(tree);
    });

    it("root beforeLoad runs for all routes including public ones", () => {
      const rootBeforeLoad = vi.fn();
      const authBeforeLoad = vi.fn();
      const tree = buildRouteTree([], [], {
        beforeLoad: rootBeforeLoad,
        authenticatedRoute: { beforeLoad: authBeforeLoad },
      });

      // Root has the observability beforeLoad
      expect((tree as any).options.beforeLoad).toBe(rootBeforeLoad);

      // Auth layout has the auth guard
      const authLayout = (tree as any).children.find(
        (r: any) => r.options?.id === "_authenticated" || r.id === "/_authenticated",
      );
      expect(authLayout).toBeDefined();
      expect(authLayout.options.beforeLoad).toBe(authBeforeLoad);
    });
  });
});
