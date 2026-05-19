# Editor composition — TanStack Router example

Mirror of [`examples/react-router/editor-composition`](../../react-router/editor-composition/README.md) on TanStack Router. The composition definition, panel modules, and Playwright assertions are identical — the only differences are the shell's router (TanStack instead of React Router v7) and the Vite port (`5196`).

```bash
pnpm --filter @example-tsr-editor-composition/shell dev
```

Opens `http://localhost:5196`.

## Layout

```text
app-shared/         — contract panels consume (state types, branded ids, typed hooks)
compositions/
  editor/           — composition definition + typed handle (depends on app-shared)
modules/            — editor / contentful / strapi panel modules (depend on app-shared)
shell/              — registry, root route, CompositionOutlet wiring, e2e
```

Same module-layout argument as the RR sibling: panel modules depend on `app-shared`
only, not on the composition definition package.
