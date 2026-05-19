import { defineComposition, defineCompositionHandle } from "@modular-react/compositions";
import type editorModule from "@example-rr-editor-composition/editor";
import type contentfulModule from "@example-rr-editor-composition/contentful";
import type strapiModule from "@example-rr-editor-composition/strapi";
import type { EditorState, SourceId } from "./state.js";

/**
 * Strongly-typed module map. Imports are `import type` only — the panel
 * modules are not pulled into this package's bundle.
 *
 * **Dependency direction**: composition → modules (one-way). Panel modules
 * depend only on `@modular-react/core` (for `ReadableStore` /
 * `WritableStore` interfaces); they do NOT import this package, so no
 * cycle. With each module's `entryPoints` typed via `defineModule`,
 * `ZoneSpec<EditorModuleMap>` checks `input` against the target entry's
 * declared schema at compile time — a wrong-shaped input or a typo'd
 * entry name fails to typecheck.
 *
 * Mirrors how journey examples type their module map.
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
      // Project composition state into a `WritableStore<SourceId | null>`
      // and hand it to the editor canvas via `input`. The panel reads
      // with `useSyncExternalStore(store.subscribe, store.getSnapshot)`
      // and writes with `store.set(...)`. Identity is stable per
      // `(instance, "activeSource")` so the panel doesn't re-subscribe
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
      // Project `activeSource` → a source-integration panel. Selectors
      // are pure; the editor panel's `activeSource.set(...)` is what
      // causes this zone to flip on the next render pass.
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
      // Inspector reads only — readable stores are sufficient.
      select: ({ state, stores }) => ({
        kind: "module-entry",
        module: "editor",
        entry: "inspector",
        input: {
          documentId: state.documentId,
          activeSource: stores.readable<SourceId | null>("activeSource:r", (s) => s.activeSource),
          selectedItem: stores.readable<string | null>(
            "selectedSourceItem:r",
            (s) => s.selectedSourceItem,
          ),
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
