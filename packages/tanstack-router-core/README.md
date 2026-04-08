# @tanstack-react-modules/core

Core types and utilities for defining modules with TanStack Router. Provides `defineModule`, `createSharedHooks`, scoped stores, and all shared type definitions.

## Installation

```bash
npm install @tanstack-react-modules/core
```

## What's included

- **Module definition**: `defineModule`, `defineSlots`
- **Types**: `ModuleDescriptor` (with TanStack Router `createRoute` support), `LazyModuleDescriptor`, `NavigationItem`, `ModuleLifecycle`, `ReactiveService`, `SlotMap`, `SlotMapOf`, `ZoneMap`, `ZoneMapOf`
- **Shared dependencies**: `SharedDependenciesContext`, `createSharedHooks` (returns `useStore`, `useService`, `useReactiveService`, `useOptional`)
- **Scoped stores**: `createScopedStore` with `useScoped` hook
- **Detection**: `isStoreApi`, `isReactiveService`, `separateDeps`

## Usage

```typescript
import { defineModule } from "@tanstack-react-modules/core";
import { createRoute } from "@tanstack/react-router";

export default defineModule<AppDependencies, AppSlots>({
  id: "billing",
  version: "0.1.0",
  createRoutes: (parentRoute) =>
    createRoute({
      getParentRoute: () => parentRoute,
      path: "/billing",
      component: BillingDashboard,
    }),
  navigation: [{ label: "Billing", to: "/billing", group: "finance" }],

  // Static slots — always present
  slots: { commands: [{ id: "billing:export", label: "Export", onSelect: () => {} }] },

  // Dynamic slots — re-evaluated on recalculateSlots()
  dynamicSlots: (deps) => ({
    commands:
      deps.auth.user?.role === "admin"
        ? [{ id: "billing:void", label: "Void Invoice", onSelect: () => {} }]
        : [],
  }),
});
```

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
