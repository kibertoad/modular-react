import { describe, it, expect, vi } from "vitest";
import { buildRouteTree } from "./route-builder.js";
import type { RouteObject } from "react-router";
import type { ReactiveModuleDescriptor } from "@react-router-modules/core";

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
    createRoutes: () => ({
      path,
      Component: () => <></>,
    }),
  });
}

describe("buildRouteTree", () => {
  it("builds a route tree with module routes", () => {
    const routes = buildRouteTree([moduleWithRoutes("billing", "billing")], [], {
      indexComponent: () => <></>,
    });

    const rootChildren = routes[0].children!;
    expect(rootChildren).toHaveLength(2); // index + billing
  });

  it("skips headless modules (no createRoutes)", () => {
    const headless = fakeModule({ id: "headless" }); // no createRoutes
    const withRoutes = moduleWithRoutes("billing", "billing");

    const routes = buildRouteTree([headless, withRoutes], [], {});
    const rootChildren = routes[0].children!;
    // Only billing route, no index
    expect(rootChildren).toHaveLength(1);
  });

  it("adds shell routes alongside module routes", () => {
    const routes = buildRouteTree([moduleWithRoutes("billing", "billing")], [], {
      shellRoutes: () => [
        { path: "login", Component: () => <></> },
        { path: "error", Component: () => <></> },
      ],
    });

    const rootChildren = routes[0].children!;
    // login + error + billing = 3
    expect(rootChildren).toHaveLength(3);
  });

  it("passes loader to the root route", () => {
    const loader = vi.fn();
    const routes = buildRouteTree([], [], { loader });

    expect(routes[0].loader).toBe(loader);
  });

  it("uses a custom rootRoute when provided", () => {
    const customRoot: RouteObject = {
      path: "/",
      Component: () => <></>,
    };

    const routes = buildRouteTree([moduleWithRoutes("billing", "billing")], [], {
      rootRoute: customRoot,
    });

    // The returned tree contains the custom root
    expect(routes[0]).toBe(customRoot);
    expect(routes[0].children).toHaveLength(1);
  });

  it("ignores rootComponent/notFoundComponent/loader when rootRoute is provided", () => {
    const customRoot: RouteObject = { path: "/" };
    const loader = vi.fn();

    const routes = buildRouteTree([], [], {
      rootRoute: customRoot,
      rootComponent: () => <></>,
      notFoundComponent: () => <></>,
      loader,
    });

    expect(routes[0]).toBe(customRoot);
    // loader should NOT be on the custom root (it wasn't passed to it)
    expect(routes[0].loader).toBeUndefined();
  });

  it("combines index, shell routes, and module routes", () => {
    const routes = buildRouteTree(
      [moduleWithRoutes("billing", "billing"), moduleWithRoutes("users", "users")],
      [],
      {
        indexComponent: () => <></>,
        shellRoutes: () => [{ path: "login", Component: () => <></> }],
      },
    );

    const rootChildren = routes[0].children!;
    // index + login + billing + users = 4
    expect(rootChildren).toHaveLength(4);
  });

  describe("authenticatedRoute", () => {
    it("creates a layout route that wraps module routes and index", () => {
      const authLoader = vi.fn();
      const routes = buildRouteTree([moduleWithRoutes("billing", "billing")], [], {
        indexComponent: () => <></>,
        authenticatedRoute: { loader: authLoader },
        shellRoutes: () => [{ path: "login", Component: () => <></> }],
      });

      const rootChildren = routes[0].children!;
      // login (public) + _authenticated (layout) = 2
      expect(rootChildren).toHaveLength(2);

      // The auth layout
      const authLayout = rootChildren.find((r: any) => r.id === "_authenticated");
      expect(authLayout).toBeDefined();
      expect(authLayout!.loader).toBe(authLoader);

      // Auth layout should have index + billing as children
      expect(authLayout!.children).toHaveLength(2);
    });

    it("keeps shell routes outside the auth boundary", () => {
      const authLoader = vi.fn();
      const routes = buildRouteTree([], [], {
        authenticatedRoute: { loader: authLoader },
        shellRoutes: () => [{ path: "login", Component: () => <></> }],
      });

      const rootChildren = routes[0].children!;
      // login sits at root level, not inside auth layout
      const loginRoute = rootChildren.find((r: any) => r.path === "login");
      expect(loginRoute).toBeDefined();
    });

    it("root loader runs for all routes including public ones", () => {
      const rootLoader = vi.fn();
      const authLoader = vi.fn();
      const routes = buildRouteTree([], [], {
        loader: rootLoader,
        authenticatedRoute: { loader: authLoader },
      });

      // Root has the observability loader
      expect(routes[0].loader).toBe(rootLoader);

      // Auth layout has the auth guard
      const authLayout = routes[0].children!.find((r: any) => r.id === "_authenticated");
      expect(authLayout).toBeDefined();
      expect(authLayout!.loader).toBe(authLoader);
    });
  });
});
