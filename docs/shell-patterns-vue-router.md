# Shell Patterns for Vue Router

Router-specific additions to [Shell Patterns (Fundamentals)](shell-patterns.md).
Read the fundamentals guide first; this document only covers the parts that
depend on vue-router — route shape, zones and route data via `meta`, the auth
guard, and the two ways a shell can hand the runtime its router.

If you're starting from scratch, work through
[Getting started with Vue Router](getting-started-vue-router.md) first; this doc
picks up where that leaves off.

## Two integration modes

vue-router registers routes at runtime (`router.addRoute()`), so — unlike the
React adapters, which compose a route _tree_ — the Vue runtime always grafts
routes onto a router the shell already created. There are two shapes for that,
and they differ only in **who owns the app root**:

| Mode               | Entry                                                               | Who owns the root component                      | Providers                                  | Lazy modules                             |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ | ---------------------------------------- |
| **Router-owning**  | `registry.resolve(options)` / `createModularApp(registry, options)` | Your component rendering `<router-view>`         | Installed app-wide via `app.use(manifest)` | Fully wired (`resolve()` has the router) |
| **Framework mode** | `registry.resolveManifest(options)`                                 | You wrap `<router-view>` in `manifest.Providers` | A `Providers` component you mount          | Eager routes only                        |

The **router-owning** path is the one the getting-started guide uses — the
manifest is itself a Vue plugin, so `app.use(manifest)` wires every modular
context in one line, and you pass the router (and the auth guard) straight to
`resolve()`:

```ts
const router = createRouter({ history: createWebHistory(), routes: shellRoutes });
const manifest = createModularApp(registry, { router, parentRouteName: "root", authGuard });

const app = createApp(App);
app.use(router);
app.use(manifest); // provides navigation / modules / slots / shared deps app-wide
app.mount("#app");
```

**Framework mode** suits shells that want to keep every provider inside the Vue
tree (so app-level providers like i18n or a query client can wrap them). You
spread the eager module routes into your own `createRouter`, and wrap
`<router-view>` in the `Providers` component the manifest hands back:

```ts
import { createApp, defineComponent, h } from "vue";
import { createRouter, createWebHistory, RouterView } from "vue-router";

const manifest = registry.resolveManifest();

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/", component: Layout }, ...manifest.routes],
});

const Root = defineComponent({
  name: "Root",
  setup: () => () => h(manifest.Providers, null, () => h(RouterView)),
});

createApp(Root).use(router).mount("#app");
```

Framework mode is also where the journeys and compositions plugins thread their
own providers automatically (`manifest.Providers` includes them), which is why
the journey and composition examples use it. See
[Journeys](../packages/journeys/README.md) and
[Compositions](../packages/compositions/README.md).

## Module routes

A module's `createRoutes` returns a vue-router `RouteRecordRaw` (or an array of
them). The runtime grafts it onto the live router — under a named parent route
when you pass `parentRouteName`, otherwise at the top level.

```ts
import { defineModule } from "@modular-vue/core";
import type { RouteRecordRaw } from "vue-router";

export default defineModule<AppDependencies, AppSlots>()({
  id: "billing",
  version: "1.0.0",
  createRoutes: (): RouteRecordRaw => ({
    path: "billing",
    component: () => import("./pages/BillingRoot.vue"), // lazy, code-split
    children: [
      { path: "", component: () => import("./pages/Dashboard.vue") },
      { path: "invoices/:invoiceId", component: () => import("./pages/InvoiceDetail.vue") },
    ],
  }),
});
```

- Use `component: () => import("./Page.vue")` for a lazy, code-split route —
  vue-router resolves the async component on first visit.
- A child with `path: ""` is the index route (vue-router's analog of React
  Router's `index: true`).
- `createRoutes` is optional; a **headless module** (stores/commands/zones only)
  omits it.

## Route zones

Zones are components a module contributes into named layout regions the shell
owns — a detail panel, header actions. vue-router carries arbitrary per-route
data on the route's `meta` field (the analog of React Router's `handle`), and
the runtime reads zones from there.

### Declaring zones on a route

Put the component on the route's `meta`:

```ts
createRoutes: (): RouteRecordRaw => ({
  path: "users/:userId",
  component: UserDetailPage,
  meta: {
    detailPanel: UserDetailSidebar,
    headerActions: UserDetailActions,
  },
}),
```

