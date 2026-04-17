import { RouterProvider } from "react-router";
import type { DataRouter } from "react-router";
import { createProvidersComponent, type ProvidersProps } from "./providers.js";

interface AppProps extends ProvidersProps {
  router: DataRouter;
}

/**
 * Composes the root App component for registries that own the router.
 * Wraps the shared modular-react provider stack around a `<RouterProvider />`.
 *
 * Framework-mode integrations (React Router v7 with `@react-router/dev/vite`)
 * should use `registry.resolveManifest()` instead — it returns the same
 * provider stack without owning a router, so the framework Vite plugin can
 * remain in control of route discovery and type generation.
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
