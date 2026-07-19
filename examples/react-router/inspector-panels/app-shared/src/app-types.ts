import type { PanelEntry } from "@modular-react/core";
import type { BoardBlock } from "./board.js";

/**
 * Shared registry dependencies. The panel modules are dependency-free (they
 * contribute static slot entries), so this stays minimal — kept for parity with
 * the sibling examples and to show where cross-module services would live.
 */
export interface AppDependencies {
  readonly auth: { readonly userId: string };
}

/**
 * Slot contributions collected from every module. `inspectorPanels` is the slot
 * the panel group is keyed on: each module contributes `PanelEntry<BoardBlock>`
 * objects under it through the ordinary `slots` path — panels add no new
 * registration seam. The base value is `[]`; modules concatenate onto it.
 */
export interface AppSlots {
  readonly inspectorPanels: readonly PanelEntry<BoardBlock>[];
}
