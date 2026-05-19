# Editor composition — React Router example

A multi-zone editor screen wired with [`@modular-react/compositions`](../../../packages/compositions/README.md). The composition owns a small scoped store (`documentId`, `activeSource`, `selectedSourceItem`) and projects it into three named zones. The example deliberately demos **both** authoring patterns the package supports side-by-side:

- **`main`** — always renders the editor canvas. Cross-team **typed-store** pattern: receives `activeSource: WritableStore<SourceId | null>` via `input` and reads/writes via `useSyncExternalStore` + `store.set(...)`. Module imports nothing composition-specific.
- **`source`** — mounts Contentful or Strapi (or empty) based on `activeSource`. Same cross-team typed-store pattern as `main`, with `selectedItem: WritableStore<string | null>` injected so the panel can publish selections back.
- **`inspector`** — same package as the composition team, so it uses the **in-team hooks** pattern: reads composition state directly via `useCompositionState((s) => s.activeSource)` and `useCompositionState((s) => s.selectedSourceItem)`. Receives only `{ documentId }` via `input` because state-reading happens through context. Trade-off: the panel module gains a workspace dep on `compositions/editor` for the `EditorState` type import; that coupling is what cross-team panels avoid by going through the store contract.

Contentful and Strapi panel modules know **nothing** about the composition — they import only the structural `WritableStore<T>` interface from `@modular-react/core`. The editor module sits inside the composition team's package boundary, so it can import the composition's `EditorState` for the inspector's hook calls.

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
modules/
  contentful/       — cross-team panel: depends on @modular-react/core ONLY.
                      Reads via useSyncExternalStore + WritableStore.set.
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
