# Examples

End-to-end examples of modular-react patterns. Each example is a self-contained pnpm workspace that consumes the library packages via `workspace:*`.

Examples are split by router integration. Pick the directory for the router you already use; each example is otherwise equivalent.

```text
examples/
├── react-router/
│   ├── integration-manager/          Sibling modules sharing a screen (React Router)
│   ├── customer-onboarding-journey/  Multi-module workflow via @modular-react/journeys (React Router)
│   ├── remote-capabilities/          Slots/navigation driven by a backend-served remote manifest
│   └── active-project-manifest/      Per-project remote manifests swapped at runtime
└── tanstack-router/
    ├── integration-manager/          Sibling modules sharing a screen (TanStack Router)
    └── customer-onboarding-journey/  Multi-module workflow via @modular-react/journeys (TanStack Router)
```

## Running an example

From the repo root:

```bash
pnpm install
pnpm --filter "@example-<router>-integration-manager/shell" dev
```

For instance, to run the React Router variant:

```bash
pnpm --filter "@example-rr-integration-manager/shell" dev
```

## What each example demonstrates

### `integration-manager`

Three sibling modules (Contentful, Strapi, GitHub) that all render the same generic `<IntegrationManager>` screen but with different columns, buttons, and feature flags. Shell header commands adapt to the active integration via `useRouteData`. Documented in [docs/sibling-modules-shared-screen.md](../docs/sibling-modules-shared-screen.md).

### `customer-onboarding-journey`

A multi-module onboarding flow (`profile → plan → billing`) composed with `@modular-react/journeys`. Shows entry/exit contracts, branching, serializable shared state, and workspace-tab persistence. Documented alongside the [Journeys package](../packages/journeys/README.md).

### `remote-capabilities`

Slots and navigation are driven by a backend-served `RemoteModuleManifest` JSON file instead of being baked into the module source. Useful for tenants that toggle features per environment.

### `active-project-manifest`

Extension of `remote-capabilities` where the active manifest is swapped at runtime when the user switches projects — each project ships a different JSON manifest, rehydrated into the registry.

## Adding a new example

1. Create a directory under `examples/<router>/<example-name>/`.
2. Mirror the layout of an existing example: `app-shared/`, `modules/<module-name>/`, `shell/`.
3. Each sub-package has its own `package.json` with a scoped name like `@example-<router>-<example-name>/<package>`.
4. The `pnpm-workspace.yaml` at the repo root already globs `examples/**` — new packages are picked up automatically.
5. Add a short section above describing what the example demonstrates and link it from any relevant doc page.
