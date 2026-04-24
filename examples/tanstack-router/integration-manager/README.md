# Integration Manager — TanStack Router

Working example of the [sibling modules sharing a screen](../../../docs/sibling-modules-shared-screen.md) pattern for the TanStack Router integration.

Three integration modules (Contentful, Strapi, GitHub) all render the same `<IntegrationManager>` screen with their own config. The shell's header command bar adapts to whichever integration is currently active by reading `useRouteData<AppRouteData>()`.

## Layout

```text
app-shared/                shared types (IntegrationConfig, AppRouteData, AppSlots, AppDependencies)
                           + IntegrationManager component
                           + TanStack Router staticData augmentation
modules/
  contentful/              one integration module (its own config, its own route)
  strapi/                  …
  github/                  …
shell/                     the Vite app: registers all three modules, owns the layout
```

## Run it

```bash
pnpm install
pnpm --filter "@example-tsr-integration-manager/shell" dev
```

## Notable differences from the React Router variant

- `handle` → `staticData` on route definitions.
- Route definitions use `createRoute({ getParentRoute, path, ... })` and attach children with `addChildren`.
- TanStack Router exposes a formal augmentation target for route static data: `StaticDataRouteOption`. The example declares `declare module "@tanstack/router-core" { interface StaticDataRouteOption extends AppRouteData {} }` in `app-shared`, so modules get compile-time checking on `staticData`.
