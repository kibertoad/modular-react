# modular-react

A framework for building modular React applications with pluggable routing. Define self-contained modules that declare their routes, navigation, slot contributions, and dependencies — then assemble them into a running app via a registry.

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

Modules define their contributions declaratively:

```typescript
import { defineModule } from "@react-router-modules/core"; // or @tanstack-react-modules/core

export default defineModule<AppDependencies, AppSlots>({
  id: "billing",
  version: "1.0.0",
  createRoutes: () => [{ path: "billing", Component: BillingPage }],
  navigation: [{ label: "Billing", to: "/billing", group: "finance" }],
  slots: { commands: [{ id: "export", label: "Export Invoices" }] },
  dynamicSlots: (deps) => ({
    commands: deps.auth.user?.isAdmin ? [{ id: "void", label: "Void Invoice" }] : [],
  }),
});
```

The registry assembles modules into a running app:

```typescript
import { createRegistry } from "@react-router-modules/runtime";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
});

registry.register(billingModule);
registry.register(usersModule);

const { App, recalculateSlots } = registry.resolve({
  rootComponent: Layout,
  indexComponent: HomePage,
});
```

## CLI reference

Both router integrations ship a scaffolding CLI:

```bash
# Initialize a new project
reactive init my-app --scope @myorg --module dashboard

# Add a module with routes
reactive create module billing --route billing

# Add a headless store module
reactive create store notifications
```

## Development

```bash
pnpm install
pnpm build          # Build all packages
pnpm test           # Run all tests
```
