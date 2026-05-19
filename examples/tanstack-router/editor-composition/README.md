# Editor composition — TanStack Router example

Mirror of [`examples/react-router/editor-composition`](../../react-router/editor-composition/README.md) on TanStack Router. The composition definition, panel modules, and Playwright assertions are identical — the only differences are the shell's router (TanStack instead of React Router v7) and the Vite port (`5196`).

The composition owns a small scoped store (`documentId`, `activeSource`, `selectedSourceItem`) and projects it into three named zones. The example demos **both** authoring patterns the package supports side-by-side:

- **`main`** — editor canvas. Cross-team **typed-store** pattern: receives `activeSource: WritableStore<SourceId | null>` via `input`, reads/writes through `useSyncExternalStore` + `store.set(...)`.
- **`source`** — Contentful / Strapi / empty based on `activeSource`. Same cross-team pattern, with `selectedItem: WritableStore<string | null>` injected.
- **`inspector`** — same package as the composition team, uses the **in-team hooks** pattern: reads composition state directly via `useCompositionState((s) => s.activeSource)` and `useCompositionState((s) => s.selectedSourceItem)`. Trade-off: the panel module gains a workspace dep on `compositions/editor` for the `EditorState` type — that coupling is what cross-team panels avoid by going through the store contract.

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
pnpm --filter @example-tsr-editor-composition/shell dev
```

Opens `http://localhost:5196`.

## Layout

```text
app-shared/         — shell-team contract: AppDependencies, AppSlots
compositions/
  editor/           — composition team: state, runtime definition, handle.
                      Imports panel module types (one-way: composition → modules).
modules/
  contentful/       — cross-team panel: depends on @modular-react/core ONLY.
  strapi/           — cross-team panel: same shape as contentful.
  editor/           — in-team panel: depends on compositions/editor for the
                      EditorState type, plus @modular-react/compositions for
                      the hooks. Holds the editor `main` + `inspector` entries.
shell/              — registry, root route, CompositionOutlet wiring, e2e.
```

Dependency directions:

- **Cross-team panels (Contentful / Strapi):** `composition → module` only. Modules see only `@modular-react/core` interfaces; the composition's selector projects state into those contracts via `stores.writable(key, { get, set })`. Identity is stable per `(instance, key)`, so `useSyncExternalStore` in panels doesn't re-subscribe across renders.
- **In-team panels (editor / inspector):** `module → composition` for the type import. The inspector calls `useCompositionState<EditorState, …>` to read slices directly; the trade-off is the panel module is now coupled to the composition's `EditorState` shape and only mounts in this composition.

See the package README for the full design rationale on each pattern: [typed store projections (cross-team)](../../../packages/compositions/README.md#pattern--typed-store-projections-composition-unaware-panels) and [hooks (in-team)](../../../packages/compositions/README.md#hooks-for-foreign-panels).
