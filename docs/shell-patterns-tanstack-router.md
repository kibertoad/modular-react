# Shell Patterns for TanStack Router

Router-specific additions to [Shell Patterns (Fundamentals)](shell-patterns.md) for apps built with `@tanstack-react-modules/*`. Read the fundamentals guide first; this document only covers the parts that depend on TanStack Router.

## Module routes

A module's `createRoutes` receives a `parentRoute` and returns a route built via TanStack Router's `createRoute`. You use `getParentRoute: () => parentRoute` to graft your subtree onto whatever the runtime passes in (the auth boundary for protected modules, or the root for public ones).

```typescript
// modules/billing/src/index.ts
import { defineModule } from "@tanstack-react-modules/core";
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { AppDependencies, AppSlots } from "@myorg/app-shared";

export default defineModule<AppDependencies, AppSlots>({
  id: "billing",
  version: "1.0.0",
  requires: ["auth", "httpClient"],

  createRoutes: (parentRoute) => {
    const billingRoot = createRoute({
      getParentRoute: () => parentRoute,
      path: "billing",
      component: lazyRouteComponent(() => import("./pages/BillingRoot.js")),
    });

    const dashboard = createRoute({
      getParentRoute: () => billingRoot,
      path: "/",
      component: lazyRouteComponent(() => import("./pages/Dashboard.js")),
    });

    const invoiceDetail = createRoute({
      getParentRoute: () => billingRoot,
      path: "invoices/$invoiceId",
      component: lazyRouteComponent(() => import("./pages/InvoiceDetail.js")),
    });

    return billingRoot.addChildren([dashboard, invoiceDetail]);
  },
});
```

## Route Zones

TanStack Router exposes per-route metadata through `staticData`. The modular-react runtime reads zones from there: any component placed on a matched route's `staticData` is surfaced by `useZones()`.

### Declaring zones on a route

```typescript
import { createRoute } from "@tanstack/react-router";
import { UserDetailPage } from "./pages/UserDetailPage.js";
import { UserDetailSidebar } from "./components/UserDetailSidebar.js";
import { UserDetailActions } from "./components/UserDetailActions.js";

const userDetail = createRoute({
  getParentRoute: () => usersRoot,
  path: "$userId",
  component: UserDetailPage,
  staticData: {
    detailPanel: UserDetailSidebar,
    headerActions: UserDetailActions,
  },
});
```

### Type-safe staticData

TanStack Router ships a module-augmentation slot for `staticData`. Declare your zones once in `app-shared` and augment `StaticDataRouteOption` so `createRoute({ staticData: { ... } })` is checked at compile time:

```typescript
// app-shared/src/index.ts
import type { ComponentType } from "react";

export interface AppZones {
  detailPanel?: ComponentType;
  headerActions?: ComponentType;
}

declare module "@tanstack/router-core" {
  interface StaticDataRouteOption extends AppZones {}
}
```

The shell reads them via the generic on `useZones`:

```typescript
import { useZones } from "@tanstack-react-modules/runtime";
import type { AppZones } from "@myorg/app-shared";

function Layout() {
  const zones = useZones<AppZones>();
  const DetailPanel = zones.detailPanel;
  // ...
}
```

Deeper routes override shallower ones: if a billing section root sets `staticData.detailPanel = BillingSidebar` and the invoice detail page sets `staticData.detailPanel = InvoiceSidebar`, the detail page wins while it is active.

## Route data (non-component staticData)

`useZones` enforces `ComponentType | undefined` on every zone value — a useful rail 95% of the time, but it gets in the way for non-component route metadata: header variant enums, page titles, analytics event names, per-route feature flags. `useRouteData` is the relaxed-typing counterpart: same deepest-wins merge over `staticData`, no constraint on value types.

Two hooks, two channels, same `staticData` object:

```typescript
// app-shared/src/index.ts
import type { ComponentType } from "react";

export interface AppZones {
  HeaderActions?: ComponentType;
  DetailPanel?: ComponentType;
}

export interface AppRouteData {
  headerVariant?: "portal" | "project" | "setup";
  pageTitle?: string;
}
```

A route can contribute to both:

```typescript
import { createRoute } from "@tanstack/react-router";

const projectDetail = createRoute({
  getParentRoute: () => root,
  path: "project",
  component: ProjectPage,
  staticData: {
    HeaderActions: ProjectActions, // → useZones<AppZones>()
    headerVariant: "project" as const, // → useRouteData<AppRouteData>()
    pageTitle: "Project", // → useRouteData<AppRouteData>()
  },
});
```

The shell reads each channel with its own typing:

```typescript
import { useZones, useRouteData } from "@tanstack-react-modules/runtime"
import type { AppZones, AppRouteData } from "@myorg/app-shared"

function Shell() {
  const { HeaderActions, DetailPanel } = useZones<AppZones>()
  const { headerVariant, pageTitle } = useRouteData<AppRouteData>()

  return (
    <>
      <AppShell.Header
        variant={headerVariant}
        title={pageTitle}
        actions={HeaderActions ? <HeaderActions /> : undefined}
      />
      <main><Outlet /></main>
      {DetailPanel && <aside><DetailPanel /></aside>}
    </>
  )
}
```

