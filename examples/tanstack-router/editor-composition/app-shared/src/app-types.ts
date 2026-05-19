/**
 * Shared registry dependencies for the editor-composition example. Mirror
 * of the React Router sibling. See RR app-types.ts for the full ownership
 * rationale: cross-team panels go through store contracts and don't see
 * this file; in-team panels import `EditorState` from here to avoid a
 * workspace cycle between the composition package and the editor module.
 */
export interface AppDependencies {
  readonly auth: { readonly userId: string };
}

/** No slot contributions in this example — kept for parity with siblings. */
export interface AppSlots {
  readonly commands: readonly { readonly id: string; readonly label: string }[];
}

/** Id of a source-integration panel hosted in the composition's `source` zone. */
export type SourceId = "contentful" | "strapi";

/** See RR sibling for ownership-split rationale. */
export interface EditorState {
  readonly documentId: string;
  readonly activeSource: SourceId | null;
  readonly selectedSourceItem: string | null;
}
