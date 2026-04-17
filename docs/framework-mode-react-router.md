# Framework-Mode Integration (React Router v7)

This guide shows how to use `@react-router-modules/runtime` alongside React Router v7 framework mode (`@react-router/dev/vite`). The Vite plugin owns route discovery, type generation, HMR, and SSR/client splits; the registry owns everything else — shared dependencies, slots, navigation, zones, module lifecycle.

**For a new React Router v7 app, this is the recommended path.** The alternative (`registry.resolve()`) gives up a lot.

## Framework mode vs `resolve()`

`resolve()` calls `createBrowserRouter(routes)` directly. It's the shortest path to a working app — one call and you're rendering — but you give up everything `@react-router/dev/vite` provides:

| Feature                                                       | Framework mode (`resolveManifest`) | `resolve()`          |
| ------------------------------------------------------------- | ---------------------------------- | -------------------- |
| HMR on route files                                            | ✅                                 | ❌ — full reload     |
| Generated `+types/route.ts` (typed params/loaders)            | ✅                                 | ❌                   |
| File-based route discovery (`flatRoutes()`)                   | ✅                                 | ❌ — imperative only |
| SSR / client-splits                                           | ✅                                 | ❌                   |
| `route() / index() / prefix()` ergonomics                     | ✅                                 | ❌                   |
| Library owns router creation                                  | ❌                                 | ✅                   |
| Single-file wiring (app's full shape in one `resolve()` call) | ❌                                 | ✅                   |

Pick `resolve()` only when the tradeoff genuinely favors it:

- **Plugin-host apps** where modules arrive at runtime (external bundles, remote federation) and you can't pre-declare them in `routes.ts`.
- **CSR-only tools** with no need for typed params, SSR, or route-file HMR — a tiny internal dashboard where the one-call wiring is the point.
- **Legacy React Router setups** (pre-framework-mode) that haven't migrated yet. `resolve()` exists so you don't have to migrate to use this library.

For everything else — greenfield apps, anything shipping to real users, anything that benefits from typed routes — use `resolveManifest()`. The setup is a few more lines (one `registry.ts`, one `root.tsx` wrap, one `routes.ts`), and you keep the full React Router developer experience.

Read [Getting started with React Router](getting-started-react-router.md) first for the library-agnostic tour of modules and slots. This document focuses on the integration seam.

## What `resolveManifest()` does

`resolveManifest()` returns everything the registry can assemble **without creating a router**:

```ts
interface ResolvedManifest<TSlots> {
  Providers: React.ComponentType<{ children: React.ReactNode }>;
  routes: RouteObject[];
  navigation: NavigationManifest;
  slots: TSlots;
  modules: readonly ModuleEntry[];
  recalculateSlots: () => void;
}
```

- `Providers` wraps the full modular-react context stack — shared deps, navigation, slots, modules, recalculate signal, and any `providers?` option you passed. Place it around `<Outlet />` in your root layout.
- `routes` holds any routes modules contribute via `createRoutes()`. Empty array if no module declares routes — the common case when route shape lives in `routes.ts`.
- The rest matches `resolve()`.

No `DataRouter` is created. The framework Vite plugin bootstraps the router as usual.

## The idempotent registry

`resolveManifest()` is idempotent — call it as many times as you want. The first call does the work (validation, `onRegister` hooks, route building, provider wiring) and caches the result. Later calls return the same manifest.

**Options are honored only on the first call.** Passing options on a subsequent call throws, so misconfiguration is loud instead of silently ignored. The recommended pattern is to resolve once in a shared module and import it from both `routes.ts` and `root.tsx`:

```ts
// app/registry.ts
import { createRegistry } from "@react-router-modules/runtime";
import portalModule from "./modules/portal";
import type { AppDependencies, AppSlots } from "./types";
import { I18nProvider } from "./providers/i18n";
import { authStore, httpClient } from "./services";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
  slots: { commands: [] },
});

registry.register(portalModule);

export const manifest = registry.resolveManifest({
  providers: [I18nProvider],
});
```

```ts
// app/root.tsx
import { Outlet } from "react-router"
import { manifest } from "./registry"

export default function Root() {
  return (
    <manifest.Providers>
      <Outlet />
    </manifest.Providers>
  )
}
```

```ts
// app/routes.ts
import type { RouteConfig } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";
import { route, index, prefix } from "@react-router/dev/routes";

// Routes live in framework-mode primitives — the host owns route shape.
export default [
  ...(await flatRoutes({ ignoredRouteFiles: ["portal/**"] })),
  route("portal", "routes/portal/layout.tsx", [
    index("routes/portal/index.tsx"),
    route(":workspaceId/requests", "routes/portal.workspace.requests.tsx"),
  ]),
] satisfies RouteConfig;
```

Note that nothing in `routes.ts` references the registry. That's intentional — route **shape** is declared by the host using framework primitives; the module contributes navigation, slots, zones, and lifecycle, not route file paths.

## Mixing library- and host-owned routes

A module can still return `RouteObject[]` from `createRoutes()` if it wants to. Those routes surface on `manifest.routes` and the host can mount them anywhere:

```ts
// app/routes.ts
import { manifest } from "./registry";

export default [
  ...(await flatRoutes()),
  // Mount module-contributed routes under a catch-all the host owns:
  route("plugins/*", "routes/plugins-root.tsx"),
] satisfies RouteConfig;
```

```tsx
// app/routes/plugins-root.tsx
import { useRoutes } from "react-router";
import { manifest } from "../registry";
export default function PluginsRoot() {
  return useRoutes(manifest.routes);
}
```

This is a useful pattern for plugin registries where external modules deliver routes at runtime. For modules shipped as part of the app, declare their shape in `routes.ts` instead — you keep generated types and HMR.

## Auth, 404, shell routes in framework mode

All of these move out of `resolveManifest()` options and into `routes.ts` / loaders:

| `resolve()` option    | Framework-mode equivalent                                                          |
| --------------------- | ---------------------------------------------------------------------------------- |
| `rootComponent`       | `app/root.tsx`                                                                     |
| `indexComponent`      | `index("routes/home.tsx")` in `routes.ts`                                          |
| `notFoundComponent`   | `route("*", "routes/not-found.tsx")` in `routes.ts`                                |
| `authenticatedRoute`  | `layout("routes/_auth.tsx", [...])` in `routes.ts` with a `loader` for the guard   |
| `shellRoutes`         | Regular entries in `routes.ts`, outside the auth layout                            |
| `loader` (root-level) | `loader` export in `app/root.tsx`                                                  |
| `providers`           | Still on `resolveManifest({ providers })` — applied to the context tree            |
| `slotFilter`          | Still on `resolveManifest({ slotFilter })` — applied to the dynamic-slots pipeline |

The two options that remain on `resolveManifest()` — `providers` and `slotFilter` — are about the context tree, not about routing. They stay because the `Providers` component owns them.

## Testing

`resolveManifest()` is fully testable without a router. The `Providers` component mounts the same context stack `resolve()` uses, so hooks like `useNavigation`, `useSlots`, `useModules`, and `useStore` work in tests that only render `<Providers>`:

```tsx
import { render } from "@testing-library/react";
import { createRegistry } from "@react-router-modules/runtime";
import { useNavigation } from "@modular-react/react";

const registry = createRegistry({ stores: { auth: authStore }, services: { httpClient } });
registry.register(billingModule);
const { Providers } = registry.resolveManifest();

function Probe() {
  const nav = useNavigation();
  return (
    <ul>
      {nav.items.map((i) => (
        <li key={i.label}>{i.label}</li>
      ))}
    </ul>
  );
}

const { getByText } = render(
  <Providers>
    <Probe />
  </Providers>,
);
expect(getByText("Billing")).toBeInTheDocument();
```

For tests that exercise real routing, use the existing `@react-router-modules/testing` utilities.

## Rules of thumb

- **Pick a mode early.** The registry commits on first call — mixing `resolve()` and `resolveManifest()` throws. Decide whether the library or the host owns the router before you start registering modules.
- **Resolve once.** Put `resolveManifest()` in a shared module (`app/registry.ts` or similar) and import the manifest from every callsite. The idempotency safety net exists so a slip-up is loud, not so you have a license to scatter calls.
- **Route shape in `routes.ts`, everything else in modules.** Modules still own navigation, slots, zones, lifecycle, and shared-deps requirements. They just stop declaring their own `createRoutes()` — route files live where the framework Vite plugin can find them.
- **Typed DI and startup validation.** Both work identically: `createSharedHooks<AppDependencies>()` and `requires: [...]` do what they always did. `Providers` delivers the dependency container; no router involvement.

## See also

- [Getting started with React Router](getting-started-react-router.md) — for the library-owns-router path.
- [Shell Patterns for React Router](shell-patterns-react-router.md) — module route shape, zones, auth guards.
- [`useRouteData`](shell-patterns-react-router.md#route-data-non-component-handles) — non-component route metadata (headerVariant, page titles).
- [Navigation: typed labels, dynamic hrefs, meta](navigation.md) — the full `NavigationItem` generic surface.
