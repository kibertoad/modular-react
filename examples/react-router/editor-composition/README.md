# Editor composition — React Router example

A multi-zone editor screen wired with [`@modular-react/compositions`](../../../packages/compositions/README.md). The composition owns a small scoped store (`documentId`, `activeIntegrationId`, `selectedSourceItem`) and projects it into three named zones:

- **`main`** — always renders the editor panel.
- **`source`** — toggles between Contentful, Strapi, or empty based on state. Foreign panels mutate the composition state via `useCompositionDispatch`.
- **`inspector`** — reads `selectedSourceItem` from the composition state and shows details about it.

The three panel modules know nothing about the composition. Each is a regular `defineModule` with `entryPoints`; the composition wires them into zones at the layout level.

```text
┌────────────────────────────────────────────────────────────────┐
│  [ source ▾ ]              EDITOR — doc-1                      │
│  Contentful ●                                                  │
│  Strapi ○                                                      │
│  None ○                                                        │
│                                                                │
│  ┌─ Contentful ──────────────┐ ┌─ Inspector ──────────────┐    │
│  │ entry-1  [select]         │ │ Selected: entry-42       │    │
│  │ entry-2  [select]         │ │ Source: contentful       │    │
│  └───────────────────────────┘ └──────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

## Run it

```bash
pnpm --filter @example-rr-editor-composition/shell dev
```

Then open `http://localhost:5197`.

## Layout

```text
app-shared/         — contract panels consume (state types, branded ids, typed hooks)
compositions/
  editor/           — composition definition + typed handle (depends on app-shared)
modules/            — editor / contentful / strapi panel modules (depend on app-shared)
shell/              — registry, root route, CompositionOutlet wiring, e2e
```

Mirrors how journey examples place each journey under `journeys/<journey-id>/`. Panel
modules depend on `app-shared` only — never on `compositions/editor` — so the
composition's runtime definition is not transitively pulled into a panel's bundle and
the boundary "modules don't know which composition hosts them" is structural, not just
a convention.
