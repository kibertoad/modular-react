import {
  createCompositionContext,
  defineComposition,
  defineCompositionHandle,
} from "@modular-react/compositions";
import type { ModuleDescriptor } from "@modular-react/core";
import type { EditorState } from "./app-types.js";

/**
 * Typed module map the composition references in its selectors. Modeled
 * as a `type` (not an `interface`) so it satisfies the
 * `Record<string, ModuleDescriptor<…>>` shape that `ModuleTypeMap`
 * declares — an `interface` with concrete keys is missing the implicit
 * string index signature `Record` requires.
 */
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
      // Always render the editor canvas with the current document id.
      select: ({ state }) => ({
        kind: "module-entry",
        module: "editor",
        entry: "main",
        input: { documentId: state.documentId },
      }),
    },
    source: {
      // Project `activeSource` → a panel module / entry. Selectors are pure;
      // dispatching a new `activeSource` is what causes this zone to flip.
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

/**
 * Typed handle so callers open the composition with a typed input. Mirrors
 * `defineJourneyHandle` — phantom typing, identity-only at runtime.
 */
export const editorCompositionHandle = defineCompositionHandle<"editor", { documentId: string }>({
  id: "editor",
});

/**
 * Pre-typed hook bundle so foreign panel modules don't have to spell
 * `<EditorState>` at every call site. Export from this single place so
 * panels stay consistent across the codebase.
 */
export const createEditorHooks = () => createCompositionContext<EditorState>();
