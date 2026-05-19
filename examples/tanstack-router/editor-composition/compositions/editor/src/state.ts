export type SourceId = "contentful" | "strapi";

/** See RR sibling for ownership-split rationale. */
export interface EditorState {
  readonly documentId: string;
  readonly activeSource: SourceId | null;
  readonly selectedSourceItem: string | null;
}
