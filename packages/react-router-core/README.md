# @react-router-modules/core

Core types and utilities for defining modules with React Router. Provides `defineModule`, `createSharedHooks`, scoped stores, and all shared type definitions.

## Installation

```bash
npm install @react-router-modules/core
```

## What's included

- **Module definition**: `defineModule`, `defineSlots`
- **Types**: `ModuleDescriptor` (with React Router `RouteObject` support), `LazyModuleDescriptor`, `NavigationItem`, `ModuleLifecycle`, `ReactiveService`, `SlotMap`, `SlotMapOf`, `ZoneMap`, `ZoneMapOf`
- **Shared dependencies**: `SharedDependenciesContext`, `createSharedHooks` (returns `useStore`, `useService`, `useReactiveService`, `useOptional`)
- **Scoped stores**: `createScopedStore` with `useScoped` hook
- **Detection**: `isStoreApi`, `isReactiveService`, `separateDeps`

## Usage

```typescript
import { defineModule } from "@react-router-modules/core";

export default defineModule<AppDependencies, AppSlots>({
  id: "billing",
  version: "0.1.0",
  createRoutes: () => [
    {
      path: "billing",
      children: [
        {
          index: true,
          lazy: () => import("./pages/BillingDashboard.js").then((m) => ({ Component: m.default })),
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

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
