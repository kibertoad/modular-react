# modular-react

modular-react sits on top of your router — **React Router, TanStack Router, or Vue Router** — and lets you split your app into self-contained modules. Each module declares its own routes, navigation items, slot contributions, and dependencies, and a typed registry composes them at startup.

> **The name is historical.** The project started React-only; the module contract, registry, journeys, and compositions are now framework-neutral, and a full Vue 3 + vue-router family (`@modular-vue/*`) ships alongside the React families. The shared engine and core packages live under the neutral `@modular-frontend/*` scope.

The router integrations are peers. Pick the one that matches the framework and router you already ship.

## The problem this solves

In a router-only setup, every new feature adds entries in `App.tsx`, the sidebar config, the command palette registry, the auth guard list, and wherever else cross-cutting state lives. Four teams editing those same files means constant merge conflicts and no clear ownership. Deleting a feature means hunting its fragments across a dozen places.

modular-react lets each feature own a single `modules/<name>/` directory that fully declares its routes, nav items, commands, zone contributions, and dependencies. The shell never has to know about any specific module; it just registers them and the runtime wires everything together. Adding a feature is `create module`; deleting one is removing a directory and one `registry.register(...)` call.

Good for: plugin-style apps, apps where many teams contribute features, and apps that have grown past the point where one `App.tsx` is still comfortable to edit.

When a domain flow must span **several modules in sequence** (e.g. "confirm the customer's profile → branch into plan selection → collect a payment or activate a trial"), an optional [Journeys](packages/journeys/README.md) layer composes those modules into a typed, serializable workflow without leaking state into the shell.

Once a workspace has accumulated more modules than any one team can keep in their head, the optional [Catalog](packages/catalog/README.md) layer harvests every `defineModule` and `defineJourney` it can find and emits a static, deployable discovery portal — searchable, faceted by owner team / domain / tags / status, with a pre-computed cross-reference graph between modules and the journeys that route through them.

## What a running app looks like

```
┌──────────┬────────────────────────────────────────────────┐
│          │ [Refresh Billing] [Export Invoices]    [user]  │  ← header slot: slots.commands
│ Sidebar  ├──────────────────────────────┬─────────────────┤
│          │                              │                 │
│ Dashboard│                              │                 │
│ Billing  │  Main outlet (active         │  Detail panel   │
│ Users    │  module's route component)   │  (AppZones.     │
│          │                              │   detailPanel,  │
│  (items  │                              │   filled by     │
│   from   │                              │   active route) │
│   every  │                              │                 │
│   module)│                              │                 │
└──────────┴──────────────────────────────┴─────────────────┘
      ↑                                            ↑
 navigation: [...]                       handle / staticData:
 from every module                       { detailPanel: ... }
```

- The **sidebar** is built from every module's `navigation` array.
- The **header commands** are collected from every module's `slots.commands`.
- The **detail panel** (and any other zones you define) is filled by whichever module owns the active route. Navigate away, and a different module's contribution takes over, or the panel hides entirely.

## Project status

