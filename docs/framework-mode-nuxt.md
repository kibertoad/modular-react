# Framework-Mode Integration (Nuxt 3)

This guide shows how to run the `@modular-vue` family inside a
[Nuxt 3](https://nuxt.com) app with
[`@modular-vue/nuxt`](../packages/vue-nuxt/README.md). Nuxt owns the Vue app and
the vue-router instance, so the integration is the **router-owning** path over
`@modular-vue/runtime` (`registry.resolve()`): the runtime grafts every module's
`createRoutes()` subtree onto Nuxt's router via `router.addRoute()` and installs
the modular contexts (shared dependencies, navigation, slots, modules) on the
Nuxt Vue app.

Read [Getting started with Vue Router](getting-started-vue-router.md) first for
the library-agnostic tour of modules, the registry, zones via `meta`, and
stores. This document focuses on the Nuxt integration seam. For the two
`resolve()` / `resolveManifest()` modes in a plain vue-router SPA, see
[Shell Patterns for Vue Router](shell-patterns-vue-router.md#two-integration-modes).

> **Status:** `@modular-vue/nuxt` is `0.1.0`, experimental. The runtime
> installer is covered by the package test suite; the Nuxt module is a thin
> wrapper that injects a runtime plugin. Breaking changes between 0.x minors are
> possible.

## Why Nuxt uses the router-owning path

In a plain vue-router SPA you choose between two modes (see the shell-patterns
guide). Nuxt removes the choice: it **creates the vue-router instance for you**,
so there is no `createRouter({ routes })` call for the library to feed
`resolveManifest().routes` into. Instead the runtime takes the router Nuxt
already built and grafts module routes onto it at runtime — exactly what
`registry.resolve({ router })` does. `@modular-vue/nuxt` wires that from inside a
Nuxt plugin.

| Concern           | How Nuxt handles it                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Vue app creation  | Nuxt owns it (`nuxtApp.vueApp`); the manifest is installed on it as a plugin.                 |
| Router creation   | Nuxt owns it (`nuxtApp.$router`); module routes are grafted via `addRoute()`.                 |
| Provider stack    | Installed app-wide via `nuxtApp.vueApp.use(manifest)`.                                        |
| Per-request state | Build the registry **per request** inside the plugin (see [SSR](#ssr-and-per-request-state)). |

## Setup

### Install

```bash
npm install @modular-vue/nuxt @modular-vue/runtime @modular-vue/core @modular-vue/vue
```

### Define the registry as a factory

Export a factory that builds a fresh registry each time it's called. Under SSR a
new Nuxt app is created per request, and `registry.resolve()` is single-use, so
a per-request registry is required (a singleton throws on the second request).

```ts
// modular/registry.ts
import { createRegistry } from "@modular-vue/runtime";
import billingModule from "./modules/billing";
import type { AppDependencies, AppSlots } from "./types";
import { createAuthStore, httpClient } from "./services";

export default function buildRegistry() {
  const registry = createRegistry<AppDependencies, AppSlots>({
    stores: { auth: createAuthStore() },
    services: { httpClient },
    slots: { commands: [] },
  });
  registry.register(billingModule);
  return registry;
}
```

Modules are the same plain `defineModule` objects as everywhere else — nothing
Nuxt-specific about them:

```ts
// modular/modules/billing.ts
import { defineModule } from "@modular-vue/core";
import type { RouteRecordRaw } from "vue-router";
import BillingPage from "./BillingPage.vue";

export default defineModule<AppDependencies, AppSlots>({
  id: "billing",
  version: "1.0.0",
  createRoutes: (): RouteRecordRaw => ({
    path: "billing",
    component: BillingPage,
    meta: { pageTitle: "Billing" },
  }),
  navigation: [{ label: "Billing", to: "/billing", group: "finance" }],
  requires: ["auth"],
});
```

### Wire it — two options

#### Option A: the Nuxt module (zero-config)

Add the module and point it at the registry factory:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@modular-vue/nuxt"],
  modularVue: {
    registry: "~/modular/registry",
    // Optional: graft module routes under a named shell route/page.
    parentRouteName: "app",
  },
});
```

The module injects a runtime plugin that calls `installModularApp` and exposes
the resolved manifest as `useNuxtApp().$modular`. Only serializable options
(`registry`, `parentRouteName`) can flow through `nuxt.config.ts`.

#### Option B: your own plugin (full control)

Write the plugin yourself when you need the non-serializable options —
`authGuard`, `providers`, `slotFilter`, or `onModuleExit`:

```ts
// plugins/modular-vue.ts
import { installModularApp } from "@modular-vue/nuxt/runtime";
import buildRegistry from "~/modular/registry";

export default defineNuxtPlugin((nuxtApp) => {
  const registry = buildRegistry();
  const manifest = installModularApp(nuxtApp, registry, {
    parentRouteName: "app",
    authGuard: (to) => (to.meta.requiresAuth && !isLoggedIn() ? "/login" : true),
    onModuleExit: () => nuxtApp.$router.push("/"),
  });
  return { provide: { modular: manifest } };
});
```

`installModularApp(nuxtApp, registry, options?)`:

- takes `nuxtApp` (needs `vueApp` + `$router` — the structural `NuxtAppLike`
  interface a real `NuxtApp` satisfies),
- grafts module routes onto `nuxtApp.$router`, installs the optional
  `authGuard`, and installs the manifest on `nuxtApp.vueApp`,
- returns the `ApplicationManifest` (`router`, `navigation`, `slots`,
  `modules`, `recalculateSlots`, …).

Everything but `router` is forwarded to `registry.resolve()` — `router` comes
from `nuxtApp.$router`.

## Routing: runtime `addRoute` and the first paint

Module routes are added at runtime, when the plugin runs, via
`router.addRoute()`. They are available for **client-side navigation**
immediately. But Nuxt resolves the initial route during the same startup pass,
so for a module route to render on the **first server-rendered paint** (a hard
load or refresh straight onto `/billing`), Nuxt's route table must already
contain a match. Two ways to guarantee that:

1. **Declare a shell page and graft under it.** Give Nuxt a real page — e.g.
   `pages/[...modular].vue` (a catch-all) or a named `pages/app.vue` — and pass
   its route name as `parentRouteName`. Nuxt's initial resolution matches the
   shell page; the grafted child renders inside its `<NuxtPage>` /
   `<router-view>`. This is the recommended pattern.
2. **Client-only modules.** If a module's routes are only reached via in-app
   navigation (never a deep link on cold load), no shell page is needed — the
   runtime `addRoute` has already run by the time the user navigates.

This is the Nuxt analog of the note in the React/TanStack framework-mode guides
that route **shape** is owned by the framework: here Nuxt owns initial route
resolution, so a deep-linkable module subtree needs a page Nuxt knows about at
build time to hang under.

## Auth guards

Install the guard through the integration rather than a second `beforeEach`, so
it's wired on the same router the modules graft onto. It reads `to.meta` — the
vue-router channel modules populate via their `RouteMeta` convention (see
[Shell Patterns for Vue Router](shell-patterns-vue-router.md)):

```ts
installModularApp(nuxtApp, registry, {
  authGuard: (to) => (to.meta.requiresAuth && !useAuth().isLoggedIn ? "/login" : true),
});
```

Nuxt's own `defineNuxtRouteMiddleware` still works alongside it; use whichever
fits — the guard option exists so a shell that already models auth through
module `meta` doesn't have to restate it as Nuxt middleware.

## SSR and per-request state

Under SSR Nuxt builds a fresh app **and router per request**. Two consequences:

- **Build the registry per request.** `registry.resolve()` is single-use and
  server state must not leak between requests, so call the factory inside the
  plugin (both options above do). A module-level singleton is safe only for a
  client-only app (`ssr: false`), where the plugin runs once.
- **Stores are per request too.** Because the factory runs per request, the
  stores it creates are per request — no cross-request bleed of user/session
  state. Keep store creation inside the factory, not at module top level.

## Dynamic slots

`recalculateSlots()` on the returned manifest re-evaluates `dynamicSlots` /
`slotFilter` after a state change (login, role change, feature flag). Wire it to
your store subscription as usual:

```ts
export default defineNuxtPlugin((nuxtApp) => {
  const registry = buildRegistry();
  const manifest = installModularApp(nuxtApp, registry);
  // e.g. re-run dynamic slots when auth changes on the client.
  if (import.meta.client) authStore.subscribe(manifest.recalculateSlots);
  return { provide: { modular: manifest } };
});
```

`recalculateSlots` is a no-op unless a module declared `dynamicSlots` or you
passed a `slotFilter`, so the subscription is cheap to wire even when nothing is
dynamic.

## Nuxt layers: letting a consumer contribute modules

A [Nuxt layer](https://nuxt.com/docs/getting-started/layers) is published once
and `extends`ed by many deployments. The interesting case is a layer that owns a
_base_ registry (its own first-party modules) but lets each consuming app add its
own — the frontend analog of a backend plugin registry. This works, with two
things to get right.

**Use Option B, not the module.** The zero-config module (Option A) resolves its
`registry: "~/modular/registry"` path against the **consumer's** srcDir, the same
`~`/`@` rebinding every Nuxt layer hits. So the layer's own base registry and the
consumer's additions never compose through Option A. Instead the layer ships its
own `defineNuxtPlugin` (Option B) that builds the base registry and installs it.

**Expose a registration seam and mind plugin order.** The layer keeps a module
list its plugin reads at resolve time, and exports an `addModule`-style function
for consumers:

```ts
// layer: app/modular/registry.ts
import { createRegistry } from "@modular-vue/runtime";
import type { AnyModuleDescriptor } from "@modular-vue/core";

const firstParty: readonly AnyModuleDescriptor[] = [
  /* the layer's own modules */
];
const contributed: AnyModuleDescriptor[] = [];

/** Consumers call this from their own plugin, before the layer resolves. */
export function registerAppModule(module: AnyModuleDescriptor): void {
  contributed.push(module);
}

export function buildRegistry() {
  const registry = createRegistry({});
  for (const m of [...firstParty, ...contributed]) registry.register(m);
  return registry;
}
```

```ts
// layer: app/plugins/modular.ts
import { installModularApp } from "@modular-vue/nuxt/runtime";
import { buildRegistry } from "~/modular/registry";

// `enforce: "post"` is the load-bearing detail — see below.
export default defineNuxtPlugin({
  name: "modular",
  enforce: "post",
  setup(nuxtApp) {
    const manifest = installModularApp(
      { vueApp: nuxtApp.vueApp, $router: nuxtApp.$router },
      buildRegistry(),
    );
    return { provide: { modular: manifest } };
  },
});
```

```ts
// consumer deployment: app/plugins/my-modules.ts (a normal, default-order plugin)
export default defineNuxtPlugin(() => {
  registerAppModule(myModule); // registerAppModule is auto-imported from the layer
});
```

Nuxt loads a layer's plugins **before** the consuming app's plugins within one
enforce bucket, so a consumer registering from a default plugin would otherwise
run _after_ the layer already resolved, and its module would be missed. Marking
the layer's install plugin `enforce: "post"` flips the order: the consumer's
default-bucket registration runs first, then the layer resolves with everything
present. So the rule for consumers is "register from a `default` (or `pre`)
plugin," and the layer's install plugin is always `post`.

For an `ssr: false` layer this is the simple case: the plugin runs once on the
client, so the module-level `contributed` array and a singleton registry are
fine (the per-request-factory rule only bites under SSR). Registering the same
id twice throws at resolve via duplicate-id validation, which is the guard you
want.

This same `registerAppModule` seam is how a consumer lights up a
**backend-driven** capability that the layer knows nothing about: the consumer
registers a module contributing its own code-shipped components (as
`ComponentEntry` items) to a shared slot, and a remote capability manifest then
selects one by a string id at render time. See [Pairing wire-safe manifests with
code-shipped components](remote-capability-manifests.md#pairing-wire-safe-manifests-with-code-shipped-components)
for that join — the components ship as code through the seam above; only the
selecting id crosses the wire.

## Rules of thumb

- **Registry as a factory, called in the plugin.** This is the one rule that
  keeps SSR correct — per-request registry, per-request stores, single-use
  `resolve()` honored.
- **Deep-linkable modules need a Nuxt page to graft under.** Use
  `parentRouteName` + a shell/catch-all page for anything reachable by cold
  load; skip it for navigation-only modules.
- **Reach for Option B when you need behavior.** The module (Option A) carries
  only serializable config; auth guards, provider plugins, slot filters, and
  exit handlers live in your own `defineNuxtPlugin`.
- **Layers own the plugin; consumers register from a `default` plugin.** A layer
  that lets consumers contribute modules ships its own Option-B plugin marked
  `enforce: "post"` and exports a registration seam; consumers add modules from a
  normal-order plugin. See [Nuxt layers](#nuxt-layers-letting-a-consumer-contribute-modules).

## See also

- [Reactive slots in Vue](reactive-slots-vue.md) — `useReactiveSlots` vs the
  `recalculateSlots()` signal path, the tradeoffs, and the host-owned RBAC-gating
  shape a layer's nav/command shells use.
- [`@modular-vue/nuxt`](../packages/vue-nuxt/README.md) — package reference.
- [Getting started with Vue Router](getting-started-vue-router.md) — modules,
  registry, stores, the manual SPA setup.
- [Shell Patterns for Vue Router](shell-patterns-vue-router.md) — router-owning
  vs framework mode, route zones and route data via `meta`, `beforeEach` auth.
- [Framework-mode (React Router v7)](framework-mode-react-router.md) /
  [Framework-mode (TanStack Router & Start)](framework-mode-tanstack-router.md)
  — the React-side framework integrations.
