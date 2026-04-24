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
- **Module-exit plumbing**: `ModuleExitProvider`, `useModuleExit`, `useModuleExitDispatcher`, `ModuleEvent`. The "step 0" pattern — a module entry fires an exit from outside any journey, the composition root decides what it means.
- **Standalone hosts**: `ModuleRoute` renders a module entry as a route element (router-mode step 0). Pairs with `ModuleTab` from `@modular-react/journeys` for the workspace-mode variant.
- **Re-exported from `@modular-react/core`**: all types, `createStore`, `isStore`, `isStoreApi`, `isReactiveService`, `separateDeps`, `defineModule`, `defineSlots`, slot/navigation/validation functions, and runtime helpers

## Usage

Most apps import hooks from a router-specific package (`@react-router-modules/core` or `@tanstack-react-modules/core`). The router-specific runtime packages re-export relevant items from this package.

```typescript
import { useSlots, useNavigation, useModules } from "@modular-react/react";
```

### Router-mode "step 0" with `ModuleRoute`

```tsx
import { ModuleExitProvider, ModuleRoute } from "@modular-react/react";

function LaunchPage() {
  return (
    <ModuleRoute
      module={launcherModule}
      entry="pickWorkflow"
      routeId="/launch"
    />
  );
}

// Composition root decides which exit becomes which action.
<ModuleExitProvider
  onExit={(ev) => {
    if (ev.exit === "startOnboarding") runtime.start(onboardingHandle, ev.output);
  }}
>
  <RouterProvider router={router} />
</ModuleExitProvider>
```

`<JourneyProvider>` from `@modular-react/journeys` composes over
`ModuleExitProvider` automatically — apps that use the journeys plugin
do not need to mount both.

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
