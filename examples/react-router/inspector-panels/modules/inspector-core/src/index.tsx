import { defineModule } from "@react-router-modules/core";
import { usePanelSubject } from "@modular-react/react";
import type {
  AppDependencies,
  AppSlots,
  BoardBlock,
} from "@example-rr-inspector-panels/app-shared";

/**
 * First-party panel module. Contributes two panels to the `inspectorPanels`
 * group through the ordinary `slots` path — no descriptor change, no new
 * registration seam:
 *
 * - `identity` — no `when`, so it shows for every selection (`order: 0`,
 *   rendered first). Reads the subject from the injected `subject` prop.
 * - `frontend-config` — gated to frame-level frontend blocks (`order: 20`,
 *   rendered after `identity`). Reads the subject from context via
 *   `usePanelSubject`, the alternative to the prop for nested content.
 */

/** Always-on panel — reads the subject from the `subject` prop the outlet injects. */
function Identity({ subject }: { subject: BoardBlock }) {
  return (
    <div data-testid="panel-body-identity">
      <h3 style={{ marginTop: 0 }}>Identity</h3>
      <dl style={{ margin: 0 }}>
        <dt style={{ color: "#718096" }}>Label</dt>
        <dd style={{ margin: "0 0 0.5rem" }}>{subject.label}</dd>
        <dt style={{ color: "#718096" }}>Level</dt>
        <dd style={{ margin: "0 0 0.5rem" }}>{subject.level}</dd>
        <dt style={{ color: "#718096" }}>Type</dt>
        <dd data-testid="identity-type" style={{ margin: 0 }}>
          {subject.type}
        </dd>
      </dl>
    </div>
  );
}

/**
 * Frontend-only panel — demonstrates `usePanelSubject`, the context reader that
 * lets nested content reach the subject without prop-drilling. Only mounted when
 * the group's `when` predicate below matches, so `usePanelSubject` is always
 * inside a `<PanelsOutlet>` here and never throws.
 */
function FrontendConfig() {
  const block = usePanelSubject<BoardBlock>();
  return (
    <div data-testid="panel-body-frontend-config">
      <h3 style={{ marginTop: 0 }}>Frontend config</h3>
      <p style={{ margin: 0 }}>
        Bundle split, route, and hydration settings for <strong>{block.label}</strong>.
      </p>
    </div>
  );
}

export default defineModule<AppDependencies, AppSlots>({
  id: "inspector-core",
  version: "1.0.0",
  slots: {
    inspectorPanels: [
      { id: "identity", component: Identity, order: 0 },
      {
        id: "frontend-config",
        component: FrontendConfig,
        order: 20,
        when: (b) => b.level === "frame" && b.type === "frontend",
      },
    ],
  },
});
