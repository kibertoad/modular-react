# @tanstack-react-modules/runtime

Application assembly layer for modular-react (TanStack Router integration). Takes modules and configuration, produces a running app — either with the library-owned router (`resolve()`) or wrapped around TanStack Router file-based mode / TanStack Start (`resolveManifest()`).

## Installation

```bash
npm install @tanstack-react-modules/runtime
```

## What's included

- **Registry**: `createRegistry` — assembles modules. Two entry points:
  - `resolve(options)` — library owns the router. Returns `{ App, router, navigation, slots, modules, recalculateSlots }`. Single-use.
  - `resolveManifest(options)` — host owns the router (framework mode / TanStack Start). Returns `{ Providers, navigation, slots, modules, recalculateSlots }`. Idempotent.
- **Zones**: `useZones` (component zones from matched route `staticData`), `useActiveZones` (merges route zones with active module zones), `useRouteData` (non-component route metadata — headerVariant, page titles, etc.).
- **Types**: `ModuleRegistry`, `ResolveOptions`, `ResolveManifestOptions`, `RegistryConfig`, `ApplicationManifest`, `ResolvedManifest`.
- **Re-exported from `@modular-react/core`**: `buildSlotsManifest`, `collectDynamicSlotFactories`, `evaluateDynamicSlots`, `buildNavigationManifest`, `validateNoDuplicateIds`, `validateDependencies`, `NavigationGroup`, `NavigationManifest`, `ModuleEntry`, `DynamicSlotFactory`, `SlotFilter`.
- **Re-exported from `@modular-react/react`**: `useNavigation`, `useSlots`, `useRecalculateSlots`, `useModules`, `getModuleMeta`, `ModuleErrorBoundary`, `NavigationContext`, `SlotsContext`, `RecalculateSlotsContext`, `ModulesContext`, `DynamicSlotsProvider`, `createSlotsSignal`.

## Framework mode (TanStack Router file-based routing & TanStack Start)

`resolveManifest()` is the path for apps shipping with `@tanstack/router-plugin` (generated `routeTree.gen.ts`) or **TanStack Start**. You keep file-based route discovery, generated types, and — with Start — SSR and server functions. The registry owns modules, navigation, slots, zones, and shared deps; the framework plugin owns routing.

```typescript
// app/registry.ts — resolve once, import from every consumer site
import { createRegistry } from "@tanstack-react-modules/runtime";
import portalModule from "./modules/portal";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
});

registry.register(portalModule);

export const manifest = registry.resolveManifest({ providers: [I18nProvider] });
```

```tsx
// app/routes/__root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { manifest } from "../registry";

export const Route = createRootRoute({
  component: () => (
    <manifest.Providers>
      <Outlet />
    </manifest.Providers>
  ),
});
```

```typescript
// app/router.ts — host owns createRouter
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({ routeTree, defaultPreload: "intent" });
```

`resolveManifest()` is idempotent — calling it from multiple entry points all returns the same cached manifest. Module `onRegister` hooks run exactly once. Modules contribute navigation, slots, zones, and shared-deps requirements as usual; route shape lives in your `routes/` directory using TanStack Router file conventions. See [framework-mode-tanstack-router.md](../../docs/framework-mode-tanstack-router.md) for the full guide, including TanStack Start specifics.

> **No `routes` field on the manifest.** Unlike the React Router counterpart, module `createRoutes(parentRoute)` produces a route whose parent is bound at construction time — it can't be spread into a host's already-composed file-based tree. In framework mode the host owns route composition, module `createRoutes` declarations are silently ignored, and modules contribute only navigation/slots/zones/lifecycle. Modules can be written once and work under either mode.

> **Lazy modules throw in framework mode.** `registerLazy()` produces a catch-all route under a parent at load time — there is no parent in framework mode, so a registry with any lazy modules throws on `resolveManifest()`. Register eagerly with a `lazyRouteComponent()` inside `createRoutes()`, or switch to `resolve()`. In `resolve()` mode a lazy module's loaded `component` is rendered at `basePath/$`; `createRoutes` on a lazily-loaded descriptor is not supported because TanStack's route tree is frozen at `createRouter` time.

## `resolve()` — library owns the router

`resolve()` calls `createRouter({ routeTree })` directly on an imperatively-built tree. It gives up file-based route discovery, generated route types, and (with Start) SSR — you register every route imperatively. Useful when any of these are the point:

- Plugin-host apps where modules arrive at runtime (external bundles, remote federation).
- CSR-only internal tools where single-call wiring outweighs file-based ergonomics.
- Legacy setups predating file-based routing / Start.

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

`resolve()` is single-use — call it once; a second call throws. It can't be mixed with `resolveManifest()` (the registry commits on first call).

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

Modules can contribute conditional slot entries via `dynamicSlots` and trigger re-evaluation from components via `useRecalculateSlots()`. The shell can apply cross-cutting filters via `slotFilter` on `resolve()` or `resolveManifest()`.

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
