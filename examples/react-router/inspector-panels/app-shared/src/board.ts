import { definePanelGroup } from "@modular-react/core";

/**
 * The **subject** the inspector panels key on — a block on a design board.
 * Selecting a block drives the inspector rail: each panel decides for itself,
 * via its `when(block)` predicate, whether it applies to the selection.
 *
 * `level` and `type` are the two axes the sample panels gate on:
 * - `inspector-core` contributes an always-on `identity` panel plus a
 *   `frontend-config` panel gated to frame-level frontend blocks.
 * - the consumer `acme-extras` module contributes a `security-report` panel
 *   for its own `acme-secure` block type — with no edit to the host.
 */
export interface BoardBlock {
  readonly id: string;
  readonly label: string;
  readonly level: "frame" | "leaf";
  readonly type: "frontend" | "backend" | "acme-secure";
}

/**
 * The shared panel-group handle. Exported once and imported at both the host
 * (`shell`, which renders `<PanelsOutlet group={inspectorPanels} …>`) and every
 * contributor (the panel modules), so the subject type is stated in exactly one
 * place. Its only runtime field is the slot key modules contribute under.
 */
export const inspectorPanels = definePanelGroup<BoardBlock>("inspectorPanels");

/**
 * Sample board. Each block exercises a different arm of the panel predicates —
 * see the README's "what renders" table, which this data matches row-for-row.
 */
export const BOARD: readonly BoardBlock[] = [
  { id: "block-login", label: "Login frame", level: "frame", type: "frontend" },
  { id: "block-auth", label: "Auth service", level: "leaf", type: "backend" },
  { id: "block-vault", label: "Secrets vault", level: "frame", type: "acme-secure" },
];
