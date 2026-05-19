/**
 * The composition's scoped store type. Re-exported from `app-shared` to
 * avoid a workspace cycle with the in-team `modules/editor` package. See
 * RR sibling for rationale.
 */
export type { EditorState, SourceId } from "@example-tsr-editor-composition/app-shared";
