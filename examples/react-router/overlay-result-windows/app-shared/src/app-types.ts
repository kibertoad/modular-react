import type { OverlayEntry } from "@modular-react/core";
import type { StepRef, WindowMeta } from "./overlay.js";

/**
 * Shared registry dependencies. The window modules are dependency-free (they
 * contribute static slot entries), so this stays minimal — kept for parity with
 * the sibling examples and to show where cross-module services would live.
 */
export interface AppDependencies {
  readonly auth: { readonly userId: string };
}

/**
 * Slot contributions collected from every module. `resultViews` is the slot the
 * overlay host is keyed on: each module contributes `OverlayEntry<StepRef,
 * WindowMeta>` objects under it through the ordinary `slots` path — the overlay
 * host adds no new registration seam (`OverlayEntry` is a superset of
 * `ComponentEntry`). The base value is `[]`; modules concatenate onto it.
 */
export interface AppSlots {
  readonly resultViews: readonly OverlayEntry<StepRef, WindowMeta>[];
}
