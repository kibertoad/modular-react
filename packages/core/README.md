# @modular-react/core

Core primitives for building modular React applications. Provides types, slot/navigation builders, validation, and a lightweight store, all with zero React runtime dependency.

This is the shared foundation that both `@react-router-modules/*` and `@tanstack-react-modules/*` build on.

## Installation

```bash
npm install @modular-react/core
```

## What's included

- **Types**: `ModuleDescriptor`, `LazyModuleDescriptor`, `NavigationItem`, `ModuleLifecycle`, `ReactiveService`, `SlotMap`, `SlotMapOf`, `ZoneMap`, `ZoneMapOf`, `Store`, `RegistryConfig`, `NavigationGroup`, `NavigationManifest`, `ModuleEntry`, `DynamicSlotFactory`, `SlotFilter`
- **Slots**: `buildSlotsManifest`, `collectDynamicSlotFactories`, `evaluateDynamicSlots`
- **Navigation**: `buildNavigationManifest`, `resolveNavHref`
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

## Generic NavigationItem

`NavigationItem` has three optional generics that let hosts opt into stricter typing — typed i18n labels, dynamic-href context, and an app-owned `meta` bag:

```typescript
import type { NavigationItem } from "@modular-react/core";
import type { ParseKeys } from "i18next";

interface NavContext { workspaceId: string }
interface NavMeta { action?: Action; badge?: "beta" | "new" }

// Alias once in app-shared and use everywhere
export type AppNavItem = NavigationItem<ParseKeys, NavContext, NavMeta>;
```

Thread through `defineModule`:

```typescript
import { defineModule } from "@react-router-modules/core";

export default defineModule<AppDeps, AppSlots, Record<string, unknown>, AppNavItem>({
  id: "portal",
  version: "1.0.0",
  navigation: [
    {
      label: "appShell.nav.portalRequests",                      // typed i18n key
      to: ({ workspaceId }) => `/portal/${workspaceId}/requests`, // dynamic href
      meta: { action: "managePortalRequests" },                  // typed meta
    },
  ],
});
```

At render time, resolve the href with context:

```typescript
import { resolveNavHref } from "@modular-react/core";

const href = resolveNavHref(item, { workspaceId });
```

See [docs/navigation.md](../../docs/navigation.md) for the full guide.

## Full documentation

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
