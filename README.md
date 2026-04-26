# modular-react

modular-react sits on top of React Router or TanStack Router and lets you split your app into self-contained modules. Each module declares its own routes, navigation items, slot contributions, and dependencies, and a typed registry composes them at startup.

The two router integrations are peers. Pick the one that matches the router you already ship.

## The problem this solves

In a router-only setup, every new feature adds entries in `App.tsx`, the sidebar config, the command palette registry, the auth guard list, and wherever else cross-cutting state lives. Four teams editing those same files means constant merge conflicts and no clear ownership. Deleting a feature means hunting its fragments across a dozen places.

modular-react lets each feature own a single `modules/<name>/` directory that fully declares its routes, nav items, commands, zone contributions, and dependencies. The shell never has to know about any specific module; it just registers them and the runtime wires everything together. Adding a feature is `create module`; deleting one is removing a directory and one `registry.register(...)` call.

Good for: plugin-style apps, apps where many teams contribute features, and apps that have grown past the point where one `App.tsx` is still comfortable to edit.

When a domain flow must span **several modules in sequence** (e.g. "confirm the customer's profile → branch into plan selection → collect a payment or activate a trial"), an optional [Journeys](packages/journeys/README.md) layer composes those modules into a typed, serializable workflow without leaking state into the shell.

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

All packages target **React 19** and **Node 22+**. The docs and CLI scaffolder assume **pnpm workspaces**, but nothing in the runtime or CLI is pnpm-specific; any local package resolution that understands the `workspace:*` protocol (Yarn Berry, Bun) will work after scaffolding with a few script edits. See each getting-started guide for the full pinned version set.

## Quickstart

```bash
# React Router
npx @react-router-modules/cli init my-app --scope @myorg --module dashboard

# TanStack Router
npx @tanstack-react-modules/cli init my-app --scope @myorg --module dashboard

cd my-app && pnpm install && pnpm dev
```

For the walkthrough of what the scaffold produces and how to extend it, see the getting-started guide for your router:

- [Getting started with React Router](docs/getting-started-react-router.md)
- [Getting started with TanStack Router](docs/getting-started-tanstack-router.md)

> **Package manager:** the scaffold produces a **pnpm workspace**. Yarn Berry and Bun will work after scaffolding with minor script edits; **npm is not supported** because it doesn't implement the `workspace:*` protocol. Turborepo is orthogonal; run it on top of pnpm. See the getting-started guides for details.

## Guides

Conceptual documentation for building apps with the framework. Start with a getting-started guide, then dig into the shell patterns once you want to go beyond the defaults.

| Guide                                                                              | What it covers                                                                                                                                                                           |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Getting started with React Router](docs/getting-started-react-router.md)          | Scaffold, tour the generated workspace, add modules and stores, turn on the auth guard.                                                                                                  |
| [Getting started with TanStack Router](docs/getting-started-tanstack-router.md)    | Same walkthrough for the TSR integration, including the `staticData` type augmentation and `beforeLoad` auth guard.                                                                      |
| [Framework-mode (React Router v7)](docs/framework-mode-react-router.md)            | `resolveManifest()` integration with `@react-router/dev/vite` — keep file-based `routes.ts`, `+types/route.ts`, HMR, and SSR.                                                            |
| [Framework-mode (TanStack Router & Start)](docs/framework-mode-tanstack-router.md) | `resolveManifest()` integration with `@tanstack/router-plugin` and TanStack Start — keep file-based `routeTree.gen.ts`, typed routes, SSR.                                               |
| [Navigation: typed labels, dynamic hrefs, meta](docs/navigation.md)                | `NavigationItem<TLabel, TContext, TMeta>` — typed i18n keys, context-aware `to`, app-owned `meta` for permissions/badges.                                                                |
| [Shell Patterns (Fundamentals)](docs/shell-patterns.md)                            | Multi-zone layouts, command palette, module-to-shell communication, headless modules, optional deps, cross-store coordination.                                                           |
| [Shell Patterns for React Router](docs/shell-patterns-react-router.md)             | Module route shape, route zones via `handle`, `useRouteData` for non-component metadata, auth guards, public shell routes.                                                               |
| [Shell Patterns for TanStack Router](docs/shell-patterns-tanstack-router.md)       | Module route shape with `createRoute`/`getParentRoute`, route zones via `staticData`, `useRouteData`, `beforeLoad` auth.                                                                 |
| [Workspace Patterns](docs/workspace-patterns.md)                                   | Tabbed workspaces, component-only modules, `useActiveZones`, per-session state via `createScopedStore`.                                                                                  |
| [Sibling modules sharing a screen](docs/sibling-modules-shared-screen.md)          | One generic screen (e.g. an integration manager) rendered by several sibling modules with per-module config flowing through typed handle (React Router) or staticData (TanStack Router). |
| [Journeys](packages/journeys/README.md)                                            | Typed multi-module workflows with serializable shared state — entry/exit contracts, branch/complete/abort transitions, pluggable persistence.                                            |
| [Remote Capability Manifests](docs/remote-capability-manifests.md)                 | Drive slots/navigation from backend JSON — `RemoteModuleManifest`, `mergeRemoteManifests`, validation, SSR, and the single-module pattern.                                               |

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

## Examples

Runnable examples live under [`examples/`](examples/), split by router integration. Each is a self-contained pnpm workspace that resolves the library packages from this repo, so changes in `packages/*` are reflected the next time you run the example (some examples pin `workspace:*` on every dep, others declare library deps with semver ranges and rely on the repo's `.npmrc` `link-workspace-packages=true` — either way the local source wins):

- [`examples/react-router/integration-manager/`](examples/react-router/integration-manager) — sibling modules sharing a screen (React Router)
- [`examples/tanstack-router/integration-manager/`](examples/tanstack-router/integration-manager) — sibling modules sharing a screen (TanStack Router)
- [`examples/react-router/customer-onboarding-journey/`](examples/react-router/customer-onboarding-journey) — multi-module workflow with typed journeys (React Router)
- [`examples/tanstack-router/customer-onboarding-journey/`](examples/tanstack-router/customer-onboarding-journey) — multi-module workflow with typed journeys (TanStack Router)
- [`examples/react-router/remote-capabilities/`](examples/react-router/remote-capabilities) — slots/navigation driven by a backend-served remote manifest
- [`examples/react-router/active-project-manifest/`](examples/react-router/active-project-manifest) — per-project remote manifests swapped at runtime

See [`examples/README.md`](examples/README.md) for how to run them and how to add new ones.

## Packages

### Shared foundation (router-agnostic)

| Package                                        | Description                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`@modular-react/core`](packages/core)         | Types, slots, navigation, validation, and a lightweight store. No React runtime dependency.               |
| [`@modular-react/react`](packages/react)       | React bindings: context providers, hooks (`useStore`, `useSlots`, `useNavigation`, etc.), error boundary. |
| [`@modular-react/testing`](packages/testing)   | Test utilities for resolving modules without rendering.                                                   |
| [`@modular-react/journeys`](packages/journeys) | Typed, serializable multi-module workflows with entry/exit contracts and a pluggable persistence adapter. |
| [`@modular-react/cli-core`](packages/cli-core) | Shared command implementations and templates for the router-specific CLI binaries.                        |

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

## Architecture

```
Shared layer (router-agnostic):
  @modular-react/core       (types, slots, navigation, validation, store)
       |
  @modular-react/react      (React hooks, contexts, error boundary)
       |
  @modular-react/testing    (resolveModule without rendering)
       |
  @modular-react/journeys   (typed multi-module workflows, optional)
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
