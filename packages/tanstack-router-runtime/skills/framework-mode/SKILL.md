---
name: framework-mode
description: Use when wiring @tanstack-react-modules/runtime into TanStack Router file-based mode or TanStack Start with resolveManifest, manifest.Providers, routeTree.gen, slots, zones, staticData route data, or dynamic slot recalculation.
type: framework
framework: tanstack-router
requires:
  - "@tanstack-react-modules/core"
  - "@modular-react/react"
sources:
  - ../../README.md
  - ../../../../docs/framework-mode-tanstack-router.md
  - ../../../../docs/shell-patterns-tanstack-router.md
---

# TanStack Router framework mode

Use `resolveManifest()` when the host app uses TanStack Router file-based routing or TanStack Start. TanStack Router keeps generated route trees, typed routes, and Start behavior; modular-react owns modules, slots, navigation, zones, lifecycle, and shared dependencies.

## Registry pattern

Resolve once from a shared registry module:

```ts
import { createRegistry } from "@tanstack-react-modules/runtime";
import billingModule from "./modules/billing";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
});

registry.register(billingModule);

export const manifest = registry.resolveManifest({ providers: [I18nProvider] });
```

Wrap the root route:

```tsx
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

Keep router creation with the generated tree:

```ts
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({ routeTree });
```

## Slots and zones

- Use `useNavigation()` for shell navigation.
- Use `useSlots()` for global static and dynamic slot contributions.
- Use `useZones<T>()` for component route zones stored in TanStack Router `staticData`.
- Use `useRouteData<T>()` for non-component route metadata stored in the same `staticData`.
- Subscribe stores to `manifest.recalculateSlots` only when dynamic slots or a slot filter can actually change.

## Framework-mode limits

- The TanStack manifest has no `routes` field.
- Module `createRoutes(parentRoute)` declarations are ignored in framework mode because file-based routes own the tree.
- Lazy module registration throws in framework mode because there is no runtime parent route to attach to.

## When to use `resolve()`

Use `resolve()` only for library-owned routing: plugin-host apps, runtime bundles, CSR-only internal tools, or legacy apps where losing file-based route behavior is acceptable.

## Common mistakes

- Do not call both `resolve()` and `resolveManifest()` on one registry.
- Do not recreate the registry inside React components.
- Do not expect `manifest.routes` in TanStack framework mode.
- Do not register lazy modules in framework mode.
- Do not put non-component metadata through `useZones`; use `useRouteData`.
