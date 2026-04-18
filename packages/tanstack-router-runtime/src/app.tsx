import { RouterProvider } from "@tanstack/react-router";
import type { Router } from "@tanstack/react-router";
import { createProvidersComponent, type ProvidersProps } from "./providers.js";

interface AppProps extends ProvidersProps {
  router: Router<any, any, any>;
}

/**
 * Composes the root App component for registries that own the router.
 * Wraps the shared modular-react provider stack around a `<RouterProvider />`.
 *
 * Framework-mode integrations (TanStack Router file-based mode with
 * `@tanstack/router-plugin`, or TanStack Start) should use
 * `registry.resolveManifest()` instead — it returns the same provider stack
 * without owning a router, so the host can call `createRouter({ routeTree })`
 * against a generated tree.
 */
export function createAppComponent({ router, ...providersProps }: AppProps) {
  const Providers = createProvidersComponent(providersProps);

  function App() {
    return (
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    );
  }

  App.displayName = "ModularApp";
  return App;
}
