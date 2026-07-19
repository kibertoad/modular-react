import { defineModule } from "@react-router-modules/core";
import type {
  AppDependencies,
  AppSlots,
  BoardBlock,
} from "@example-rr-inspector-panels/app-shared";

/**
 * A **consumer** module — the kind a downstream deployment ships. It adds a
 * panel for its own `acme-secure` block type, which the host (`inspector-core`)
 * knows nothing about, with **no edit to the host**: the panel flows in through
 * the same `slots` path every module uses. This is the open-contribution
 * property panels exist to provide.
 *
 * Its id is namespaced (`acme:security-report`) so it can never collide with a
 * first-party panel id — the duplicate-id check would otherwise throw. `order`
 * 10 slots it between `identity` (0) and `frontend-config` (20).
 */
function SecurityReport({ subject }: { subject: BoardBlock }) {
  return (
    <div data-testid="panel-body-acme-security-report">
      <h3 style={{ marginTop: 0 }}>Security report</h3>
      <p style={{ margin: 0 }}>
        Compliance scan for <strong>{subject.label}</strong> — secrets last rotated 3 days ago, no
        findings.
      </p>
    </div>
  );
}

export default defineModule<AppDependencies, AppSlots>({
  id: "acme-extras",
  version: "1.0.0",
  slots: {
    inspectorPanels: [
      {
        id: "acme:security-report",
        component: SecurityReport,
        order: 10,
        when: (b) => b.type === "acme-secure",
      },
    ],
  },
});
