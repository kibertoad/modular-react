# Integration Manager — React Router

Working example of the [sibling modules sharing a screen](../../../docs/sibling-modules-shared-screen.md) pattern for the React Router integration.

Three integration modules (Contentful, Strapi, GitHub) all render the same `<IntegrationManager>` screen with their own config. The shell's header command bar adapts to whichever integration is currently active.

## Layout

```
app-shared/                shared types (IntegrationConfig, AppRouteData, AppSlots, AppDependencies)
                           + the IntegrationManager shared component
modules/
  contentful/              one integration module (its own config object, its own route)
  strapi/                  …
  github/                  …
shell/                     the Vite app: registers all three modules, owns the layout, reads active integration via useRouteData
```

## Run it

```bash
pnpm install
pnpm --filter "@example-rr-integration-manager/shell" dev
```

Then navigate between `/integrations/contentful`, `/integrations/strapi`, and `/integrations/github`. The page body is rendered by the same component each time, but the columns/buttons/page title change.

## Key files to read

- `app-shared/src/integrations.ts` — `IntegrationConfig`, `IntegrationFeatures`, `ColumnDefinition`, `AppRouteData`. The shared vocabulary.
- `app-shared/src/IntegrationManager.tsx` — the generic screen. Config-driven; knows nothing about specific integrations.
- `modules/contentful/src/index.ts` — one module. Mirror-image for `strapi` and `github`.
- `shell/src/components/HeaderCommands.tsx` — shell zone that reads `useRouteData<AppRouteData>()` and adapts.
- `shell/src/main.tsx` — `createRegistry` + module registration + `registry.resolve()`.
