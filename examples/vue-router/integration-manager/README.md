# Integration Manager — Vue Router

Working example of the [sibling modules sharing a screen](../../../docs/sibling-modules-shared-screen.md) pattern for the Vue Router integration.

Three integration modules (Contentful, Strapi, GitHub) all render the same `<IntegrationManager>` screen with their own config. The shell's header command bar adapts to whichever integration is currently active.

## Layout

```text
app-shared/                shared types (IntegrationConfig, AppRouteData, AppSlots, AppDependencies)
                           + the IntegrationManager shared component (SFC)
                           + the vue-router `RouteMeta` augmentation
modules/
  contentful/              one integration module (its own config object, its own route + page SFC)
  strapi/                  …
  github/                  …
shell/                     the Vite app: registers all three modules, owns the router + layout,
                           reads the active integration via useRouteData
```

## Run it

```bash
pnpm install
pnpm --filter "@example-vue-integration-manager/shell" dev
```

Then navigate between `/integrations/contentful`, `/integrations/strapi`, and `/integrations/github`. The page body is rendered by the same component each time, but the columns/buttons/page title change.

## Key files to read

- `app-shared/src/integrations.ts` — `IntegrationConfig`, `IntegrationFeatures`, `ColumnDefinition`, `AppRouteData`. The shared vocabulary.
- `app-shared/src/IntegrationManager.vue` — the generic screen. Config-driven; knows nothing about specific integrations.
- `app-shared/src/vue-router-meta.ts` — augments vue-router's `RouteMeta` with `AppRouteData` so `meta: { ... }` is type-checked in every module.
- `modules/contentful/src/index.ts` — one module. Mirror-image for `strapi` and `github`.
- `shell/src/components/HeaderCommands.vue` — shell zone that reads `useRouteData<AppRouteData>()` and adapts.
- `shell/src/main.ts` — `createRegistry` + module registration + `createModularApp(registry, { router, parentRouteName })`.

## How it differs from the React Router example

Same pattern, three framework-forced differences:

- **Route static data rides on `meta`, not `handle`.** vue-router's `meta` is the analog of React Router's arbitrary `handle` channel. Modules attach `{ integration, pageTitle }` to a route's `meta`, and the shell reads it with `useRouteData<AppRouteData>()` (typed via the `RouteMeta` augmentation in `app-shared`).
- **The shell owns the router.** Instead of `registry.resolve({ rootComponent, indexComponent })` returning an `<App>`, the Vue shell creates its own `createRouter(...)`, then `createModularApp(registry, { router, parentRouteName: "root" })` grafts each module's `createRoutes()` output onto it via `router.addRoute()`. The returned manifest is itself a Vue plugin — `app.use(manifest)` installs the modular contexts app-wide.
- **`useRouteData` returns a `ComputedRef`.** It derives from the reactive `useRoute()`, so it recomputes on navigation; components read `.value` (auto-unwrapped in templates).
