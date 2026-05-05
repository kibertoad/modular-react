---
name: framework-mode
description: Use when wiring @react-router-modules/runtime into React Router v7 framework mode with resolveManifest, manifest.Providers, flatRoutes, slots, zones, handle route data, or dynamic slot recalculation.
type: framework
framework: react-router
requires:
  - "@react-router-modules/core"
  - "@modular-react/react"
sources:
  - ../../README.md
  - ../../../../docs/framework-mode-react-router.md
  - ../../../../docs/shell-patterns-react-router.md
---

# React Router framework mode

Use `resolveManifest()` when the host app uses React Router v7 framework mode through `@react-router/dev/vite`. React Router keeps routes, HMR, generated route types, SSR, and client/server splits; modular-react owns modules, slots, navigation, zones, lifecycle, and shared dependencies.

## Registry pattern

Resolve once from a shared registry module:

```ts
import { createRegistry } from "@react-router-modules/runtime";
import billingModule from "./modules/billing";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
});

registry.register(billingModule);

export const manifest = registry.resolveManifest({ providers: [I18nProvider] });
```

Wrap the framework root:

```tsx
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

Keep route discovery in `app/routes.ts`:

```ts
import { flatRoutes } from "@react-router/fs-routes";

export default [...(await flatRoutes())] satisfies RouteConfig;
```

## Slots and zones

- Use `useNavigation()` for shell navigation.
- Use `useSlots()` for global static and dynamic slot contributions.
- Use `useZones<T>()` for component route zones stored in React Router `handle`.
- Use `useRouteData<T>()` for non-component route metadata stored in the same `handle`.
- Subscribe stores to `manifest.recalculateSlots` only when dynamic slots or a slot filter can actually change.

## When to use `resolve()`

Use `resolve()` only for library-owned routing: plugin-host apps, runtime bundles, CSR-only internal tools, or legacy apps where losing framework-mode behavior is acceptable.

## Common mistakes

- Do not call both `resolve()` and `resolveManifest()` on one registry.
- Do not recreate the registry inside React components.
- Do not use `resolve()` in framework mode; it gives up file-based route behavior and SSR.
- Do not put non-component metadata through `useZones`; use `useRouteData`.
- Do not expect the shell to know each module route. The shell registers modules and reads the manifest.
