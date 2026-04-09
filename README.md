# modular-react

modular-react sits on top of React Router or TanStack Router and lets you split your app into self-contained modules. Each module declares its own routes, navigation items, slot contributions, and dependencies, and a typed registry composes them at startup.

The two router integrations are peers. Pick the one that matches the router you already ship.

## The problem this solves

In a router-only setup, every new feature adds entries in `App.tsx`, the sidebar config, the command palette registry, the auth guard list, and wherever else cross-cutting state lives. Four teams editing those same files means constant merge conflicts and no clear ownership. Deleting a feature means hunting its fragments across a dozen places.

modular-react lets each feature own a single `modules/<name>/` directory that fully declares its routes, nav items, commands, zone contributions, and dependencies. The shell never has to know about any specific module; it just registers them and the runtime wires everything together. Adding a feature is `create module`; deleting one is removing a directory and one `registry.register(...)` call.

Good for: plugin-style apps, apps where many teams contribute features, and apps that have grown past the point where one `App.tsx` is still comfortable to edit.

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

| Guide                                                                           | What it covers                                                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [Getting started with React Router](docs/getting-started-react-router.md)       | Scaffold, tour the generated workspace, add modules and stores, turn on the auth guard.                                        |
| [Getting started with TanStack Router](docs/getting-started-tanstack-router.md) | Same walkthrough for the TSR integration, including the `staticData` type augmentation and `beforeLoad` auth guard.            |
| [Shell Patterns (Fundamentals)](docs/shell-patterns.md)                         | Multi-zone layouts, command palette, module-to-shell communication, headless modules, optional deps, cross-store coordination. |
| [Shell Patterns for React Router](docs/shell-patterns-react-router.md)          | Module route shape, route zones via `handle`, `authenticatedRoute` with `loader`, public `shellRoutes`.                        |
| [Shell Patterns for TanStack Router](docs/shell-patterns-tanstack-router.md)    | Module route shape with `createRoute`/`getParentRoute`, route zones via `staticData`, `authenticatedRoute` with `beforeLoad`.  |
| [Workspace Patterns](docs/workspace-patterns.md)                                | Tabbed workspaces, component-only modules, `useActiveZones`, per-session state via `createScopedStore`.                        |

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

The shell assembles modules into a running app via a registry:

```typescript
import { createRegistry } from "@react-router-modules/runtime";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
});

registry.register(billingModule);
registry.register(usersModule);

const { App, recalculateSlots } = registry.resolve({
  rootComponent: RootLayout,
  indexComponent: HomePage,
  authenticatedRoute: { loader: requireAuth, Component: ShellLayout },
});

// When a store that `dynamicSlots` depends on changes, call recalculateSlots()
// to re-run the factories and update the visible slot contributions.
authStore.subscribe(recalculateSlots);
```

## Packages

### Shared foundation (router-agnostic)

| Package                                      | Description                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`@modular-react/core`](packages/core)       | Types, slots, navigation, validation, and a lightweight store. No React runtime dependency.               |
| [`@modular-react/react`](packages/react)     | React bindings: context providers, hooks (`useStore`, `useSlots`, `useNavigation`, etc.), error boundary. |
| [`@modular-react/testing`](packages/testing) | Test utilities for resolving modules without rendering.                                                   |

### React Router integration

| Package                                                          | Description                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`@react-router-modules/core`](packages/react-router-core)       | Module definition with React Router `RouteObject` support, typed hooks, scoped stores. |
| [`@react-router-modules/runtime`](packages/react-router-runtime) | Registry, route tree builder, app assembly with all providers wired.                   |
| [`@react-router-modules/testing`](packages/react-router-testing) | `renderModule` and `resolveModule` for testing modules in isolation.                   |
| [`@react-router-modules/cli`](packages/react-router-cli)         | Scaffolding CLI: `reactive init`, `reactive create module`, `reactive create store`.   |

### TanStack Router integration

| Package                                                               | Description                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`@tanstack-react-modules/core`](packages/tanstack-router-core)       | Module definition with TanStack Router `createRoute` support, typed hooks, scoped stores. |
| [`@tanstack-react-modules/runtime`](packages/tanstack-router-runtime) | Registry, route tree builder, app assembly with all providers wired.                      |
| [`@tanstack-react-modules/testing`](packages/tanstack-router-testing) | `renderModule` and `resolveModule` for testing modules in isolation.                      |
| [`@tanstack-react-modules/cli`](packages/tanstack-router-cli)         | Scaffolding CLI: `reactive init`, `reactive create module`, `reactive create store`.      |

## Architecture

```
Shared layer (router-agnostic):
  @modular-react/core       (types, slots, navigation, validation, store)
       |
  @modular-react/react      (React hooks, contexts, error boundary)
       |
  @modular-react/testing    (resolveModule without rendering)

Router-specific layers:
  @react-router-modules/*        @tanstack-react-modules/*
  core   (ModuleDescriptor        core   (ModuleDescriptor
          with RouteObject)                with createRoute)
  runtime (registry, route         runtime (registry, route
           tree, app assembly)              tree, app assembly)
  testing (renderModule)           testing (renderModule)
  cli     (scaffolding)            cli     (scaffolding)
```

## CLI command reference

Both router integrations ship a `reactive` CLI binary with the same command surface. The getting-started guides cover the common case; this section lists every command.

```bash
# Initialize a new project (see getting-started guides for the full walkthrough)
reactive init my-app --scope @myorg --module dashboard

# Add a module with routes
reactive create module billing --route billing [--nav-group finance]

# Add a headless store wired into AppDependencies
reactive create store notifications
```

Run any command with `--help` for its full flag set. To invoke without installing the CLI, use `npx @react-router-modules/cli <command>` or `npx @tanstack-react-modules/cli <command>`.

## Development

```bash
pnpm install
pnpm build          # Build all packages
pnpm test           # Run all tests
```

## Help & contributing

- **Questions or bugs:** open an issue at [kibertoad/modular-react](https://github.com/kibertoad/modular-react/issues).
- **Pull requests** are welcome. Start with an issue for anything beyond a typo fix so we can agree on the direction.
