import { RouterProvider } from "@tanstack/react-router";
import { CatalogProvider } from "./catalog-context";
import { router } from "./router";

export function App() {
  return (
    <CatalogProvider>
      <RouterProvider router={router} />
    </CatalogProvider>
  );
}
