# Getting started with Vue Router

This guide walks you from zero to a running modular Vue 3 + vue-router app. It
assumes you already use (or are comfortable with) Vue 3 `<script setup>` and
vue-router 4, and want to split your app into self-contained feature modules.

Two sibling docs go deeper once you're past setup:

- [Shell Patterns (Fundamentals)](shell-patterns.md) — the router-agnostic
  surface (multi-zone layouts, command slots, module-to-shell communication,
  headless modules, optional deps). **Read this first** once you want to go
  beyond the defaults.
- [Shell Patterns for Vue Router](shell-patterns-vue-router.md) — the parts that
  depend on vue-router specifically: route shape, zones via `meta`,
  `useRouteData`, and the `beforeEach` auth guard.

> **Prefer the scaffolder?** `@modular-vue/cli` (binary `modular-vue`) generates
> everything below — `modular-vue init my-app --scope @myorg --module dashboard`,
> then `modular-vue create module|store|journey`. This guide still sets the
> workspace up **by hand**, which is worth doing once regardless: it shows
> exactly what the CLI generates, and every step is a single file you write.

## Prerequisites

- **Node 22+** and **pnpm** (the workspace uses `workspace:*` deps).
- **Vue ^3.5** and **vue-router ^4.5** (decision D5 — the supported baseline).
- Familiarity with Vue's Composition API and vue-router's `RouteRecordRaw`
  shape.

You don't need an existing project; the steps below build one from an empty
directory.

### About the package manager

The workspace is a **pnpm workspace** (`pnpm-workspace.yaml` + `workspace:*`
dependencies). Yarn Berry and Bun also implement the `workspace:*` protocol and
work with minor script edits; **npm is not supported** because it doesn't.
Turborepo is orthogonal — run it on top of pnpm if you want task caching.

## Mental model

Three roles, one contract:

- **Shell** (`shell/`): the host app. Owns stores, services, the layout chrome,
  the vue-router router, the registry, and `main.ts`. The shell is where you run
  the app from.
- **Modules** (`modules/<name>/`): self-contained feature packages. Each
  declares its own routes, navigation, slot contributions, and dependencies. **A
  module never imports from the shell.**
- **app-shared** (`app-shared/`): the typed contract between the two — the
  interfaces both sides agree on.

Three contract interfaces live in `app-shared`:

- **`AppDependencies`**: the stores and services the shell provides (auth store,
  config store, an http client, …). Modules read them through typed composables.
- **`AppSlots`**: the static contributions the shell collects across every
  module (e.g. a `commands` bar).
- **`AppZones`** (optional): per-route layout regions a module can fill (e.g. a
  detail panel on the right). In vue-router these ride on the route's `meta`.

Every route-owning module's descriptor is typed as
`defineModule<AppDependencies, AppSlots>()({ … })`. That's how TypeScript catches,
at compile time, a module asking for a store the shell doesn't provide.

## 1. Create the workspace

```bash
mkdir my-app && cd my-app
pnpm init
```

Add a `pnpm-workspace.yaml`:

```yaml
# pnpm-workspace.yaml
packages:
  - "app-shared"
  - "shell"
  - "modules/*"
```

The three package families you'll create map 1:1 to the three roles above.

## 2. The contract: `app-shared`

`app-shared` is a tiny package with no runtime code — just the types every
module and the shell agree on.

```jsonc
// app-shared/package.json
{
  "name": "@myorg/app-shared",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
}
```

```ts
// app-shared/src/index.ts
export * from "./app-types.js";

// Activate the typed-`meta` augmentation (see step 6). The side-effect import
// pulls the `declare module "vue-router"` block into every consumer's type
// graph; it's erased at build time.
import "./vue-router-meta.js";
```

```ts
// app-shared/src/app-types.ts
/** Stores and services the shell provides. Modules `require` the keys they need. */
export interface AppDependencies {
  readonly auth: { readonly userId: string };
}

/** Static contributions collected from every module. */
export interface AppSlots {
  readonly commands: readonly Command[];
}

export interface Command {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
}

/** Typed route data every route contributes on its `meta`; read via `useRouteData`. */
export interface AppRouteData {
  readonly pageTitle?: string;
}
```

We'll write `vue-router-meta.ts` in step 6, once there's a route to type.

## 3. Your first module

A module is one directory that fully declares a feature. Give it its own
package under `modules/`:

```jsonc
// modules/dashboard/package.json
{
  "name": "@myorg/dashboard-module",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@myorg/app-shared": "workspace:*",
    "@modular-vue/core": "^1.0.0",
  },
  "peerDependencies": { "vue": "^3.5.0", "vue-router": "^4.5.0" },
}
```