Merge semantics match `useZones` exactly: walks matched routes root-to-leaf, deepest match wins per key, `undefined` values at a deeper level don't clobber an ancestor's value.

When to use which:

- **`useZones`** — values the shell will render as JSX. Strict component typing catches mistakes at compile time.
- **`useRouteData`** — anything else. Strings, enums, numbers, config objects. No component constraint.

> TanStack Router's `StaticDataRouteOption` is augmented to the shape you declared for `AppZones`. If you want route-time validation of `useRouteData` keys too, widen the augmentation to include `AppRouteData`:
>
> ```ts
> declare module "@tanstack/router-core" {
>   interface StaticDataRouteOption extends AppZones, AppRouteData {}
> }
> ```
>
> Because TypeScript merges these at declaration time, **`AppZones` and `AppRouteData` must not share any keys** — a collision turns into a merged-interface conflict and `createRoute({ staticData: { ... } })` will stop type-checking at call sites you didn't touch. Keep zone keys distinct from route-data keys (the conventional split is PascalCase for components, camelCase for data) and you're fine. The runtime hooks don't require the augmentation — they read whatever `staticData` carries, so you can skip the augmentation entirely and rely on the generic on `useRouteData<AppRouteData>()` alone.

## Auth Guard Pattern

The runtime follows TanStack Router's recommended `_authenticated` layout route pattern. Use `authenticatedRoute` on `registry.resolve()` to create a pathless layout that guards protected routes, and use `shellRoutes` for anything public that must sit outside that boundary (login, signup, marketing pages).

### Layout route as auth boundary (recommended)

```typescript
import { createRegistry } from "@tanstack-react-modules/runtime";
import { createRoute, redirect } from "@tanstack/react-router";
import billing from "./modules/billing";
import users from "./modules/users";
import RootLayout from "./components/RootLayout";
import ShellLayout from "./components/ShellLayout";
import DashboardPage from "./pages/Dashboard";
import LoginPage from "./pages/Login";
import SignupPage from "./pages/Signup";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
});

registry.register(billing);
registry.register(users);

const { App } = registry.resolve({
  rootComponent: RootLayout,
  indexComponent: DashboardPage,

  // Runs for ALL routes (including /login): observability, not auth
  beforeLoad: ({ location }) => {
    analytics.trackPageView(location.pathname);
  },

  // Auth boundary: guards module routes and the index
  authenticatedRoute: {
    beforeLoad: async () => {
      const res = await fetch("/api/auth/session");
      if (!res.ok) throw redirect({ to: "/login" });
    },
    component: ShellLayout, // optional; defaults to <Outlet />
  },

  // Public routes: outside the auth boundary
  shellRoutes: (root) => [
    createRoute({ getParentRoute: () => root, path: "/login", component: LoginPage }),
    createRoute({ getParentRoute: () => root, path: "/signup", component: SignupPage }),
  ],
});
```

This produces the route tree:

```
Root (beforeLoad: observability, runs for all routes)
├── /login (public, no auth guard)
├── /signup (public, no auth guard)
└── _authenticated (layout; auth guard protects children)
    ├── / (DashboardPage)
    └── /billing, /users, …  (module routes)
```

The separation is structural: the root `beforeLoad` runs everywhere (observability, feature flags) while `authenticatedRoute.beforeLoad` is strictly for auth.

> Note the casing: `authenticatedRoute.component` is lowercase (matching TanStack Router's `createRoute({ component: ... })`). This differs from the React Router equivalent, which uses `Component`.

### Per-module or role-based guards

For per-module auth or role-based access, put `beforeLoad` directly on a module-owned route:

```typescript
import { createRoute, redirect } from "@tanstack/react-router";
import { authStore } from "@myorg/app-shared/stores";

export default defineModule<AppDependencies, AppSlots>({
  id: "admin",
  createRoutes: (parentRoute) => {
    const root = createRoute({
      getParentRoute: () => parentRoute,
      path: "admin",
      beforeLoad: () => {
        // Access auth store directly; beforeLoad runs outside React
        const { role } = authStore.getState();
        if (role !== "admin") throw redirect({ to: "/" });
      },
    });
    // ... child routes
    return root.addChildren([
      /* ... */
    ]);
  },
});
```

`beforeLoad` runs outside the React tree, so you access stores via `store.getState()` rather than hooks.

## createRoutes signature summary

| Aspect                 | TanStack Router                                                  |
| ---------------------- | ---------------------------------------------------------------- |
| Return type            | `AnyRoute` (built via `createRoute` + `addChildren`)             |
| Parent argument        | `parentRoute: AnyRoute`: use `getParentRoute: () => parentRoute` |
| Code splitting         | `component: lazyRouteComponent(() => import('./Page.js'))`       |
| Zone declaration       | `staticData: { ... }` on `createRoute` options                   |
| Route-level auth guard | `beforeLoad: () => { throw redirect({ to: '/' }) }`              |

## See also

- [Shell Patterns (Fundamentals)](shell-patterns.md): the router-agnostic foundation.
- [Shell Patterns for React Router](shell-patterns-react-router.md): the same patterns, expressed against React Router's API.
- [Workspace Patterns](workspace-patterns.md): tabbed workspaces and descriptor-level zones.
- `@tanstack-react-modules/runtime` package README: `dynamicSlots`, `recalculateSlots`, `slotFilter`.
