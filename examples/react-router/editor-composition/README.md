# Editor composition — React Router example

A multi-zone editor screen wired with [`@modular-react/compositions`](../../../packages/compositions/README.md). The composition owns a small scoped store (`documentId`, `activeSource`, `selectedSourceItem`) and projects it into three named zones, exposing typed `WritableStore` / `ReadableStore` contracts to the panels:

- **`main`** — always renders the editor canvas. Receives `activeSource: WritableStore<SourceId | null>` so the editor can switch which integration mounts in the side panel.
- **`source`** — mounts Contentful, Strapi, or empty based on `activeSource`. Receives `selectedItem: WritableStore<string | null>` so the panel can publish selections back to sibling zones.
- **`inspector`** — receives readable views of both stores and renders details about the current selection.

The three panel modules know **nothing** about the composition — they import only the structural `ReadableStore<T>` / `WritableStore<T>` interfaces from `@modular-react/core` and read state via `useSyncExternalStore`. Strict shell/composition/panel-team separation is structural: a panel module has zero workspace deps on `compositions/editor`.

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
app-shared/         — shell-team contract: AppDependencies, AppSlots
compositions/
  editor/           — composition team: state, runtime definition, handle.
                      Imports panel module types (one-way: composition → modules).
modules/            — panel teams: pure modules that read `WritableStore<T>` /
                      `ReadableStore<T>` via their `input`. Depend on
                      @modular-react/core ONLY — no workspace dep on either
                      `app-shared` or `compositions/editor`.
shell/              — registry, root route, CompositionOutlet wiring, e2e.
```

Dependency direction is one-way: `composition → modules`. Modules import the
generic store interfaces from `@modular-react/core`; the composition's selector
projects state into those contracts via `stores.writable(key, { get, set })`
and `stores.readable(key, get)`. Identity is stable per `(instance, key)`, so
`useSyncExternalStore` in the panels doesn't re-subscribe across renders.

See [the package README's "typed store projections" pattern](../../../packages/compositions/README.md#pattern--typed-store-projections-composition-unaware-panels)
for the full design rationale.
