# Editor composition — TanStack Router example

Mirror of [`examples/react-router/editor-composition`](../../react-router/editor-composition/README.md) on TanStack Router. The composition definition, panel modules, and Playwright assertions are identical — the only differences are the shell's router (TanStack instead of React Router v7) and the Vite port (`5196`).

```bash
pnpm --filter @example-tsr-editor-composition/shell dev
```

Opens `http://localhost:5196`.

## Layout

```text
app-shared/         — shell-team contract: AppDependencies, AppSlots
compositions/
  editor/           — composition team: state, runtime definition, handle
modules/            — panel teams: depend on @modular-react/core ONLY
shell/              — registry, root route, CompositionOutlet wiring, e2e
```

Same store-contract pattern as the RR sibling — see [its README](../../react-router/editor-composition/README.md) and the [package authoring patterns](../../../packages/compositions/README.md#pattern--typed-store-projections-composition-unaware-panels) for the design rationale.
