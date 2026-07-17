# @modular-vue/core

Core types and utilities for defining modules using vue-router. Provides `defineModule`, the shared composables and scoped stores from `@modular-vue/vue`, and all shared type definitions.

## Installation

```bash
npm install @modular-vue/core
```

## What's included

- **Module definition**: `defineModule`, `defineSlots`
- **Types**: `ModuleDescriptor` (with vue-router `RouteRecordRaw` support), `AnyModuleDescriptor` (router-narrowed shorthand for internal plumbing), `LazyModuleDescriptor`, `NavigationItem`, `ModuleLifecycle`, `ReactiveService`, `SlotMap`, `SlotMapOf`, `ZoneMap`, `ZoneMapOf`
- **Shared dependencies**: `sharedDependenciesKey`, `provideSharedDependencies`, `createSharedComposables` (returns `useStore`, `useService`, `useReactiveService`, `useOptional`) — re-exported from `@modular-vue/vue`
- **Scoped stores**: `createScopedStore` with `useScoped` composable — re-exported from `@modular-vue/vue`
- **Route meta**: `ModuleRouteMeta`, the convention for carrying zones and per-route static data on `route.meta`
- **Detection**: `isStoreApi`, `isReactiveService`, `separateDeps`

## Usage

```typescript
import { defineModule } from "@modular-vue/core";

export default defineModule<AppDependencies, AppSlots>({
  id: "billing",
  version: "0.1.0",
  createRoutes: () => [
    {
      path: "/billing",
      children: [
        {
          path: "",
          component: () => import("./pages/BillingDashboard.vue"),
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

Unlike the frozen-tree routers, vue-router lets the runtime graft a module's
routes in via `router.addRoute()`, so `createRoutes()` returns a full
`RouteRecordRaw` subtree for both eager and lazy modules.

### Typed `route.meta`

Zones and per-route static data ride on a route's `meta`. Augment vue-router's
global `RouteMeta` once in your app to get typed access everywhere the runtime
reads it:

```typescript
import type { ModuleRouteMeta } from "@modular-vue/core";
import type { AppZones } from "@myorg/app-shared";

declare module "vue-router" {
  interface RouteMeta extends ModuleRouteMeta<AppZones> {}
}
```

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
