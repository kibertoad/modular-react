/** Id of a source-integration panel hosted in the composition's `source` zone. */
export type SourceId = "contentful" | "strapi";

/**
 * The composition's scoped store. The `main` zone always renders the
 * editor; the `source` zone projects `activeSource` → Contentful / Strapi
 * / empty; the `inspector` zone projects `selectedSourceItem` → details.
 *
 * Lives in the composition package — owned by the composition team, not
 * the shell team. Panel modules depend on this package when they
 * participate in the composition; they do not see it through `app-shared`.
 */
export interface EditorState {
  readonly documentId: string;
  readonly activeSource: SourceId | null;
  readonly selectedSourceItem: string | null;
}
