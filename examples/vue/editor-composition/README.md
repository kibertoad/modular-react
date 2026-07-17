# Editor Composition — Vue Router

An editor screen with a main canvas, an integration source picker, and an inspector panel — each owned by a different module and coordinated through [`@modular-vue/compositions`](../../../packages/vue-compositions). The Vue analog of the React Router [editor-composition](../../react-router/editor-composition) example.

Shows zone selectors, a per-instance scoped store, typed store projections via `input` (the cross-team `WritableStore` pattern), and the in-team hooks pattern (`useCompositionState`) for a panel that ships alongside the composition.

## Layout

```text
app-shared/                shared types (EditorState, SourceId) + a useReactiveStore
                           bridge composable (WritableStore → Vue ref)
compositions/
  editor/                  the composition definition (framework-neutral): zones +
                           selectors that project state into typed store injections
modules/
  editor/                  main canvas (cross-team WritableStore) + inspector (in-team hooks) SFCs
  contentful/              a source-integration panel (SFC)
  strapi/                  another source panel (SFC)
shell/                     the Vite app: registers the modules + composition, mounts
                           the CompositionOutlet with a three-zone layout
```

## Run it

```bash
pnpm install
pnpm --filter "@example-vue-editor/shell" dev
```

Pick a source integration on the left of the canvas; the source panel mounts in the `source` zone and the inspector reflects your selection — all coordinated through the composition's scoped store.

## Key files to read

- `compositions/editor/src/composition.ts` — the composition: `main` / `source` / `inspector` zones and their selectors. `source` swaps its panel based on `activeSource`; selectors project state into `WritableStore` injections via `stores.writable(...)`. Framework-neutral — identical to the React source.
- `modules/editor/src/EditorMain.vue` — cross-team pattern: reads/writes the injected `WritableStore<SourceId | null>` via the `useReactiveStore` bridge.
- `modules/editor/src/InspectorPanel.vue` — in-team pattern: reads composition state directly with `useCompositionState`.
- `shell/src/components/Home.vue` — `useComposition(handle, input)` + `<CompositionOutlet>` with a scoped default slot; the only place that knows the zone layout.

## How it differs from the React Router example

Same composition engine, framework-forced differences:

- **The composition definition is unchanged** except for importing from `@modular-vue/compositions`. Compositions are framework-neutral.
- **The render-prop becomes a scoped slot.** `<CompositionOutlet>`'s default slot receives a `{ [zone]: VNode }` map; each zone renders via `<component :is="zones.x" />`. The host owns layout; the framework owns each zone's content.
- **Cross-team panels read the injected store with a `useReactiveStore` bridge** (the Vue analog of React's `useSyncExternalStore`), and write with the store's `set(...)`.
- **The shell uses `resolveManifest()` (framework mode).** The manifest's `Providers` threads the compositions plugin's `<CompositionsProvider>`, so `useComposition` / `<CompositionOutlet>` read the runtime from context.
