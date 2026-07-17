import type { WritableStore } from "@modular-frontend/core";

export interface StrapiSourceInput {
  readonly documentId: string;
  readonly selectedItem: WritableStore<string | null>;
}
