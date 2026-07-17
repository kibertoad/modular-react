# @modular-vue/nuxt

Nuxt 3 integration for the [`@modular-vue`](../../README.md) family. Nuxt owns
the Vue app and the vue-router instance, so this package is the router-owning
seam over `@modular-vue/runtime`: it grafts every module's `createRoutes()`
subtree onto Nuxt's router and installs the modular contexts (shared
dependencies, navigation, slots, modules) on the Nuxt Vue app.

> **Status: `0.1.0`, experimental.** The runtime installer is exercised by the
> package test suite against a real Vue app + vue-router. The build-time Nuxt
> module is a thin wrapper that injects a runtime plugin. Breaking changes
> between 0.x minor versions are possible. For the stable SPA path, see
> [Getting started with Vue Router](../../docs/getting-started-vue-router.md).

## Installation

```bash
npm install @modular-vue/nuxt @modular-vue/runtime @modular-vue/core @modular-vue/vue
```

`@modular-vue/nuxt` peer-depends on `@modular-vue/runtime`, `vue`, and
`vue-router` (all provided by a Nuxt 3 app).

## Two ways to wire it

### 1. The Nuxt module (zero-config path)

Add the module to `nuxt.config.ts` and point it at a file that exports your
registry:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@modular-vue/nuxt"],
  modularVue: {
    // Default-export the registry, or a factory `(nuxtApp) => registry`.
    registry: "~/modular/registry",
    // Optional: graft module routes under an existing Nuxt page/route.
    parentRouteName: "app",
  },
});
```

```ts
// modular/registry.ts
import { createRegistry } from "@modular-vue/runtime";
import billingModule from "./modules/billing";
import type { AppDependencies, AppSlots } from "./types";
import { createAuthStore, httpClient } from "./services";

// A FACTORY, so a fresh registry is built per request under SSR.
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

The module injects a runtime plugin that calls `installModularApp` and exposes
the resolved manifest as `useNuxtApp().$modular`.

Only the serializable options (`registry`, `parentRouteName`) travel through
`nuxt.config.ts`. If you need `authGuard`, `providers`, `slotFilter`, or
`onModuleExit`, use the plugin path below instead.

### 2. Your own Nuxt plugin (full control)

Skip the module and write the plugin yourself — this is the path when you need
the non-serializable options:

```ts
// plugins/modular-vue.ts
import { installModularApp } from "@modular-vue/nuxt/runtime";
import buildRegistry from "~/modular/registry";

export default defineNuxtPlugin((nuxtApp) => {
  const registry = buildRegistry();
  const manifest = installModularApp(nuxtApp, registry, {
    parentRouteName: "app",
    authGuard: (to) => (to.meta.requiresAuth && !isLoggedIn() ? "/login" : true),
    onModuleExit: (event) => nuxtApp.$router.push("/"),
  });
  return { provide: { modular: manifest } };
});
```

## `installModularApp(nuxtApp, registry, options?)`

- `nuxtApp` — the Nuxt app (needs `vueApp` and `$router`; the structural
  `NuxtAppLike` interface a real `NuxtApp` satisfies).
- `registry` — a `@modular-vue/runtime` registry with your modules registered.
- `options` — `parentRouteName`, `authGuard`, `providers`, `slotFilter`,
  `onModuleExit` (all forwarded to `registry.resolve()`; `router` is taken from
  `nuxtApp.$router`).

Returns the `ApplicationManifest` (`router`, `navigation`, `slots`, `modules`,
`recalculateSlots`, …).

## SSR and per-request state

Under SSR, Nuxt creates a fresh app and router **per request**.
`registry.resolve()` is single-use, and shared server state must not leak
between requests, so build the registry **per request** — export a factory and
call it inside the plugin (both paths above do). A module-level singleton
registry is fine only for a client-only app (`ssr: false`), where the plugin
runs once.

## Routing note

Module routes are added at runtime via `router.addRoute()` when the plugin runs.
They are available for client-side navigation immediately; for a module route
to render on the **first** server-rendered paint, add a matching Nuxt catch-all
page (or declare the shell route as `parentRouteName`) so Nuxt's initial route
resolution finds it. See the
[Nuxt framework-mode guide](../../docs/framework-mode-nuxt.md) for the full
walkthrough and the SSR considerations.

## See also

- [Framework-mode integration (Nuxt)](../../docs/framework-mode-nuxt.md)
- [Getting started with Vue Router](../../docs/getting-started-vue-router.md)
- [`@modular-vue/runtime`](../vue-runtime/README.md) — `createRegistry`,
  `resolve`, `resolveManifest`.