> **The `-module` suffix** keeps module packages from colliding with the
> non-module packages you already have. It's just a convention; the shell
> imports the module by its full name.

The descriptor is a plain object. `defineModule` is an identity function that
gives it types:

```ts
// modules/dashboard/src/index.ts
import { defineModule } from "@modular-vue/core";
import type { RouteRecordRaw } from "vue-router";
import type { AppDependencies, AppSlots } from "@myorg/app-shared";
import DashboardPage from "./DashboardPage.vue";

export default defineModule<AppDependencies, AppSlots>()({
  id: "dashboard",
  version: "0.1.0",

  meta: {
    name: "Dashboard",
    description: "Dashboard module",
  },

  // A standard vue-router subtree. The runtime grafts it onto the router.
  createRoutes: (): RouteRecordRaw => ({
    path: "dashboard",
    component: DashboardPage,
    // `meta` is vue-router's per-route data channel — the analog of React
    // Router's `handle`. Zones and route data ride here; see step 6.
    meta: { pageTitle: "Dashboard" },
  }),

  // Sidebar items the shell picks up via `useNavigation()`. No manual registration.
  navigation: [{ label: "Dashboard", to: "/dashboard", group: "main", order: 10 }],

  // The registry fails fast at resolve time if `auth` isn't provided.
  requires: ["auth"],
});
```

```vue
<!-- modules/dashboard/src/DashboardPage.vue -->
<script setup lang="ts"></script>

<template>
  <h1>Dashboard</h1>
  <p>Your first module renders here.</p>
</template>
```

Field by field:

- **`createRoutes`** returns a vue-router `RouteRecordRaw` (or an array of them).
  The runtime mounts it via `router.addRoute()`. `createRoutes` is
  **optional** — headless modules (stores, commands, zones only, no routes)
  simply omit it. Use `component: () => import("./Page.vue")` for lazy,
  code-split routes.
- **`navigation`** is an array of nav items the `<Sidebar>` renders via
  `useNavigation()`.
- **`meta`** is where per-route zones and static data live (step 6).
- **`requires: ["auth"]`** declares the module's dependency on a shell-provided
  store/service. The registry throws at resolve time if `auth` is missing.

## 4. The shell

The shell owns the router and boots the app. Give it a package with the runtime
dependency:

```jsonc
// shell/package.json
{
  "name": "@myorg/shell",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite" },
  "dependencies": {
    "@myorg/app-shared": "workspace:*",
    "@myorg/dashboard-module": "workspace:*",
    "@modular-vue/runtime": "^1.0.0",
    "vue": "^3.5.0",
    "vue-router": "^4.5.0",
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "vite": "^5.0.0",
  },
}
```

The shell owns a layout route at `/` and grafts module routes underneath it, so
they render inside the chrome:

```ts
// shell/src/main.ts
import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createModularApp, createRegistry } from "@modular-vue/runtime";
import type { AppDependencies, AppSlots } from "@myorg/app-shared";
import dashboard from "@myorg/dashboard-module";
import App from "./App.vue";
import ShellLayout from "./components/ShellLayout.vue";
import Home from "./components/Home.vue";

// The registry holds the shell's stores/services and the registered modules.
const registry = createRegistry<AppDependencies, AppSlots>({
  stores: {},
  services: { auth: { userId: "demo-user" } },
  slots: { commands: [] },
});

registry.register(dashboard);

// The shell declares a layout route at "/". Module routes are grafted under the
// named "root" route via `parentRouteName`, so they mount inside `ShellLayout`.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "root",
      component: ShellLayout,
      children: [{ path: "", name: "home", component: Home }],
    },
  ],
});

// `createModularApp` resolves the registry and grafts module routes onto the
// router. The returned manifest is itself a Vue plugin.
const manifest = createModularApp(registry, { router, parentRouteName: "root" });

const app = createApp(App);
app.use(router);
// Installing the manifest wires the modular contexts (navigation, modules,
// slots, shared deps) app-wide, so every `<router-view>`-mounted component can
// inject them.
app.use(manifest);
app.mount("#app");
```

```vue
<!-- shell/src/App.vue -->
<template>
  <router-view />
</template>
```

The layout renders the chrome plus a nested `<router-view>` where module routes
mount:

```vue
<!-- shell/src/components/ShellLayout.vue -->
<script setup lang="ts">
import Sidebar from "./Sidebar.vue";
</script>

<template>
  <div style="display: grid; grid-template-columns: 220px 1fr; min-height: 100vh">
    <Sidebar />
    <main style="padding: 24px">
      <router-view />
    </main>
  </div>
</template>
```

The sidebar is built entirely from module contributions — the shell knows about
no specific module:

