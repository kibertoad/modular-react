import { Link } from "react-router";

export function Home() {
  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem" }}>Remote Capability Manifests</h2>
      <p style={{ color: "#4a5568", marginBottom: "1rem" }}>
        This example demonstrates driving frontend capabilities from backend-delivered JSON
        manifests using <code>@modular-react/core</code>.
      </p>
      <p style={{ color: "#4a5568", marginBottom: "1rem" }}>
        Open <Link to="/integrations">Integrations</Link> to see the tiles assembled from{" "}
        <code>shell/public/integrations.json</code> — the file that stands in for a real backend in
        this example. Edit it and reload to add a new tile without changing a line of frontend code.
      </p>
      <p style={{ color: "#718096", fontSize: "0.875rem" }}>
        See the guide: <code>docs/remote-capability-manifests.md</code>
      </p>
    </div>
  );
}