- `@react-router-modules/*`: **v2.x**, considered stable for the APIs documented in the guides below.
- `@tanstack-react-modules/*`: **v1.x**, considered stable for the APIs documented in the guides below.
- `@modular-react/{core,react,testing}`: the shared foundation, stable at `1.x`. The router-integration packages depend on these and version independently.
- `@modular-react/compositions`: **v0.1.x**, the surface and behavior are documented in [its README](packages/compositions/README.md) but breaking changes between 0.x minor versions are still possible.
- `@modular-vue/*` (`core`, `runtime`, `vue`, `testing`, `journeys`, `compositions`): the Vue 3 + vue-router family, **v1.0**, at full feature parity with `@react-router-modules/*` (see the [parity audit](docs/vue-support-tracker.md#parity-audit-pr-42)). Start with [Getting started with Vue Router](docs/getting-started-vue-router.md). The `@modular-vue/cli` scaffolder (binary `modular-vue`) ships alongside the family — `modular-vue init` bootstraps a workspace and `modular-vue create module|store|journey` extends it; the getting-started guide also shows the equivalent manual setup.
- `@modular-vue/nuxt`: the Nuxt 3 integration, **v0.1.x, experimental**. Grafts module routes onto Nuxt's vue-router and installs the modular contexts on the Nuxt Vue app, either via a Nuxt module or the `installModularApp` helper in your own plugin. See [Framework-mode (Nuxt 3)](docs/framework-mode-nuxt.md).
- `@modular-frontend/*` (`core`, `testing`, `journeys-engine`, `compositions-engine`): the framework-neutral shared engine and core the React and Vue families both build on. `journeys-engine` carries the **1.x** version of the package it was extracted from; `core`, `testing`, and `compositions-engine` are **0.1.x**. The binding families peer-depend on these with tight (`^0.1.0`-style) ranges, so any `@modular-frontend/*` bump ships with coordinated peer-range bumps and releases of every dependent binding package in the same batch — see the [versioning policy](docs/vue-support-tracker.md#versioning-and-release).

The React families target **React 19**; the Vue family targets **Vue ^3.5** and **vue-router ^4.5**. All target **Node 22+**. The docs and CLI scaffolder assume **pnpm workspaces**, but nothing in the runtime or CLI is pnpm-specific; any local package resolution that understands the `workspace:*` protocol (Yarn Berry, Bun) will work after scaffolding with a few script edits. See each getting-started guide for the full pinned version set.

## Quickstart

```bash
# React Router
npx @react-router-modules/cli init my-app --scope @myorg --module dashboard

# TanStack Router
npx @tanstack-react-modules/cli init my-app --scope @myorg --module dashboard

# Vue Router
npx @modular-vue/cli init my-app --scope @myorg --module dashboard

cd my-app && pnpm install && pnpm dev
```

Every family ships a scaffolder over the same `cli-core` engine, so `init` and `create module|store|journey|catalog` behave identically; only the emitted code differs (JSX vs. Vue SFCs, `main.tsx` vs. `main.ts`, and so on).

For the walkthrough of what the scaffold produces (or how to build the workspace by hand) and how to extend it, see the getting-started guide for your framework:

- [Getting started with React Router](docs/getting-started-react-router.md)
- [Getting started with TanStack Router](docs/getting-started-tanstack-router.md)
- [Getting started with Vue Router](docs/getting-started-vue-router.md)

> **Package manager:** the scaffold produces a **pnpm workspace**. Yarn Berry and Bun will work after scaffolding with minor script edits; **npm is not supported** because it doesn't implement the `workspace:*` protocol. Turborepo is orthogonal; run it on top of pnpm. See the getting-started guides for details.

## Guides

Conceptual documentation for building apps with the framework. Start with a getting-started guide, then dig into the shell patterns once you want to go beyond the defaults.

| Guide                                                                              | What it covers                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Getting started with React Router](docs/getting-started-react-router.md)          | Scaffold, tour the generated workspace, add modules and stores, turn on the auth guard.                                                                                                   |
| [Getting started with TanStack Router](docs/getting-started-tanstack-router.md)    | Same walkthrough for the TSR integration, including the `staticData` type augmentation and `beforeLoad` auth guard.                                                                       |
| [Getting started with Vue Router](docs/getting-started-vue-router.md)              | Manual workspace setup for the Vue 3 + vue-router family — modules, the registry, zones via `meta`, stores, and the `beforeEach` auth guard.                                              |
| [Framework-mode (React Router v7)](docs/framework-mode-react-router.md)            | `resolveManifest()` integration with `@react-router/dev/vite` — keep file-based `routes.ts`, `+types/route.ts`, HMR, and SSR.                                                             |
| [Framework-mode (TanStack Router & Start)](docs/framework-mode-tanstack-router.md) | `resolveManifest()` integration with `@tanstack/router-plugin` and TanStack Start — keep file-based `routeTree.gen.ts`, typed routes, SSR.                                                |
| [Framework-mode (Nuxt 3)](docs/framework-mode-nuxt.md)                             | `@modular-vue/nuxt` — graft module routes onto Nuxt's vue-router and install the modular contexts on the Nuxt Vue app, via a Nuxt module or `installModularApp` in your own plugin.       |
| [Navigation: typed labels, dynamic hrefs, meta](docs/navigation.md)                | `NavigationItem<TLabel, TContext, TMeta>` — typed i18n keys, context-aware `to`, app-owned `meta` for permissions/badges.                                                                 |
| [Shell Patterns (Fundamentals)](docs/shell-patterns.md)                            | Multi-zone layouts, command palette, module-to-shell communication, headless modules, optional deps, cross-store coordination.                                                            |
| [Shell Patterns for React Router](docs/shell-patterns-react-router.md)             | Module route shape, route zones via `handle`, `useRouteData` for non-component metadata, auth guards, public shell routes.                                                                |
| [Shell Patterns for TanStack Router](docs/shell-patterns-tanstack-router.md)       | Module route shape with `createRoute`/`getParentRoute`, route zones via `staticData`, `useRouteData`, `beforeLoad` auth.                                                                  |
| [Shell Patterns for Vue Router](docs/shell-patterns-vue-router.md)                 | Router-owning vs framework mode, module route shape, zones and route data via `meta` (typed through `RouteMeta`), `useRouteData`, `beforeEach` auth.                                      |
| [Workspace Patterns](docs/workspace-patterns.md)                                   | Tabbed workspaces, component-only modules, `useActiveZones`, per-session state via `createScopedStore`.                                                                                   |
| [Sibling modules sharing a screen](docs/sibling-modules-shared-screen.md)          | One generic screen (e.g. an integration manager) rendered by several sibling modules with per-module config flowing through typed handle (React Router) or staticData (TanStack Router).  |
| [Journeys](packages/journeys/README.md)                                            | Typed multi-module workflows with serializable shared state — entry/exit contracts, branch/complete/abort transitions, pluggable persistence.                                             |
| [Compositions](packages/compositions/README.md)                                    | Multi-module screen layout — arrange modules (and journeys) into named zones on a single screen, with a per-instance scoped store as the orchestration bus.                               |
| [Catalog](packages/catalog/README.md)                                              | Build-time discovery portal: harvest every `defineModule` / `defineJourney`, surface owner/domain/tags facets, pre-compute the journey↔module cross-reference graph, ship as static HTML. |
| [Remote Capability Manifests](docs/remote-capability-manifests.md)                 | Drive slots/navigation from backend JSON — `RemoteModuleManifest`, `mergeRemoteManifests`, validation, SSR, and the single-module pattern.                                                |

## What the code looks like

Modules are plain objects describing everything a feature contributes:

```typescript
import { defineModule } from "@react-router-modules/core"; // or @tanstack-react-modules/core

export default defineModule<AppDependencies, AppSlots>({
  id: "billing",
  version: "1.0.0",
  createRoutes: () => [{ path: "billing", Component: BillingPage }],
  navigation: [{ label: "Billing", to: "/billing", group: "finance" }],
  slots: { commands: [{ id: "export", label: "Export Invoices", onSelect: exportInvoices }] },
  dynamicSlots: (deps) => ({
    commands: deps.auth.user?.isAdmin
      ? [{ id: "void", label: "Void Invoice", onSelect: voidInvoice }]
      : [],
  }),
});
```

The shell assembles modules into a running app via a registry. For React Router v7 with `@react-router/dev/vite` (the recommended path — keeps HMR, generated `+types/route.ts`, SSR, and file-based routing):

```typescript
// app/registry.ts
import { createRegistry } from "@react-router-modules/runtime";
import billingModule from "./modules/billing";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
});
registry.register(billingModule);

export const manifest = registry.resolveManifest();

// app/root.tsx
import { Outlet } from "react-router";
import { manifest } from "./registry";
export default () => <manifest.Providers><Outlet /></manifest.Providers>;

// app/routes.ts continues to use flatRoutes() / route() / prefix() as normal.

// Re-evaluate dynamic slots when state changes. `recalculateSlots` is a
// no-op unless at least one module declared `dynamicSlots` or you passed a
// `slotFilter` to `resolveManifest()` — wire the subscription only when
// there is actually something dynamic to recompute.
authStore.subscribe(manifest.recalculateSlots);
```

For legacy React Router setups or plugin-host apps (library owns router creation, no framework-mode integration), use `registry.resolve({ rootComponent, indexComponent, authenticatedRoute })` instead — see [Framework-mode guide](docs/framework-mode-react-router.md) for the tradeoffs.

The same `resolveManifest()` pattern is available for **TanStack Router file-based mode and TanStack Start**:

```typescript
// app/registry.ts
import { createRegistry } from "@tanstack-react-modules/runtime";
import billingModule from "./modules/billing";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
});
registry.register(billingModule);

export const manifest = registry.resolveManifest();

// app/routes/__root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { manifest } from "../registry";
export const Route = createRootRoute({
  component: () => <manifest.Providers><Outlet /></manifest.Providers>,
});

// app/router.ts continues to call createRouter({ routeTree }) as usual.
authStore.subscribe(manifest.recalculateSlots);
```

See [Framework-mode (TanStack Router & Start) guide](docs/framework-mode-tanstack-router.md) for the full walkthrough and the SSR considerations.

The **Vue** family mirrors the same contract. A module is the same plain object (`defineModule` from `@modular-vue/core`), with `createRoutes()` returning a vue-router `RouteRecordRaw` and zones/route-data on the route's `meta`:

```typescript
// modules/billing/src/index.ts
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

The shell owns the router and installs the resolved manifest as a Vue plugin (or wraps `<router-view>` in `manifest.Providers` in framework mode):

```typescript
// shell/src/main.ts
import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createModularApp, createRegistry } from "@modular-vue/runtime";
import billing from "@myorg/billing-module";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
});
registry.register(billing);

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/", name: "root", component: ShellLayout }],
});
const manifest = createModularApp(registry, { router, parentRouteName: "root" });

