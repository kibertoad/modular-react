import { useState } from "react";
import type { ModuleEntryProps } from "@modular-react/core";
import type { IntegrationDefinition } from "@example-tsr-remote-capabilities/app-shared";
import type { HubspotExits } from "./exits.js";

export interface ConfigureHubspotInput {
  readonly tenantId: string;
  readonly integration: IntegrationDefinition;
}

const PORTAL_PATTERN = /^[0-9]{4,12}$/;

/**
 * HubSpot-specific configure step. Asks for a portal id (HubSpot's account
 * number) plus a private-app token — the actual auth model HubSpot uses,
 * which the generic API-key field can't represent.
 */
export function ConfigureHubspot({
  input,
  exit,
}: ModuleEntryProps<ConfigureHubspotInput, HubspotExits>) {
  const [portalId, setPortalId] = useState("");
  const [token, setToken] = useState("");
  const trimmedPortal = portalId.trim();
  const trimmedToken = token.trim();
  const validPortal = PORTAL_PATTERN.test(trimmedPortal);
  const canSave = validPortal && trimmedToken !== "";

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }} data-testid="hubspot-title">
          Configure HubSpot
        </h2>
        <p style={{ margin: "0.25rem 0 0", color: "#4a5568" }}>
          Tenant <code>{input.tenantId}</code> · HubSpot-specific configure form for{" "}
          <strong>{input.integration.name}</strong>.
        </p>
      </header>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>HubSpot portal id</span>
        <input
          type="text"
          inputMode="numeric"
          value={portalId}
          onChange={(e) => setPortalId(e.target.value)}
          placeholder="e.g. 12345678"
          data-testid="hubspot-portal-input"
          style={{ padding: "0.4rem", border: "1px solid #cbd5e0", borderRadius: "0.25rem" }}
        />
        {!validPortal && trimmedPortal !== "" && (
          <small style={{ color: "#c53030" }}>Portal id must be 4–12 digits.</small>
        )}
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>Private app token</span>
        {/* type=password + autoComplete=new-password — the example is a
            template; rendering a real token in plain text would teach the
            wrong default. */}
        <input
          type="password"
          autoComplete="new-password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="pat-na1-..."
          data-testid="hubspot-token-input"
          style={{ padding: "0.4rem", border: "1px solid #cbd5e0", borderRadius: "0.25rem" }}
        />
      </label>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          data-testid="hubspot-save"
          disabled={!canSave}
          onClick={() =>
            exit("saved", {
              portalId: trimmedPortal,
              privateAppToken: trimmedToken,
            })
          }
        >
          Save HubSpot integration
        </button>
        <button type="button" data-testid="hubspot-cancel" onClick={() => exit("cancelled")}>
          Cancel
        </button>
      </div>
    </section>
  );
}
