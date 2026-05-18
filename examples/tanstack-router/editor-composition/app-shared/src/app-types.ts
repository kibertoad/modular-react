/**
 * Shared registry dependencies for the editor-composition example. Mirror
 * of the React Router sibling — no router-specific types live here, so the
 * file can stay identical between the two shells.
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

/** Composition's scoped store — see RR sibling's README for the layout. */
export interface EditorState {
  readonly documentId: string;
  readonly activeSource: SourceId | null;
  readonly selectedSourceItem: string | null;
}