The shell reads them with `useZones`, passing its zone-shape alias:

```vue
<script setup lang="ts">
import { useZones } from "@modular-vue/runtime";
import type { AppZones } from "@myorg/app-shared";

// `useZones` returns a `ComputedRef<Partial<AppZones>>`; it recomputes on
// navigation because `route.matched` is reactive.
const zones = useZones<AppZones>();
</script>

<template>
  <component :is="zones.detailPanel" v-if="zones.detailPanel" />
</template>
```

Zones merge across the matched route chain **deepest-wins** per key — a deeper
route overrides a shallower one for the same zone. An `undefined` value at a
deeper level doesn't clobber an ancestor's value; set a key to `null` to
explicitly clear an inherited one. The runtime logs a deduped `console.warn` in
dev when a deeper route overrides a zone.

### Type-safe `meta`

Declare the zone shape once in `app-shared` and type the whole `meta` channel
through vue-router's global `RouteMeta` augmentation:

```ts
// app-shared/src/app-types.ts
import type { UiComponent } from "@modular-frontend/core";

export interface AppZones {
  detailPanel?: UiComponent;
  headerActions?: UiComponent;
}

export interface AppRouteData {
  headerVariant?: "portal" | "project" | "setup";
  pageTitle?: string;
}
```

> **Why `UiComponent`, not vue's `Component`?** `useZones<AppZones>()` constrains
> each zone value to the framework-neutral `UiComponent`
> (`(props) => any | new (props) => any`) so the merge logic stays shared across
> bindings. A `<script setup>` SFC's default export satisfies it; vue's broader
> `Component` union (which includes plain options objects) does not, so typing a
> zone as `Component` fails the `useZones` type constraint. Use `UiComponent` for
> component zones and keep plain data (`pageTitle`, flags) in `AppRouteData`.

```ts
// app-shared/src/vue-router-meta.ts
import type {} from "vue-router";
import type { AppZones, AppRouteData } from "./app-types.js";

declare module "vue-router" {
  interface RouteMeta extends AppZones, AppRouteData {}
}

export {};
```

> **vue-router types `meta` at the source — a compile-time win.** vue-router
> ships a global `RouteMeta` interface expressly as a module-augmentation point,
> so once you extend it, every `meta: { … }` on every route is checked against
> your app's shape (a typo in `pageTitle`, a wrong type on a zone — all caught
> at compile time). This is stronger than the React Router adapter, where
> `handle` is typed `unknown` and correctness rests on a per-call-site
> `satisfies` plus a runtime dev-warning. It matches the TanStack adapter's
> `StaticDataRouteOption` augmentation. Put the `declare module` block in
> `app-shared`, never in a library — `RouteMeta` is global, and a library that
> augmented it would force its shape on every consumer.

## Route data (non-component `meta`)

`useZones` constrains every value to a component — a useful rail for JSX-like
content, but in the way for plain metadata (titles, enums, config objects).
`useRouteData` is the relaxed-typing counterpart: the **same** deepest-wins
merge over `meta`, with no component constraint on values.

```ts
createRoutes: (): RouteRecordRaw => ({
  path: "projects/:projectId",
  component: ProjectDetailPage,
  meta: {
    headerActions: ProjectActions, // → useZones<AppZones>()
    headerVariant: "project", // → useRouteData<AppRouteData>()
    pageTitle: "Project", // → useRouteData<AppRouteData>()
  },
}),
```

The shell reads each channel with its own typing:

```vue
<script setup lang="ts">
import { useZones, useRouteData } from "@modular-vue/runtime";
import type { AppZones, AppRouteData } from "@myorg/app-shared";

const zones = useZones<AppZones>();
const routeData = useRouteData<AppRouteData>();
</script>

<template>
  <header>
    <AppHeader :variant="routeData.headerVariant" :title="routeData.pageTitle">
      <component :is="zones.headerActions" v-if="zones.headerActions" />
    </AppHeader>
  </header>
  <main><router-view /></main>
  <aside v-if="zones.detailPanel"><component :is="zones.detailPanel" /></aside>
</template>
```

Both `useZones` and `useRouteData` return a **`ComputedRef`** (not a plain
object): they derive from the reactive `useRoute()`, so they recompute on
navigation. In `<template>` a top-level ref auto-unwraps, so `routeData.pageTitle`
reads the merged value directly; in `<script>` read `routeData.value.pageTitle`.