```vue
<!-- shell/src/components/Sidebar.vue -->
<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useNavigation } from "@modular-vue/runtime";

// `useNavigation()` returns the resolved navigation manifest — a plain value
// (it's set once at resolve time, so it isn't wrapped in a ref). Its `.groups`
// bucket the module-contributed items; the shell owns how they render.
const manifest = useNavigation();
</script>

<template>
  <nav style="border-right: 1px solid #e5e5e5; padding: 16px">
    <RouterLink to="/" style="display: block; font-weight: 600; margin-bottom: 16px">
      Home
    </RouterLink>
    <section v-for="group in manifest.groups" :key="group.group">
      <ul style="list-style: none; padding: 0; margin: 0">
        <li v-for="item in group.items" :key="item.label">
          <RouterLink :to="typeof item.to === 'string' ? item.to : '#'">
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>
    </section>
  </nav>
</template>
```

```vue
<!-- shell/src/components/Home.vue -->
<template>
  <h1>Welcome</h1>
  <p>Pick a module from the sidebar.</p>
</template>
```

With a standard `index.html` + `vite.config.ts` (using `@vitejs/plugin-vue`),
`pnpm install && pnpm --filter @myorg/shell dev` boots the app. The sidebar
shows **Dashboard**, and navigating to it renders the module's page inside the
shell chrome — with **no edits to the shell** for that module.

## 5. Add a second module

This is the payoff. Copy the `dashboard` module to `modules/billing`, change its
`id`, `path`, and nav item:

```ts
// modules/billing/src/index.ts
import { defineModule } from "@modular-vue/core";
import type { RouteRecordRaw } from "vue-router";
import type { AppDependencies, AppSlots } from "@myorg/app-shared";
import BillingPage from "./BillingPage.vue";

export default defineModule<AppDependencies, AppSlots>()({
  id: "billing",
  version: "0.1.0",
  requires: ["auth"],
  createRoutes: (): RouteRecordRaw => ({
    path: "billing",
    component: BillingPage,
    meta: { pageTitle: "Billing" },
  }),
  navigation: [{ label: "Billing", to: "/billing", group: "finance", order: 20 }],
});
```

Add `@myorg/billing-module` to `shell/package.json`, then wire it into
`main.ts` with **one line**:

```ts
import billing from "@myorg/billing-module";
// …
registry.register(billing);
```

```bash
pnpm install   # link the new workspace package — not optional
```

> **The `pnpm install` is not optional.** Without it the new workspace package
> isn't linked and the dev server can't resolve `@myorg/billing-module`.

Restart the dev server and the Billing entry appears in the sidebar, routes
render inside the shell, and its `meta` is available to any shell zone. No shell
code changed beyond the one `register(billing)` call — **the registry discovers
everything from the module descriptor.**

## 6. Zones and typed route data via `meta`

vue-router exposes arbitrary per-route data through the route's `meta` field —
the analog of React Router's `handle`. The runtime reads zones and route data
from there.

First, type `meta` against your app's shape. vue-router exposes a single global
`RouteMeta` interface as the formal augmentation point:

```ts
// app-shared/src/vue-router-meta.ts
import type {} from "vue-router";
import type { AppRouteData } from "./app-types.js";

// Extending `RouteMeta` with `AppRouteData` type-checks `meta: { … }` on every
// route against the app's shape — a typo in `pageTitle` is a compile error.
// This lives in `app-shared`, not the library, because `RouteMeta` is global:
// a library augmenting it would force its shape on every consumer. The bare
// `import type {}` pulls vue-router into the type graph and is erased at build.
declare module "vue-router" {
  interface RouteMeta extends AppRouteData {}
}

export {};
```

Now a shell zone can read the active route's data reactively:

```vue
<!-- shell/src/components/Header.vue -->
<script setup lang="ts">
import { useRouteData } from "@modular-vue/runtime";
import type { AppRouteData } from "@myorg/app-shared";

// `useRouteData` returns a `ComputedRef` — it recomputes on navigation because
// `route.matched` is reactive. In the template the top-level ref auto-unwraps.
const routeData = useRouteData<AppRouteData>();
</script>

<template>
  <h2>{{ routeData.pageTitle ?? "Welcome" }}</h2>
</template>
```

