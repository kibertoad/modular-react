# @modular-frontend/core

Framework-neutral primitives for building modular frontend applications. Provides module descriptor types, slot/navigation builders, validation, journey contracts, and a lightweight store, with no UI-framework dependency.

This is the shared foundation the framework bindings build on. The React binding (`@modular-react/core`) re-exports this package; a future `@modular-vue/core` will do the same. Components are carried as opaque values through a small `UiComponent` / `UiNode` type seam, which each binding refines to its own component type.

## Installation

```bash
npm install @modular-frontend/core
```

Most apps depend on a framework binding (`@modular-react/core`, and downstream `@react-router-modules/*` / `@tanstack-react-modules/*`) rather than on this package directly. Use `@modular-frontend/core` when building framework-agnostic tooling or a new framework binding.

## What's included

- **Types**: `ModuleDescriptor`, `AnyModuleDescriptor`, `LazyModuleDescriptor`, `NavigationItem`, `ModuleLifecycle`, `ReactiveService`, `SlotMap`, `SlotMapOf`, `ZoneMap`, `ZoneMapOf`, `Store`, `RegistryConfig`, `NavigationGroup`, `NavigationManifest`, `ModuleEntry`, `DynamicSlotFactory`, `SlotFilter`
- **UI-type seam**: `UiComponent`, `UiNode` — framework-neutral stand-ins refined by each binding
- **Slots**: `buildSlotsManifest`, `collectDynamicSlotFactories`, `evaluateDynamicSlots`
- **Navigation**: `buildNavigationManifest`, `resolveNavHref`
- **Route data**: `mergeRouteStaticData` (router-agnostic merge helper used by `useZones` / `useRouteData` in the runtime packages)
- **Validation**: `validateNoDuplicateIds`, `validateDependencies`, `validateEntryExitShape`
- **Store**: `createStore` (a lightweight zustand-compatible store, no middleware)
- **Detection**: `isStore`, `isStoreApi` (alias), `isReactiveService`, `separateDeps`
- **Helpers**: `defineModule`, `defineSlots`, `buildDepsSnapshot`, `runLifecycleHooks`
- **Journey contracts**: type-only surfaces describing a journey runtime (implemented in `@modular-react/journeys`)
- **Semver subset**: `satisfies`, `parseRange`, `parseVersion`, `compareVersions`

## The UiComponent seam

The core never renders, calls, or inspects a component — it only carries them as values on descriptors (`component`, `zones`, entry-point `component`, `NavigationItem.icon`). So instead of depending on any UI framework, those positions use two neutral aliases:

```typescript
export type UiComponent<P = any> = (props: P) => any;
export type UiNode = unknown;
```

`UiComponent<P>` defaults to a function-component signature, which a React function component satisfies directly, so authoring against `@modular-react/core` keeps full props-checking against `ModuleEntryProps` with no React dependency in this package. A Vue binding narrows the same alias to Vue's component type.

## Usage

```typescript
import { buildSlotsManifest, createStore } from "@modular-frontend/core";
import type { ModuleDescriptor, Store } from "@modular-frontend/core";
```

## Generic NavigationItem

`NavigationItem` has four optional generics that let hosts opt into stricter typing — typed i18n labels, dynamic-href context, an app-owned `meta` bag, and an app-owned dispatchable `action` union:

```typescript
import type { NavigationItem } from "@modular-frontend/core";
// `ParseKeys` from i18next resolves to your app's translation keys once you
// augment `CustomTypeOptions.resources` (see the i18next TypeScript guide).
import type { ParseKeys } from "i18next";

interface NavContext {
  workspaceId: string;
}

type Permission = "managePortalRequests" | "viewReports";

interface NavMeta {
  permission?: Permission;
  badge?: "beta" | "new";
}

type NavAction =
  | { kind: "open-module"; moduleId: string; entry: string; input?: unknown }
  | { kind: "journey-start"; journeyId: string; buildInput?: (ctx?: unknown) => unknown };

// Alias once in app-shared and use everywhere
export type AppNavItem = NavigationItem<ParseKeys, NavContext, NavMeta, NavAction>;
```

`action` defaults to `never`, so apps that don't need dispatchable nav intents pay no cost — the field is absent from the item surface.

At render time, resolve the href with context:

```typescript
import { resolveNavHref } from "@modular-frontend/core";

const href = resolveNavHref(item, { workspaceId });
```

See [docs/navigation.md](../../docs/navigation.md) for the full guide.

## AnyModuleDescriptor

`ModuleDescriptor` has four type parameters (`TSharedDependencies`, `TSlots`, `TMeta`, `TNavItem`). Internal helpers — navigation builders, lazy-field warnings, test fixtures — often only care about one of them (usually `TNavItem`), and writing `ModuleDescriptor<any, any, any, AppNavItem>` everywhere is noisy.

`AnyModuleDescriptor<TNavItem>` is the shorthand:

```typescript
import type { AnyModuleDescriptor, NavigationItem } from "@modular-frontend/core";

// Accept any module shape, but preserve the nav item narrowing.
function collectNav<TNavItem extends NavigationItem>(
  modules: readonly AnyModuleDescriptor<TNavItem>[],
) {
  return modules.flatMap((m) => m.navigation ?? []);
}
```

Prefer the full `ModuleDescriptor<...>` at user-facing boundaries — the alias is intended for generic plumbing where the extra positional `any`s would be pure filler.

## mergeRouteStaticData

Router-agnostic merge helper used internally by the `useZones` and `useRouteData` hooks in the runtime packages. The two routers diverge on where they park per-route static data (`handle` in React Router, `staticData` in TanStack Router) but agree on the merge rules — so the shared helper takes the merge rules and a getter that plucks the data field.

Semantics: iterates matches in the order given (root → leaf), deeper matches overwrite shallower ones per key, `undefined` values are skipped (so a leaf can't silently clobber an ancestor by omitting the key or setting it to `undefined`). Arrays at the data position are ignored rather than enumerated as index-keyed objects.

## Full documentation

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
