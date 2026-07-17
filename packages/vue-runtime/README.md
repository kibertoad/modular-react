# @modular-vue/runtime

Runtime registry for `@modular-vue` modules on vue-router. Collects registered
modules, validates their dependencies, runs lifecycle hooks, drives the plugin
machinery, and resolves the navigation manifest, slots, and module descriptors.

This is the registry half of the runtime. The router-owning `resolve()` entry,
the `Providers` context component, the `router.addRoute()` route-builder, and
the auth guard land alongside it in a following release; this package assembles
everything that does not need a router or a Vue render tree.

## Installation

```bash
npm install @modular-vue/runtime
```

## What's included

- **`createRegistry(config)`** — build a registry from `stores` / `services` /
  `reactiveServices` / `slots`.
- **`registry.register(module)`** / **`registry.registerLazy(descriptor)`** —
  register eager and lazily-loaded modules.
- **`registry.use(plugin)`** — attach a plugin; its `extend` surface is
  intersected onto the returned registry reference, so contributed methods
  (e.g. a future `registerJourney`) are typed on the same object.
- **`registry.resolveManifest(options?)`** — resolve all modules into a
  `ResolvedManifest`: `navigation`, `slots`, `modules`, `moduleDescriptors`,
  plugin `extensions` (+ the `journeys` alias), `onModuleExit`, and
  `recalculateSlots`. Idempotent — the first call does the work and caches the
  result; later calls return it and must pass no options.

## Usage

```ts
import { createRegistry } from "@modular-vue/runtime";
import { billingModule } from "@myorg/billing";

export const registry = createRegistry<AppDeps, AppSlots>({
  stores: { auth: authStore },
  services: { api },
  slots: { commands: [] },
});

registry.register(billingModule);

export const manifest = registry.resolveManifest();
// manifest.navigation, manifest.slots, manifest.moduleDescriptors, ...
```

## Validation

`resolveManifest()` runs the shared core validators before assembly:

- duplicate module IDs throw,
- modules whose `requires` are not provided by the registry throw,
- `optionalRequires` gaps warn (the module still loads),
- malformed entry/exit declarations throw.

Registration is locked once `resolveManifest()` runs — registering a module or
attaching a plugin afterwards throws.
