# Examples

End-to-end examples of modular-react patterns. Each example is a self-contained pnpm workspace that consumes the library packages via `workspace:*`.

Examples are split by router integration. Pick the directory for the router you already use; each example is otherwise equivalent.

```text
examples/
├── react-router/
│   └── integration-manager/     Sibling modules sharing a screen (React Router)
└── tanstack-router/
    └── integration-manager/     Sibling modules sharing a screen (TanStack Router)
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

## Adding a new example

1. Create a directory under `examples/<router>/<example-name>/`.
2. Mirror the layout of an existing example: `app-shared/`, `modules/<module-name>/`, `shell/`.
3. Each sub-package has its own `package.json` with a scoped name like `@example-<router>-<example-name>/<package>`.
4. The `pnpm-workspace.yaml` at the repo root already globs `examples/**` — new packages are picked up automatically.
5. Add a short section above describing what the example demonstrates and link it from any relevant doc page.
