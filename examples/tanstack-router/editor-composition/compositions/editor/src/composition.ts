import { defineComposition, defineCompositionHandle } from "@modular-react/compositions";
import type editorModule from "@example-tsr-editor-composition/editor";
import type contentfulModule from "@example-tsr-editor-composition/contentful";
import type strapiModule from "@example-tsr-editor-composition/strapi";
import type { EditorState, SourceId } from "./state.js";

/** See RR sibling for rationale on `type` vs `interface` + dependency direction. */
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
      // In-team hooks pattern — see RR sibling for rationale. Panel
      // reads composition state via `useCompositionState`, not via
      // injected stores.
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

export const editorCompositionHandle = defineCompositionHandle<"editor", { documentId: string }>({
  id: "editor",
});
