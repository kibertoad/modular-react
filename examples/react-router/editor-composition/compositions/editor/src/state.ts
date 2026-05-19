/**
 * The composition's scoped store type. Re-exported from `app-shared` so
 * the composition package and in-team panel modules (the editor module)
 * can both import the same type without forming a workspace cycle. See
 * the comment on `EditorState` in `app-shared/src/app-types.ts` for why
 * the shape lives there rather than here.
 */
export type { EditorState, SourceId } from "@example-rr-editor-composition/app-shared";
