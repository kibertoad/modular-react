# @modular-react/core

Core primitives for building modular React applications. Provides types, slot/navigation builders, validation, and a lightweight store, all with zero React runtime dependency.

This is the shared foundation that both `@react-router-modules/*` and `@tanstack-react-modules/*` build on.

## Installation

```bash
npm install @modular-react/core
```

## What's included

- **Types**: `ModuleDescriptor`, `AnyModuleDescriptor`, `LazyModuleDescriptor`, `NavigationItem`, `ModuleLifecycle`, `ReactiveService`, `SlotMap`, `SlotMapOf`, `ZoneMap`, `ZoneMapOf`, `Store`, `RegistryConfig`, `NavigationGroup`, `NavigationManifest`, `ModuleEntry`, `DynamicSlotFactory`, `SlotFilter`
- **Slots**: `buildSlotsManifest`, `collectDynamicSlotFactories`, `evaluateDynamicSlots`
- **Navigation**: `buildNavigationManifest`, `resolveNavHref`
- **Route data**: `mergeRouteStaticData` (router-agnostic merge helper used by `useZones` / `useRouteData` in the runtime packages)
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
// `ParseKeys` from i18next resolves to your app's translation keys once you
// augment `CustomTypeOptions.resources` (see the i18next TypeScript guide).
// Used bare it falls back to a loose string union — still fine for the
// alias below, but you only get full key-level autocomplete after the
// augmentation.
import type { ParseKeys } from "i18next";

interface NavContext {
  workspaceId: string;
}

// Defined by the host app — whatever set of permission actions the shell
// gates nav items on. The library doesn't care what shape it is; `meta` is
// opaque.
type Action = "managePortalRequests" | "viewReports";

interface NavMeta {
  action?: Action;
  badge?: "beta" | "new";
}

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
      label: "appShell.nav.portalRequests", // typed i18n key
      to: ({ workspaceId }) => `/portal/${workspaceId}/requests`, // dynamic href
      meta: { action: "managePortalRequests" }, // typed meta
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

## AnyModuleDescriptor

`ModuleDescriptor` has four type parameters (`TSharedDependencies`, `TSlots`, `TMeta`, `TNavItem`). Internal helpers — navigation builders, lazy-field warnings, test fixtures — often only care about one of them (usually `TNavItem`), and writing `ModuleDescriptor<any, any, any, AppNavItem>` everywhere is noisy.

`AnyModuleDescriptor<TNavItem>` is the shorthand:

```typescript
import type { AnyModuleDescriptor, NavigationItem } from "@modular-react/core";

// Accept any module shape, but preserve the nav item narrowing.
function collectNav<TNavItem extends NavigationItem>(
  modules: readonly AnyModuleDescriptor<TNavItem>[],
) {
  return modules.flatMap((m) => m.navigation ?? []);
}
```

Prefer the full `ModuleDescriptor<...>` at user-facing boundaries — the alias is intended for generic plumbing where the extra positional `any`s would be pure filler. `@react-router-modules/core` and `@tanstack-react-modules/core` export their own `AnyModuleDescriptor` that preserve their router-specific `createRoutes` narrowing; import the alias from the router package you already depend on.

## mergeRouteStaticData

Router-agnostic merge helper used internally by the `useZones` and `useRouteData` hooks in the runtime packages. The two routers diverge on where they park per-route static data (`handle` in React Router, `staticData` in TanStack Router) but agree on the merge rules — so the shared helper takes the merge rules and a getter that plucks the data field.

You usually don't call it directly — use the `useZones` / `useRouteData` wrappers. Reach for it if you're building a second hook alongside them that reads a **different** field off the same matches:

```typescript
import { mergeRouteStaticData } from "@modular-react/core";
import { useMatches } from "react-router";

// Imagine routes attach a `loaderHints` field alongside `handle` (e.g. via a
// bespoke meta helper). This hook surfaces it with the same deepest-wins
// merge semantics the built-in hooks use — without hand-rolling the merge
// loop a third time.
type WithLoaderHints = { loaderHints?: Record<string, unknown> };

function useLoaderHints<T extends object>(): Partial<T> {
  return mergeRouteStaticData<T>(useMatches(), (match) => (match as WithLoaderHints).loaderHints);
}
```

Semantics: iterates matches in the order given (root → leaf), deeper matches overwrite shallower ones per key, `undefined` values are skipped (so a leaf can't silently clobber an ancestor by omitting the key or setting it to `undefined`). Arrays at the data position are ignored rather than enumerated as index-keyed objects.

## Full documentation

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
