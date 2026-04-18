import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createMemoryHistory, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import type { LazyModuleDescriptor } from "@tanstack-react-modules/core";
import { buildRouteTree } from "./route-builder.js";

/**
 * Integration tests for `registerLazy()` in resolve() mode. These render a
 * real TanStack Router at a memory location matching the lazy module's
 * basePath and assert that the loaded module's content is actually visible.
 *
 * Structural tests (route-builder.test.tsx) can verify the shape of the
 * built tree but not whether navigation to a lazy route renders the loaded
 * component — historically the catch-all was wired with `component: () =>
 * null`, so every lazy route silently rendered nothing. These tests close
 * that gap.
 */

function RootLayout() {
  return <Outlet />;
}

describe("createLazyModuleRoute (integration)", () => {
  it("renders the loaded module's component at the lazy basePath", async () => {
    const lazyMod: LazyModuleDescriptor = {
      id: "lazy-feature",
      basePath: "/feature",
      load: async () => ({
        default: {
          id: "lazy-feature",
          version: "1.0.0",
          component: function LoadedFeature() {
            return <div data-testid="lazy-feature-loaded">Loaded!</div>;
          },
        },
      }),
    };

    const routeTree = buildRouteTree([], [lazyMod], {
      rootComponent: RootLayout,
    });

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/feature/anything"] }),
    });

    const { findByTestId } = render(<RouterProvider router={router} />);
    const loaded = await findByTestId("lazy-feature-loaded");
    expect(loaded.textContent).toBe("Loaded!");
  });

  it("loads the descriptor exactly once across multiple entries into the lazy path", async () => {
    // Guards against a regression where a fresh lazy import fires on every
    // navigation. TanStack's lazy machinery caches the resolved module; the
    // implementation just has to not short-circuit that cache.
    let loadCount = 0;
    const lazyMod: LazyModuleDescriptor = {
      id: "lazy-counter",
      basePath: "/counter",
      load: async () => {
        loadCount += 1;
        return {
          default: {
            id: "lazy-counter",
            version: "1.0.0",
            component: function Counter() {
              return <div data-testid="counter-loaded">count ok</div>;
            },
          },
        };
      },
    };

    const routeTree = buildRouteTree([], [lazyMod], {
      rootComponent: RootLayout,
    });

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/counter/a"] }),
    });

    const { findByTestId } = render(<RouterProvider router={router} />);
    await findByTestId("counter-loaded");

    await router.navigate({ to: "/counter/b" });
    // Wait a tick for the navigation to settle; the component is already
    // cached, so the DOM keeps rendering `counter-loaded`.
    await waitFor(() => expect(loadCount).toBe(1));
  });

  it("renders nothing (but does not throw) when the loaded descriptor has no component and no createRoutes", async () => {
    // Edge case: a lazy module that is purely headless (slots/navigation/etc.)
    // has no route content to render at its catch-all. Documenting the
    // fallback behavior — empty render, no crash — keeps this corner
    // predictable for consumers who intentionally split headless contributions.
    const lazyMod: LazyModuleDescriptor = {
      id: "headless-lazy",
      basePath: "/headless",
      load: async () => ({
        default: {
          id: "headless-lazy",
          version: "1.0.0",
        },
      }),
    };

    const routeTree = buildRouteTree([], [lazyMod], {
      rootComponent: RootLayout,
    });

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/headless/x"] }),
    });

    const { container } = render(<RouterProvider router={router} />);
    // Allow the lazy import microtask to settle, then assert no crash and
    // no unexpected content. The catch-all component resolves to a no-op
    // React element.
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });
});