**When to use which:** `useZones` for components the shell renders (strict
component typing); `useRouteData` for everything else — strings, enums, numbers,
config objects.

### Sibling modules sharing a screen

Because route data flows through `meta`, several sibling modules can render one
generic screen and differ only by the config each puts on its route. The shell
zone reads `useRouteData` and adapts — it never branches on module id. The
[`examples/vue/integration-manager`](../examples/vue/integration-manager) app is
built exactly this way; see also
[Sibling modules sharing a screen](sibling-modules-shared-screen.md) for the
router-agnostic version of the pattern.

## Auth guard

vue-router's `router.beforeEach` is the idiomatic auth boundary. The runtime
doesn't invent its own guard mechanism — it forwards the one you pass so the
guard stays plain vue-router.

### Global guard via `authGuard` (recommended)

Pass an `authGuard` to the router-owning `resolve()` / `createModularApp`. It's a
standard vue-router `NavigationGuard`, installed with `router.beforeEach`, and it
reads `to.meta` — the same channel modules populate:

```ts
const manifest = createModularApp(registry, {
  router,
  parentRouteName: "root",
  authGuard: (to) => {
    if (to.meta.public) return true; // public routes opt out
    return authStore.getState().isAuthenticated ? true : { name: "login" };
  },
});
```

Return `true` to allow, a route location (`{ name: "login" }` / `"/login"`) to
redirect. Declare public routes (login, signup) on the shell's own route table,
outside the module-route parent, and mark them `meta: { public: true }`:

```ts
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: LoginPage, meta: { public: true } },
    {
      path: "/",
      name: "root",
      component: ShellLayout,
      children: [{ path: "", name: "home", component: Home }],
    },
  ],
});
```

The resulting boundary:

```
router.beforeEach(authGuard)          // runs before every navigation
├── /login   (meta.public → allowed)
└── / (root, ShellLayout)             // guarded
    ├── /            (Home)
    └── /billing, /users, …           // grafted module routes
```

> **The guard reads module metadata, not module code.** "Driven by module
> metadata" means the guard inspects `to.meta` — the vue-router `RouteMeta`
> channel modules populate — rather than importing anything module-specific. The
> runtime just forwards your guard to `router.beforeEach`; you decide the policy.

In **framework mode** there's no library-owned root to hang the guard on
(`resolveManifest()` doesn't take a router), so install your `beforeEach` on the
router you created yourself. The guard logic is identical.

### Per-route or role-based guards

For a guard that applies to one module's subtree, use vue-router's per-route
`beforeEnter`. It runs outside any component, so read stores via their snapshot
accessor rather than a composable:

```ts
createRoutes: (): RouteRecordRaw => ({
  path: "admin",
  component: AdminPage,
  beforeEnter: () => {
    const { role } = authStore.getState();
    return role === "admin" ? true : { name: "home" };
  },
}),
```

## `createRoutes` signature summary

| Aspect                        | Vue Router                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Return type                   | `RouteRecordRaw \| RouteRecordRaw[]`                                                           |
| Parent argument               | None; the runtime grafts your routes via `router.addRoute()`, under `parentRouteName` when set |
| Code splitting                | `component: () => import("./Page.vue")`                                                        |
| Index route                   | child with `path: ""`                                                                          |
| Zone / route-data declaration | `meta: { … }` on the route record                                                              |
| Route-level auth guard        | `beforeEnter: (to) => boolean \| RouteLocationRaw`                                             |
| Global auth guard             | `authGuard` on `resolve()` → `router.beforeEach`                                               |

## See also

- [Shell Patterns (Fundamentals)](shell-patterns.md) — the router-agnostic
  surface (read this first).
- [Getting started with Vue Router](getting-started-vue-router.md) — zero to a
  running two-module app.
- [Navigation: typed labels, dynamic hrefs, meta](navigation.md) — includes a
  Vue reading example.
- [Framework-mode (Nuxt 4)](framework-mode-nuxt.md) — run the family inside a
  Nuxt app with `@modular-vue/nuxt`.
- `@modular-vue/runtime` README — `createRegistry`, `resolve`, `resolveManifest`,
  and the composables.
