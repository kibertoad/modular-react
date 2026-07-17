import { defineComposition, defineCompositionHandle } from "@modular-vue/compositions";
import type editorModule from "@example-vue-editor/editor";
import type contentfulModule from "@example-vue-editor/contentful";
import type strapiModule from "@example-vue-editor/strapi";
import type { EditorState, SourceId } from "./state.js";

/**
 * Strongly-typed module map. Imports are `import type` only — the panel modules
 * are not pulled into this package's bundle.
 *
 * **Dependency direction**: composition → modules (one-way). Panel modules
 * depend only on `@modular-frontend/core` (for `ReadableStore` / `WritableStore`
 * interfaces); they do NOT import this package, so no cycle. The composition
 * definition is framework-neutral — identical to the React source bar the import
 * from `@modular-vue/compositions`.
 */
type EditorModuleMap = {
  readonly editor: typeof editorModule;
  readonly contentful: typeof contentfulModule;
  readonly strapi: typeof strapiModule;
};

export const editorComposition = defineComposition<EditorModuleMap, EditorState>()({
  id: "editor",
  version: "1.0.0",
  initialState: (input: { documentId: string }) => ({
    documentId: input.documentId,
    activeSource: null,
    selectedSourceItem: null,
  }),
  zones: {
    main: {
      // Project composition state into a `WritableStore<SourceId | null>` and
      // hand it to the editor canvas via `input`. The panel reads with the
      // `useReactiveStore` bridge and writes with `store.set(...)`. Identity is
      // stable per `(instance, "activeSource")` so the panel doesn't re-subscribe
      // across selector re-runs.
      select: ({ state, stores }) => ({
        kind: "module-entry",
        module: "editor",
        entry: "main",
        input: {
          documentId: state.documentId,
          activeSource: stores.writable<SourceId | null>("activeSource", {
            get: (s) => s.activeSource,
            set: (value) => ({ activeSource: value }),
          }),
        },
      }),
    },
    source: {
      // Project `activeSource` → a source-integration panel. Selectors are pure;
      // the editor panel's `activeSource.set(...)` is what flips this zone on the
      // next render pass.
      select: ({ state, stores }) =>
        state.activeSource
          ? {
              kind: "module-entry",
              module: state.activeSource,
              entry: "sourcePanel",
              input: {
                documentId: state.documentId,
                selectedItem: stores.writable<string | null>("selectedSourceItem", {
                  get: (s) => s.selectedSourceItem,
                  set: (value) => ({ selectedSourceItem: value }),
                }),
              },
            }
          : { kind: "empty" },
    },
    inspector: {
      // Inspector is owned by the same team as the composition, so it reads
      // composition state directly through `useCompositionState` (the in-team
      // hooks pattern). The selector here passes only `documentId` — the panel
      // pulls everything else from context.
      select: ({ state }) => ({
        kind: "module-entry",
        module: "editor",
        entry: "inspector",
        input: {
          documentId: state.documentId,
        },
      }),
    },
  },
});

/**
 * Typed handle so callers open the composition with a typed input. Mirrors
 * `defineJourneyHandle` — phantom typing, identity-only at runtime.
 */
export const editorCompositionHandle = defineCompositionHandle<"editor", { documentId: string }>({
  id: "editor",
});
