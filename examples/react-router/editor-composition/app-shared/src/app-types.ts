/**
 * Shared registry dependencies for the editor-composition example. Modules
 * declare which keys they need via `requires` — this app's modules are
 * dependency-free, so it stays minimal.
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

/**
 * The composition's scoped store. The `main` zone always renders the
 * editor; the `source` zone projects `activeSource` → Contentful / Strapi
 * / empty; the `inspector` zone projects `selectedSourceItem` → details.
 */
export interface EditorState {
  readonly documentId: string;
  readonly activeSource: SourceId | null;
  readonly selectedSourceItem: string | null;
}
