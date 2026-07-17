# @angular-router-modules/core

Core types and utilities for defining modules using Angular Router. Provides
`defineModule`, the shared injectors and scoped stores from
[`@modular-angular/angular`](../angular), and all shared type definitions. This
is the Angular analog of [`@react-router-modules/core`](../react-router-core) and
[`@modular-vue/core`](../vue-core), and part of the
[Angular support initiative](../../docs/angular-support-tracker.md) (PR-A20).

> Status: `0.x`, pre-1.0. The API tracks the React and Vue core packages
> case-for-case and will stay 0.x until the parity audit (PR-A42).

This package is plain TypeScript on the repo's rolldown pipeline — it carries no
`@Component` code (AD3).

## Installation

```bash
npm install @angular-router-modules/core
```

## What's included

- **Module definition**: `defineModule`, `defineSlots`
- **Types**: `ModuleDescriptor` (with Angular Router `Route` support),
  `AnyModuleDescriptor` (router-narrowed shorthand for internal plumbing),
  `LazyModuleDescriptor`, `NavigationItem`, `ModuleLifecycle`, `ReactiveService`,
  `SlotMap`, `SlotMapOf`, `ZoneMap`, `ZoneMapOf`
- **Shared dependencies**: `SHARED_DEPENDENCIES`, `provideSharedDependencies`,
  `createSharedInjectors` (returns `injectStore`, `injectService`,
  `injectReactiveService`, `injectOptional`) — re-exported from
  `@modular-angular/angular`
- **Scoped stores**: `createScopedStore` with the `injectScoped` accessor —
  re-exported from `@modular-angular/angular`
- **Route data**: `ModuleRouteData`, the convention for carrying zones and
  per-route static data on `route.data`
- **Detection**: `isStoreApi`, `isReactiveService`, `separateDeps`

## Usage

```typescript
import { defineModule } from "@angular-router-modules/core";

export default defineModule<AppDependencies, AppSlots>({
  id: "billing",
  version: "0.1.0",
  createRoutes: () => [
    {
      path: "billing",
      children: [
        {
          path: "",
          loadComponent: () => import("./pages/billing-dashboard.component"),
        },
      ],
    },
  ],
  navigation: [{ label: "Billing", to: "/billing", group: "finance" }],

  // Static slots (always present)
  slots: { commands: [{ id: "billing:export", label: "Export", onSelect: () => {} }] },

  // Dynamic slots (re-evaluated on recalculateSlots())
  dynamicSlots: (deps) => ({
    commands:
      deps.auth.user?.role === "admin"
        ? [{ id: "billing:void", label: "Void Invoice", onSelect: () => {} }]
        : [],
  }),
});
```

Angular Router lets the runtime rebuild and reinstall the whole config via
`router.resetConfig()` (PR-A22), so `createRoutes()` returns a full `Route`
subtree for both eager and lazy modules.

### Typed `route.data`

Zones and per-route static data ride on a route's `data`. Angular Router's
`Route['data']` is a single, non-augmentable `Data` type (unlike vue-router's
global `RouteMeta`), so — like the React `handle` channel — the `ModuleRouteData`
helper is applied per-route with `satisfies` at the authoring site:

```typescript
import type { ModuleRouteData } from "@angular-router-modules/core";
import type { AppZones } from "@myorg/app-shared";

// In a module's createRoutes():
{
  path: ":userId",
  component: UserDetailPage,
  data: {
    detailPanel: UserDetailSidebar,   // a zone component
    breadcrumb: "User",               // arbitrary route data
  } satisfies ModuleRouteData<AppZones>,
}
```

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
