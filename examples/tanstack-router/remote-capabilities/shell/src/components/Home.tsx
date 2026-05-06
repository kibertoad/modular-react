import { Link } from "@tanstack/react-router";

export function Home() {
  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem" }}>Remote Capabilities + Journey</h2>
      <p style={{ color: "#4a5568", marginBottom: "1rem" }}>
        This example combines two patterns from <code>@modular-react/core</code>:
      </p>
      <ul style={{ color: "#4a5568", marginBottom: "1rem", paddingLeft: "1.5rem" }}>
        <li>
          <strong>Remote capability manifests</strong> — backend-delivered JSON drives the catalog
          tiles via <code>mergeRemoteManifests</code> and a single shared component.
        </li>
        <li>
          <strong>Journey orchestration</strong> — clicking <em>Configure</em> on a tile starts the{" "}
          <code>integration-setup</code> journey. Its <code>selectModuleOrDefault</code> dispatch
          routes Salesforce / HubSpot to dedicated configure modules and everything else to the
          generic configure step.
        </li>
      </ul>
      <p style={{ color: "#4a5568", marginBottom: "1rem" }}>
        Open <Link to="/integrations">Integrations</Link> to see it in action. Edit{" "}
        <code>shell/public/integrations.json</code> and reload to add a new tile without changing a
        line of frontend code — new kinds without a dedicated module fall through to the generic
        configure step automatically.
      </p>
    </div>
  );
}
