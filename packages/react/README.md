# @modular-react/react

React bindings for the `@modular-react/core` package. Provides context providers, hooks, and components that the router-specific runtime packages use internally.

## Installation

```bash
npm install @modular-react/react
```

## What's included

- **Shared dependencies**: `SharedDependenciesContext`, `createSharedHooks` (factory that returns `useStore`, `useService`, `useReactiveService`, `useOptional`)
- **Scoped stores**: `createScopedStore` with `useScoped` hook
- **Slots**: `SlotsContext`, `useSlots`, `RecalculateSlotsContext`, `useRecalculateSlots`, `DynamicSlotsProvider`, `createSlotsSignal`
- **Navigation**: `NavigationContext`, `useNavigation`
- **Modules**: `ModulesContext`, `useModules`, `getModuleMeta`
- **Error boundary**: `ModuleErrorBoundary`
- **Re-exported from `@modular-react/core`**: all types, `createStore`, `isStore`, `isStoreApi`, `isReactiveService`, `separateDeps`, `defineModule`, `defineSlots`, slot/navigation/validation functions, and runtime helpers

## Usage

Most apps import hooks from a router-specific package (`@react-router-modules/core` or `@tanstack-react-modules/core`). The router-specific runtime packages re-export relevant items from this package.

```typescript
import { useSlots, useNavigation, useModules } from "@modular-react/react";
```

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
