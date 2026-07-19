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
- **Lazy entry resolution**: `resolveEntryComponent(entry)` returns `{ Component, preload }` for either an eager (`{ component }`) or a lazy (`{ lazy: () => import(…) }`) `ModuleEntryPoint`. Memoized per entry-object identity via `WeakMap`. Used by both `JourneyOutlet` and `ModuleTab` so the lazy wrapper / import promise is shared across renders, hot reloads, and StrictMode double-mount. `preloadEntry(entry)` is the convenience wrapper for hover-prefetch UIs and other manual warm-up paths.
- **Subject-keyed panels**: `usePanels` (a `useMemo` over the slots context + subject), `<PanelsOutlet>` (renders every matching panel, ordered, subject injected as a prop **and** via context, each in a `ModuleErrorBoundary`), and `usePanelSubject` / `PanelSubjectContext` for reading the injected subject in panel bodies. The React host over the framework-neutral engine (`definePanelGroup` / `resolvePanels`, re-exported from `@modular-react/core`). See [docs/subject-panels.md](../../docs/subject-panels.md)
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
  return <ModuleRoute module={launcherModule} entry="pickWorkflow" routeId="/launch" />;
}

// Composition root decides which exit becomes which action.
<ModuleExitProvider
  onExit={(ev) => {
    if (ev.exit === "startOnboarding") runtime.start(onboardingHandle, ev.output);
  }}
>
  <RouterProvider router={router} />
</ModuleExitProvider>;
```

`<JourneyProvider>` from `@modular-react/journeys` composes over
`ModuleExitProvider` automatically — apps that use the journeys plugin
do not need to mount both.

### Manual prefetch with `preloadEntry`

`preloadEntry(entry)` triggers a lazy entry's dynamic import without rendering the component. Call it from a hover handler, an analytics-driven prediction, or a `useEffect` that knows the user is about to advance:

```tsx
import { preloadEntry } from "@modular-react/react";
import { billingModule } from "./billing-module.js";

function PlanCard({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} onMouseEnter={() => preloadEntry(billingModule.entryPoints.collect)}>
      Continue to billing
    </button>
  );
}
```

Calls are idempotent — the underlying `WeakMap` cache returns the same in-flight or resolved promise across hover, click, and any `<JourneyOutlet preload>` that picked the same entry.

In tests, prefer `preloadEntries(modules)` from `@modular-react/testing` — it walks every `lazy:` entry on a module set in one call, so renders commit synchronously without a Suspense fallback flash. See [`@modular-react/testing`](../testing/README.md#eager-resolution-mode-for-lazy-entries).

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
