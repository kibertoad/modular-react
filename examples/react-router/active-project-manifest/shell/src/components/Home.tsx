import { Link } from "react-router";

export function Home() {
  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem" }}>Active Project Manifest</h2>
      <p style={{ color: "#4a5568", marginBottom: "1rem" }}>
        This example demonstrates the <strong>swap</strong> topology of the Remote Capability
        Manifests pattern: the app holds exactly one manifest at a time — the one for the
        currently-active project. Switching projects discards the old manifest and fetches a new
        one.
      </p>
      <p style={{ color: "#4a5568", marginBottom: "1rem" }}>
        Pick a project in the sidebar, then open <Link to="/integration">Integration</Link> to see
        its capabilities rendered by the shared component. Switch projects and watch the whole
        surface swap — no <code>mergeRemoteManifests</code> in sight.
      </p>
      <p style={{ color: "#718096", fontSize: "0.875rem" }}>
        See the guide: <code>docs/remote-capability-manifests.md</code> — section "Storing:
        merge-many vs swap-one".
      </p>
    </div>
  );
}
