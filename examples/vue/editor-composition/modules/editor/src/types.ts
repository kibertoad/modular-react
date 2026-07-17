import type { WritableStore } from "@modular-frontend/core";
import type { SourceId } from "@example-vue-editor/app-shared";

export interface EditorMainInput {
  readonly documentId: string;
  /**
   * The active source id, projected by the composition selector as a
   * `WritableStore`. The panel reads it reactively and writes with
   * `activeSource.set(...)` — it never sees the composition's state shape.
   */
  readonly activeSource: WritableStore<SourceId | null>;
}

/**
 * Inspector input: only the host-provided document id. Composition state
 * (active source + selected item) is read through `useCompositionState` inside
 * the panel — the in-team hooks pattern.
 */
export interface InspectorInput {
  readonly documentId: string;
}
