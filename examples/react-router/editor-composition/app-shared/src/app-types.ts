/**
 * Shared registry dependencies for the editor-composition example. Modules
 * declare which keys they need via `requires` — this app's modules are
 * dependency-free, so it stays minimal.
 *
 * Owned by the shell team. Cross-team panels (Contentful, Strapi) talk
 * to the composition only through `WritableStore<T>` / `ReadableStore<T>`
 * interfaces and do NOT see this file. In-team panels (editor + inspector)
 * read composition state directly through `useCompositionState`; the
 * shared `EditorState` shape below is what they import — it lives here,
 * rather than under `compositions/editor/`, to keep the composition
 * package and the editor module package free of a workspace cycle.
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
 * The editor composition's scoped store. Used by the composition's
 * `defineComposition<…, EditorState>(…)` declaration and by the editor
 * module's inspector panel (which reads slices via `useCompositionState`).
 *
 * Shared here rather than under `compositions/editor/` so the editor
 * module doesn't take a workspace dep on the composition package — the
 * composition already type-imports the editor module, and a reciprocal
 * dep would form a cycle that turbo/pnpm refuses to schedule.
 */
export interface EditorState {
  readonly documentId: string;
  readonly activeSource: SourceId | null;
  readonly selectedSourceItem: string | null;
}