For rendering **components** into named regions (a detail panel, header actions)
rather than plain data, use `useZones<AppZones>()` — same `meta` channel, but
each value is typed as a component. See
[Shell Patterns for Vue Router](shell-patterns-vue-router.md#route-zones) for the
full zones story.

## 7. Add a store

Stores are the reactive state surface shared across modules. The framework ships
a small `createStore` (a `zustand`-shaped vanilla store — decision D3) so you
don't need a state library to get going. A dedicated Pinia-interop guide section
is a tracked follow-up of decision D3 (see the
[tracker](vue-support-tracker.md#decisions)); until it lands, anything exposing
`getState` / `setState` / `subscribe` satisfies the `Store<T>` contract.

Declare the store's **state** shape in the contract (modules see the state, not
the store instance), then implement it in the shell:

```ts
// app-shared/src/app-types.ts
export interface NotificationsState {
  readonly unreadCount: number;
}

export interface AppDependencies {
  readonly auth: { readonly userId: string };
  readonly notifications: NotificationsState; // new
}
```

The built-in `createStore` takes a plain initial state (or a factory) and is
updated with `setState` — it's a zustand-compatible `Store<T>`, not a zustand
`(set, get) => …` factory:

```ts
// shell/src/stores/notifications.ts
import { createStore } from "@modular-vue/vue";
import type { NotificationsState } from "@myorg/app-shared";

export const notificationsStore = createStore<NotificationsState>({ unreadCount: 3 });

// Actions are plain functions that call `setState` (partial-merged by default).
// Prefer colocated actions? A zustand vanilla store (`createStore` from
// `zustand/vanilla`) also satisfies `Store<T>`, so you can hand one straight
// to the registry.
export function markAllRead(): void {
  notificationsStore.setState({ unreadCount: 0 });
}
```

```ts
// shell/src/main.ts
const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { notifications: notificationsStore },
  services: { auth: { userId: "demo-user" } },
  slots: { commands: [] },
});
```

Export a typed `useStore` from `app-shared` so modules read it without importing
the shell:

```ts
// app-shared/src/composables.ts
import { createSharedComposables } from "@modular-vue/vue";
import type { AppDependencies } from "./app-types.js";

export const { useStore, useService, useReactiveService, useOptional } =
  createSharedComposables<AppDependencies>();
```

A module consumes it reactively — `useStore` returns a `Ref`:

```vue
<script setup lang="ts">
import { useStore } from "@myorg/app-shared";

// A Ref; reads the store reactively and re-renders on change.
const unread = useStore("notifications", (s) => s.unreadCount);
</script>

<template>
  <span>{{ unread }} unread</span>
</template>
```

If a module `requires: ["notifications"]` and you remove the store, the registry
throws at resolve time, before the app ever boots.

## 8. Turn on the auth guard

vue-router's native `router.beforeEach` is the idiomatic auth boundary, and the
runtime forwards one for you. Pass an `authGuard` to `createModularApp` (it reads
`to.meta`, the same channel modules populate):

```ts
// shell/src/main.ts — assuming an `authStore` created with `createStore`
const manifest = createModularApp(registry, {
  router,
  parentRouteName: "root",
  authGuard: (to) => {
    // Public routes opt out via `meta.public` (add `public?: boolean` to AppRouteData).
    if (to.meta.public) return true;
    // The guard runs outside a component, so read the store's snapshot directly.
    return authStore.getState().isAuthenticated ? true : { name: "login" };
  },
});
```

Declare public routes (login, signup) on the shell's own route table, outside
the module-route parent, so the guard's redirect target exists:

```ts
routes: [
  { path: "/login", name: "login", component: LoginPage }, // public
  {
    path: "/",
    name: "root",
    component: ShellLayout,
    children: [{ path: "", name: "home", component: Home }],
  },
];
```

The guard runs before every navigation; returning a route location redirects,
returning `true` allows. See
[Shell Patterns for Vue Router](shell-patterns-vue-router.md#auth-guard) for
per-route and role-based variants.

## Where to go next

- [Shell Patterns (Fundamentals)](shell-patterns.md) — the router-agnostic
  surface: multi-zone layouts, command palette, module-to-shell communication,
  headless modules, optional deps. **Read this first.**
- [Shell Patterns for Vue Router](shell-patterns-vue-router.md) — route shape,
  zones via `meta`, `useRouteData`, `beforeEach` auth, framework mode vs. the
  router-owning path.
- [Navigation: typed labels, dynamic hrefs, meta](navigation.md) — narrow nav
  labels to i18n keys, dynamic hrefs, per-item metadata.
- [Journeys](../packages/journeys/README.md) and
  [Compositions](../packages/compositions/README.md) — compose several modules
  into a typed workflow or a shared multi-zone screen (both have Vue bindings:
  `@modular-vue/journeys`, `@modular-vue/compositions`).
- Working examples: [`examples/vue/`](../examples/vue) ships three runnable apps
  — `integration-manager` (sibling modules sharing a screen),
  `customer-onboarding-journey` (a persisted journey), and `editor-composition`
  (a multi-zone composition).
