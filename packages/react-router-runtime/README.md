# @react-router-modules/runtime

Application assembly layer for modular-react (React Router integration). Takes modules and configuration, produces a running app — either with the library-owned router (`resolve()`) or wrapped around `@react-router/dev/vite` framework mode (`resolveManifest()`).

## Installation

```bash
npm install @react-router-modules/runtime
```

## What's included

- **Registry**: `createRegistry` — assembles modules. Two entry points:
  - `resolve(options)` — library owns the router. Returns `{ App, router, navigation, slots, modules, recalculateSlots }`. Single-use.
  - `resolveManifest(options)` — host owns the router (framework mode). Returns `{ Providers, routes, navigation, slots, modules, recalculateSlots }`. Idempotent.
- **Zones**: `useZones` (component zones from matched routes), `useActiveZones` (merges route zones with active-module zones), `useRouteData` (non-component route metadata — headerVariant, page titles, etc.).
- **Types**: `ModuleRegistry`, `ResolveOptions`, `ResolveManifestOptions`, `RegistryConfig`, `ApplicationManifest`, `ResolvedManifest`.
- **Re-exported from `@modular-react/core`**: `buildSlotsManifest`, `collectDynamicSlotFactories`, `evaluateDynamicSlots`, `buildNavigationManifest`, `validateNoDuplicateIds`, `validateDependencies`, `NavigationGroup`, `NavigationManifest`, `ModuleEntry`, `DynamicSlotFactory`, `SlotFilter`.
- **Re-exported from `@modular-react/react`**: `useNavigation`, `useSlots`, `useRecalculateSlots`, `useModules`, `getModuleMeta`, `ModuleErrorBoundary`, `NavigationContext`, `SlotsContext`, `RecalculateSlotsContext`, `ModulesContext`, `DynamicSlotsProvider`, `createSlotsSignal`.

## Framework mode (recommended for new apps)

`resolveManifest()` is the path for apps shipping with `@react-router/dev/vite`. You keep file-based `routes.ts`, generated `+types/route.ts`, HMR on route files, SSR, and client/server splits. The registry owns modules, navigation, slots, zones, and shared deps; the framework Vite plugin owns routing.

```typescript
// app/registry.ts — resolve once, import from both sites
import { createRegistry } from "@react-router-modules/runtime";
import portalModule from "./modules/portal";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
});

registry.register(portalModule);

export const manifest = registry.resolveManifest({ providers: [I18nProvider] });
```

```tsx
// app/root.tsx
import { Outlet } from "react-router";
import { manifest } from "./registry";

export default function Root() {
  return (
    <manifest.Providers>
      <Outlet />
    </manifest.Providers>
  );
}
```

```typescript
// app/routes.ts — host owns route shape
import { flatRoutes } from "@react-router/fs-routes";
export default [...(await flatRoutes())] satisfies RouteConfig;
```

`resolveManifest()` is idempotent — calling it from `routes.ts` and `root.tsx` both returns the same cached manifest. Module `onRegister` hooks run exactly once. Modules contribute navigation, slots, zones, and shared-deps requirements as usual; route shape lives in `routes.ts` using framework primitives. See [framework-mode-react-router.md](../../docs/framework-mode-react-router.md) for the full guide.

## `resolve()` — library owns the router

`resolve()` calls `createBrowserRouter` directly. It gives up HMR on route files, generated `+types/route.ts`, SSR, and file-based discovery — you register every route imperatively. Useful when any of these are the point:

- Plugin-host apps where modules arrive at runtime (external bundles, remote federation).
- CSR-only internal tools where single-call wiring outweighs typed routes + HMR.
- Legacy React Router setups predating framework mode.

```typescript
import { createRegistry } from "@react-router-modules/runtime";
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

authStore.subscribe((state, prev) => {
  if (state.isAuthenticated !== prev.isAuthenticated) recalculateSlots();
});
```

`resolve()` is single-use — call it once; a second call throws. It can't be mixed with `resolveManifest()` (the registry commits on first call).

## `useRouteData` for non-component route metadata

`useZones<T>()` enforces `ComponentType | undefined` on every zone value. `useRouteData<T>()` is the relaxed-typing counterpart — same deepest-wins merge over `handle`, no constraint on values:

```typescript
import { useZones, useRouteData } from "@react-router-modules/runtime";

function Shell() {
  const { HeaderActions } = useZones<AppZones>();
  const { headerVariant, pageTitle } = useRouteData<AppRouteData>();
  // headerVariant is "portal" | "project" | undefined; pageTitle is string | undefined.
}
```

A single route can contribute to both channels — declare components in `handle` keyed as `useZones` expects, non-component metadata keyed as `useRouteData` expects. The hooks read the same match object; each exposes only the keys declared in its generic.

## Dynamic slots and slot filters

Modules can contribute conditional slot entries via `dynamicSlots` and trigger re-evaluation from components via `useRecalculateSlots()`. The shell can apply cross-cutting filters via `slotFilter` on `resolve()` or `resolveManifest()`.

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