createApp(App).use(router).use(manifest).mount("#app");
```

See [Getting started with Vue Router](docs/getting-started-vue-router.md) and [Shell Patterns for Vue Router](docs/shell-patterns-vue-router.md) for the full walkthrough.

## Examples

Runnable examples live under [`examples/`](examples/), split by router integration. Each is a self-contained pnpm workspace that resolves the library packages from this repo, so changes in `packages/*` are reflected the next time you run the example (some examples pin `workspace:*` on every dep, others declare library deps with semver ranges and rely on the repo's `.npmrc` `link-workspace-packages=true` — either way the local source wins):

- [`examples/react-router/integration-manager/`](examples/react-router/integration-manager) — sibling modules sharing a screen (React Router)
- [`examples/tanstack-router/integration-manager/`](examples/tanstack-router/integration-manager) — sibling modules sharing a screen (TanStack Router)
- [`examples/react-router/customer-onboarding-journey/`](examples/react-router/customer-onboarding-journey) — multi-module workflow with typed journeys (React Router)
- [`examples/tanstack-router/customer-onboarding-journey/`](examples/tanstack-router/customer-onboarding-journey) — multi-module workflow with typed journeys (TanStack Router)
- [`examples/react-router/editor-composition/`](examples/react-router/editor-composition) — multi-module screen via `@modular-react/compositions` (React Router)
- [`examples/tanstack-router/editor-composition/`](examples/tanstack-router/editor-composition) — multi-module screen via `@modular-react/compositions` (TanStack Router)
- [`examples/vue/integration-manager/`](examples/vue/integration-manager) — sibling modules sharing a screen (Vue Router)
- [`examples/vue/customer-onboarding-journey/`](examples/vue/customer-onboarding-journey) — multi-module workflow with typed journeys (Vue Router)
- [`examples/vue/editor-composition/`](examples/vue/editor-composition) — multi-module screen via `@modular-vue/compositions` (Vue Router)
- [`examples/react-router/remote-capabilities/`](examples/react-router/remote-capabilities) — slots/navigation driven by a backend-served remote manifest
- [`examples/react-router/active-project-manifest/`](examples/react-router/active-project-manifest) — per-project remote manifests swapped at runtime

See [`examples/README.md`](examples/README.md) for how to run them and how to add new ones.

## Packages

### Shared foundation (router-agnostic)

| Package                                                | Description                                                                                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`@modular-react/core`](packages/core)                 | Types, slots, navigation, validation, and a lightweight store. No React runtime dependency.                                               |
| [`@modular-react/react`](packages/react)               | React bindings: context providers, hooks (`useStore`, `useSlots`, `useNavigation`, etc.), error boundary.                                 |
| [`@modular-react/testing`](packages/testing)           | Test utilities for resolving modules without rendering.                                                                                   |
| [`@modular-react/journeys`](packages/journeys)         | Typed, serializable multi-module workflows with entry/exit contracts and a pluggable persistence adapter.                                 |
| [`@modular-react/compositions`](packages/compositions) | Multi-module screen layout: arrange several modules (and journeys) into named zones on one screen, driven by a per-instance scoped store. |
| [`@modular-react/catalog`](packages/catalog)           | Build-time harvester + static SPA: scans for descriptors and emits a deployable discovery portal.                                         |
| [`@modular-react/cli-core`](packages/cli-core)         | Shared command implementations and templates for the router-specific CLI binaries.                                                        |

### React Router integration

| Package                                                          | Description                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`@react-router-modules/core`](packages/react-router-core)       | Module definition with React Router `RouteObject` support, typed hooks, scoped stores.              |
| [`@react-router-modules/runtime`](packages/react-router-runtime) | Registry, route tree builder, app assembly with all providers wired.                                |
| [`@react-router-modules/testing`](packages/react-router-testing) | `renderModule` and `resolveModule` for testing modules in isolation.                                |
| [`@react-router-modules/cli`](packages/react-router-cli)         | Scaffolding CLI: `react-router-modules init`, `react-router-modules create module\|store\|journey`. |

### TanStack Router integration

| Package                                                               | Description                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`@tanstack-react-modules/core`](packages/tanstack-router-core)       | Module definition with TanStack Router `createRoute` support, typed hooks, scoped stores.               |
| [`@tanstack-react-modules/runtime`](packages/tanstack-router-runtime) | Registry, route tree builder, app assembly with all providers wired.                                    |
| [`@tanstack-react-modules/testing`](packages/tanstack-router-testing) | `renderModule` and `resolveModule` for testing modules in isolation.                                    |
| [`@tanstack-react-modules/cli`](packages/tanstack-router-cli)         | Scaffolding CLI: `tanstack-react-modules init`, `tanstack-react-modules create module\|store\|journey`. |

### Vue Router integration

| Package                                                  | Description                                                                                                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@modular-vue/vue`](packages/vue)                       | Vue bindings: injection contexts, composables (`useSlots`, `useNavigation`, …), the `createSharedComposables` factory (`useStore`, `useService`, …), scoped stores, entry resolution, error boundary. |
| [`@modular-vue/core`](packages/vue-core)                 | Module definition with vue-router `RouteRecordRaw` support (`createRoutes()`), `defineSlots`, the `RouteMeta` convention.                                                                             |
| [`@modular-vue/runtime`](packages/vue-runtime)           | Registry, `router.addRoute()` route builder, `resolve()` / `resolveManifest()` app assembly, zones and route data.                                                                                    |
| [`@modular-vue/testing`](packages/vue-testing)           | `renderModule`, `renderJourney`, `resolveModule`, `createMockStore`, `preloadEntries`.                                                                                                                |
| [`@modular-vue/journeys`](packages/vue-journeys)         | Vue journey provider, composables, `<JourneyOutlet>`, `<ModuleTab>`, `useWaitForExit`, registry plugin.                                                                                               |
| [`@modular-vue/compositions`](packages/vue-compositions) | Vue composition provider, panel/host composables, `<CompositionOutlet>` (scoped-slot), registry plugin.                                                                                               |
| [`@modular-vue/nuxt`](packages/vue-nuxt)                 | Nuxt 3 integration (experimental, `0.1.x`): a Nuxt module plus the `installModularApp` runtime installer that grafts module routes onto Nuxt's vue-router and installs the modular contexts.          |

### Framework-neutral engine (shared by React and Vue)

| Package                                                                 | Description                                                                                                           |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`@modular-frontend/core`](packages/frontend-core)                      | The router- and framework-neutral core: types, slots, navigation, validation, store, the `UiComponent`/`UiNode` seam. |
| [`@modular-frontend/testing`](packages/frontend-testing)                | Neutral `resolveModule` + `createMockStore`, re-exported by each binding's testing package.                           |
| [`@modular-frontend/journeys-engine`](packages/journeys-engine)         | The journey runtime, validation, persistence, and authoring surface — no UI framework dependency.                     |
| [`@modular-frontend/compositions-engine`](packages/compositions-engine) | The composition runtime, scoped stores, validation, and authoring surface — no UI framework dependency.               |

## Architecture

```
Shared layer (router-agnostic):
  @modular-react/core       (types, slots, navigation, validation, store)
       |
  @modular-react/react      (React hooks, contexts, error boundary)
       |
  @modular-react/testing    (resolveModule without rendering)
       |
  @modular-react/journeys      (typed multi-module workflows, optional)
       |
  @modular-react/compositions  (multi-module screen layout + scoped store, optional)
       |
  @modular-react/catalog       (static discovery portal, build-time only, optional)
       |
  @modular-react/cli-core   (shared CLI commands + templates)

Router-specific layers:
  @react-router-modules/*        @tanstack-react-modules/*
  core   (ModuleDescriptor        core   (ModuleDescriptor
          with RouteObject)                with createRoute)
  runtime (registry, route         runtime (registry, route
           tree, app assembly)              tree, app assembly)
  testing (renderModule)           testing (renderModule)
  cli     (cli-core preset)        cli     (cli-core preset)
```

## CLI command reference

Each router integration ships its own CLI binary with the same command surface:

- `@react-router-modules/cli` → `react-router-modules`
- `@tanstack-react-modules/cli` → `tanstack-react-modules`

The getting-started guides cover the common case; this section lists every command. Examples below use the React Router binary; substitute `tanstack-react-modules` for the TanStack Router integration.

```bash
# Initialize a new project (see getting-started guides for the full walkthrough)
react-router-modules init my-app --scope @myorg --module dashboard

# Add a module with routes
react-router-modules create module billing --route billing [--nav-group finance]

# Add a headless store wired into AppDependencies
react-router-modules create store notifications

# Scaffold a typed multi-module workflow under journeys/<name>/, install
# `journeysPlugin()` on the registry, and call registerJourney(...) in
# the shell. `--modules` adds typed module imports to the journey's
# module map; `--persistence` also generates a localStorage adapter
# under shell/src/<name>-persistence.ts. See @modular-react/journeys.
react-router-modules create journey customer-onboarding \
  --modules profile,plan,billing [--persistence]
```

Run any command with `--help` for its full flag set. To invoke without installing the CLI, use `npx @react-router-modules/cli <command>` or `npx @tanstack-react-modules/cli <command>`.

Both binaries are thin wrappers around [`@modular-react/cli-core`](packages/cli-core), which owns the command implementations, templates, and project transforms. Each router CLI supplies a preset describing its package names and router-specific template fragments.

## Development

```bash
pnpm install
pnpm build          # Build all packages
pnpm test           # Run all tests
```

## Release labels

Every merged PR to `main` must carry exactly one of these labels. The publish workflow reads the label to decide whether to release and how:

| Label                  | What it does                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patch`                | Run the release. Bump each changed package's patch version.                                                                                                                                                                                                                                                                               |
| `minor`                | Run the release. Bump each changed package's minor version.                                                                                                                                                                                                                                                                               |
| `major`                | Run the release. Bump each changed package's major version.                                                                                                                                                                                                                                                                               |
| `release-same-version` | Run the release, but **do not bump versions** — publish the versions already committed in each `package.json`. Use this when the PR pre-set the versions by hand (e.g. coordinated multi-package release where the docs or example apps reference specific numbers). The workflow still skips any `<name>@<version>` already live on npm. |
| `skip-release`         | Merge without releasing. Use for docs, workflow edits, tests, or anything that doesn't ship library code.                                                                                                                                                                                                                                 |

Attach exactly one label. `release-same-version` wins over `major`/`minor`/`patch` if both are attached. Attaching `skip-release` alongside a release label is ambiguous — the `ensure-labels` check passes but the publish job still fires on the release label, so don't mix them.

## Help & contributing

- **Questions or bugs:** open an issue at [kibertoad/modular-react](https://github.com/kibertoad/modular-react/issues).
- **Pull requests** are welcome. Start with an issue for anything beyond a typo fix so we can agree on the direction.
