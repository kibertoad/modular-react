import {
  createCompositionContext,
  defineComposition,
  defineCompositionHandle,
} from "@modular-react/compositions";
import type { ModuleDescriptor } from "@modular-react/core";
import type { EditorState } from "./app-types.js";

/** See RR sibling for rationale on `type` vs `interface`. */
type EditorModuleMap = {
  readonly editor: ModuleDescriptor<any, any, any, any>;
  readonly contentful: ModuleDescriptor<any, any, any, any>;
  readonly strapi: ModuleDescriptor<any, any, any, any>;
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
      select: ({ state }) => ({
        kind: "module-entry",
        module: "editor",
        entry: "main",
        input: { documentId: state.documentId },
      }),
    },
    source: {
      select: ({ state }) =>
        state.activeSource
          ? {
              kind: "module-entry",
              module: state.activeSource,
              entry: "sourcePanel",
              input: { documentId: state.documentId },
            }
          : { kind: "empty" },
    },
    inspector: {
      select: ({ state }) => ({
        kind: "module-entry",
        module: "editor",
        entry: "inspector",
        input: { documentId: state.documentId },
      }),
    },
  },
});

export const editorCompositionHandle = defineCompositionHandle<"editor", { documentId: string }>({
  id: "editor",
});

export const createEditorHooks = () => createCompositionContext<EditorState>();
