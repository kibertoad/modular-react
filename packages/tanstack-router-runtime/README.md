# @tanstack-react-modules/runtime 
 
Application assembly layer for modular-react (TanStack Router integration). Takes modules and configuration, produces a running app with routing, slots, zones, navigation, and provider wiring.

## Installation

```bash
npm install @tanstack-react-modules/runtime
```

## What's included

- **Registry**: `createRegistry` (assembles modules into a running app)
- **Zones**: `useZones` (reads zone components from matched route `staticData`), `useActiveZones` (merges route zones with active module zones)
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

Modules can contribute conditional slot entries via `dynamicSlots` and trigger re-evaluation from components via `useRecalculateSlots()`. The shell can apply cross-cutting filters via `slotFilter` on `resolve()`.

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
