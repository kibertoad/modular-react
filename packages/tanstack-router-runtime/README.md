# @tanstack-react-modules/runtime

Application assembly layer for modular-react (TanStack Router integration). Takes modules and configuration, produces a running app with routing, slots, zones, navigation, and provider wiring.

## Installation

```bash
npm install @tanstack-react-modules/runtime
```

## What's included

- **Registry**: `createRegistry` (assembles modules into a running app)
- **Zones**: `useZones` (component zones from matched route `staticData`), `useActiveZones` (merges route zones with active module zones), `useRouteData` (non-component route metadata — headerVariant, page titles, etc.)
- **Types**: `ModuleRegistry`, `ResolveOptions`, `RegistryConfig`, `ApplicationManifest`
- **Re-exported from `@modular-react/core`**: `buildSlotsManifest`, `collectDynamicSlotFactories`, `evaluateDynamicSlots`, `buildNavigationManifest`, `validateNoDuplicateIds`, `validateDependencies`, `NavigationGroup`, `NavigationManifest`, `ModuleEntry`, `DynamicSlotFactory`, `SlotFilter`
- **Re-exported from `@modular-react/react`**: `useNavigation`, `useSlots`, `useRecalculateSlots`, `useModules`, `getModuleMeta`, `ModuleErrorBoundary`, `NavigationContext`, `SlotsContext`, `RecalculateSlotsContext`, `ModulesContext`, `DynamicSlotsProvider`, `createSlotsSignal`

## Usage

```typescript
import { createRegistry } from "@tanstack-react-modules/runtime";
import billingModule from "./modules/billing";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
  slots: { commands: [] },
});

registry.register(billingModule);

const { App, recalculateSlots } = registry.resolve({
  rootComponent: Layout,
  indexComponent: HomePage,
});

// Re-evaluate dynamic slots after auth state changes
authStore.subscribe((state, prev) => {
  if (state.isAuthenticated !== prev.isAuthenticated) {
    recalculateSlots();
  }
});
```

## `useRouteData` for non-component route metadata

`useZones<T>()` enforces `ComponentType | undefined` on every zone value. `useRouteData<T>()` is the relaxed-typing counterpart — same deepest-wins merge over `staticData`, no constraint on values:

```typescript
import { useZones, useRouteData } from "@tanstack-react-modules/runtime";

function Shell() {
  const { HeaderActions } = useZones<AppZones>();
  const { headerVariant, pageTitle } = useRouteData<AppRouteData>();
}
```

A single route can contribute to both channels — components keyed as `useZones` expects, non-component metadata keyed as `useRouteData` expects. Both read the same `staticData`; each exposes only the keys declared in its generic.

## Dynamic slots and slot filters

Modules can contribute conditional slot entries via `dynamicSlots` and trigger re-evaluation from components via `useRecalculateSlots()`. The shell can apply cross-cutting filters via `slotFilter` on `resolve()`.

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
