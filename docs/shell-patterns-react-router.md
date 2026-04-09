# Shell Patterns for React Router

Router-specific additions to [Shell Patterns (Fundamentals)](shell-patterns.md) for apps built with `@react-router-modules/*`. Read the fundamentals guide first; this document only covers the parts that depend on React Router.

## Module routes

A module's `createRoutes` returns `RouteObject[]` (or a single `RouteObject`). There is no parent argument: React Router route objects are plain data, and the runtime nests them under the root automatically.

```typescript
// modules/billing/src/index.ts
import { defineModule } from "@react-router-modules/core";
import type { RouteObject } from "react-router";
import type { AppDependencies, AppSlots } from "@myorg/app-shared";

export default defineModule<AppDependencies, AppSlots>({
  id: "billing",
  version: "1.0.0",
  requires: ["auth", "httpClient"],

  createRoutes: (): RouteObject[] => [
    {
      path: "billing",
      lazy: () => import("./pages/BillingRoot.js").then((m) => ({ Component: m.default })),
      children: [
        {
          index: true,
          lazy: () => import("./pages/Dashboard.js").then((m) => ({ Component: m.default })),
        },
        {
          path: "invoices/:invoiceId",
          lazy: () => import("./pages/InvoiceDetail.js").then((m) => ({ Component: m.default })),
        },
      ],
    },
  ],
});
```

Use `lazy: () => import(...)` for per-route code splitting. React Router handles the promise and resolves `Component`, `loader`, `action`, and `handle` from the imported module.

## Route Zones

React Router exposes arbitrary per-route metadata via the `handle` field on `RouteObject`. The modular-react runtime reads zones from there: any component placed on a matched route's `handle` is surfaced by `useZones()`.

### Declaring zones on a route

```typescript
import type { RouteObject } from "react-router";
import { UserDetailPage } from "./pages/UserDetailPage.js";
import { UserDetailSidebar } from "./components/UserDetailSidebar.js";
import { UserDetailActions } from "./components/UserDetailActions.js";

const userDetail: RouteObject = {
  path: "users/:userId",
  Component: UserDetailPage,
  handle: {
    detailPanel: UserDetailSidebar,
    headerActions: UserDetailActions,
  },
};
```

### Type-safe handle

`RouteObject.handle` is typed as `unknown` by default. Constrain it by declaring your zone shape once in `app-shared` and narrowing at the call site:

```typescript
// app-shared/src/index.ts
import type { ComponentType } from "react";

export interface AppZones {
  detailPanel?: ComponentType;
  headerActions?: ComponentType;
}
```

The shell reads them via the generic on `useZones`:

```typescript
import { useZones } from "@react-router-modules/runtime";
import type { AppZones } from "@myorg/app-shared";

function Layout() {
  const zones = useZones<AppZones>();
  const DetailPanel = zones.detailPanel;
  // ...
}
```

Deeper routes override shallower ones: if the billing section root sets `handle.detailPanel = BillingSidebar` and the invoice detail page sets `handle.detailPanel = InvoiceSidebar`, the detail page wins while it is active.

## Auth Guard Pattern

The runtime follows React Router's recommended layout-route approach for auth boundaries. Use `authenticatedRoute` on `registry.resolve()` to create a pathless layout that guards protected routes, and use `shellRoutes` for anything public that must sit outside that boundary (login, signup, marketing pages).

### Layout route as auth boundary (recommended)

```typescript
import { createRegistry } from "@react-router-modules/runtime";
import { redirect } from "react-router";
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
  loader: async ({ request }) => {
    analytics.trackPageView(new URL(request.url).pathname);
    return null;
  },

  // Auth boundary: guards module routes and the index
  authenticatedRoute: {
    loader: async () => {
      const res = await fetch("/api/auth/session");
      if (!res.ok) throw redirect("/login");
      return null;
    },
    Component: ShellLayout, // optional; defaults to <Outlet />
  },

  // Public routes: outside the auth boundary
  shellRoutes: () => [
    { path: "/login", Component: LoginPage },
    { path: "/signup", Component: SignupPage },
  ],
});
```

This produces the route tree:

```
Root (loader: observability, runs for all routes)
├── /login (public, no auth guard)
├── /signup (public, no auth guard)
└── _authenticated (layout; auth guard protects children)
    ├── / (DashboardPage)
    └── /billing, /users, …  (module routes)
```

The separation is structural: the root `loader` runs everywhere (observability, feature flags) while `authenticatedRoute.loader` is strictly for auth.

> Note the casing: `authenticatedRoute.Component` is capitalized (matching React Router's `RouteObject.Component`).

### Per-module or role-based guards

For per-module auth or role-based access, put a `loader` directly on the module's route:

```typescript
import { redirect } from "react-router";
import { authStore } from "@myorg/app-shared/stores";

export default defineModule<AppDependencies, AppSlots>({
  id: "admin",
  createRoutes: () => [
    {
      path: "admin",
      loader: () => {
        // Access auth store directly; loaders run outside React
        const { role } = authStore.getState();
        if (role !== "admin") throw redirect("/");
        return null;
      },
      children: [
        // ... admin pages
      ],
    },
  ],
});
```

`loader` runs outside the React tree, so you access stores via `store.getState()` rather than hooks.

## createRoutes signature summary

| Aspect                 | React Router                                                              |
| ---------------------- | ------------------------------------------------------------------------- |
| Return type            | `RouteObject \| RouteObject[]`                                            |
| Parent argument        | None; the runtime grafts your routes onto the auth boundary               |
| Code splitting         | `lazy: () => import('./Page.js').then((m) => ({ Component: m.default }))` |
| Zone declaration       | `handle: { ... }` on the route object                                     |
| Route-level auth guard | `loader: () => { throw redirect('/') }`                                   |

## See also

- [Shell Patterns (Fundamentals)](shell-patterns.md): the router-agnostic foundation.
- [Shell Patterns for TanStack Router](shell-patterns-tanstack-router.md): the same patterns, expressed against TanStack Router's API.
- [Workspace Patterns](workspace-patterns.md): tabbed workspaces and descriptor-level zones.
- `@react-router-modules/runtime` package README: `dynamicSlots`, `recalculateSlots`, `slotFilter`.
