import type { WritableStore } from "@modular-frontend/core";

export interface ContentfulSourceInput {
  readonly documentId: string;
  /**
   * Selected source item id. The composition provides a writable store
   * projection; this module reads via `useReactiveStore` and writes via
   * `selectedItem.set(...)`. The module does not know the composition's state
   * shape — only that a `WritableStore<string | null>` is wired in.
   */
  readonly selectedItem: WritableStore<string | null>;
}
