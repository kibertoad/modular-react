# @modular-react/core

Core primitives for modular React applications. Provides types, slot/navigation builders, validation, and a lightweight store, all with zero React runtime dependency.

This is the shared foundation that both `@react-router-modules/*` and `@tanstack-react-modules/*` build on.

## Installation

```bash
npm install @modular-react/core
```

## What's included

- **Types**: `ModuleDescriptor`, `LazyModuleDescriptor`, `NavigationItem`, `ModuleLifecycle`, `ReactiveService`, `SlotMap`, `SlotMapOf`, `ZoneMap`, `ZoneMapOf`, `Store`, `RegistryConfig`, `NavigationGroup`, `NavigationManifest`, `ModuleEntry`, `DynamicSlotFactory`, `SlotFilter`
- **Slots**: `buildSlotsManifest`, `collectDynamicSlotFactories`, `evaluateDynamicSlots`
- **Navigation**: `buildNavigationManifest`
- **Validation**: `validateNoDuplicateIds`, `validateDependencies`
- **Store**: `createStore` (a lightweight zustand-compatible store, no middleware)
- **Detection**: `isStore`, `isStoreApi` (alias), `isReactiveService`, `separateDeps`
- **Helpers**: `defineModule`, `defineSlots`, `buildDepsSnapshot`, `runLifecycleHooks`

## Usage

Most apps import from a router-specific package (`@react-router-modules/core` or `@tanstack-react-modules/core`) rather than directly from this package. Use this package when building router-agnostic tooling or extending the framework.

```typescript
import { buildSlotsManifest, createStore } from "@modular-react/core";
import type { ModuleDescriptor, Store } from "@modular-react/core";
```

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
