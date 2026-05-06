import { useState } from "react";
import type { ModuleEntryProps } from "@modular-react/core";
import type { IntegrationDefinition } from "@example-tsr-remote-capabilities/app-shared";
import type { SalesforceExits } from "./exits.js";

export interface ConfigureSalesforceInput {
  readonly tenantId: string;
  readonly integration: IntegrationDefinition;
}

const INSTANCE_PATTERN = /^https:\/\/[A-Za-z0-9.-]+\.my\.salesforce\.com$/;

/**
 * Salesforce-specific configure step. Asks for the org's `*.my.salesforce.com`
 * instance URL and a sandbox/production toggle on top of the OAuth token —
 * fields the generic fallback would not prompt for. The OAuth dance itself
 * is faked: a real shell would redirect to the integration's `authorizeUrl`
 * and resume the journey on callback.
 */
export function ConfigureSalesforce({
  input,
  exit,
}: ModuleEntryProps<ConfigureSalesforceInput, SalesforceExits>) {
  const [instanceUrl, setInstanceUrl] = useState("https://acme.my.salesforce.com");
  const [environment, setEnvironment] = useState<"production" | "sandbox">("production");
  const trimmedUrl = instanceUrl.trim();
  const validUrl = INSTANCE_PATTERN.test(trimmedUrl);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }} data-testid="salesforce-title">
          Configure Salesforce
        </h2>
        <p style={{ margin: "0.25rem 0 0", color: "#4a5568" }}>
          Tenant <code>{input.tenantId}</code> · Salesforce-specific OAuth form for{" "}
          <strong>{input.integration.name}</strong>.
        </p>
      </header>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>Instance URL</span>
        <input
          type="url"
          value={instanceUrl}
          onChange={(e) => setInstanceUrl(e.target.value)}
          placeholder="https://your-org.my.salesforce.com"
          data-testid="salesforce-instance-input"
          style={{ padding: "0.4rem", border: "1px solid #cbd5e0", borderRadius: "0.25rem" }}
        />
        {!validUrl && trimmedUrl !== "" && (
          <small style={{ color: "#c53030" }}>
            Must be an https URL on <code>*.my.salesforce.com</code>.
          </small>
        )}
      </label>

      <fieldset
        style={{
          display: "flex",
          gap: "1rem",
          border: "1px solid #e2e8f0",
          borderRadius: "0.375rem",
          padding: "0.5rem 0.75rem",
        }}
      >
        <legend style={{ padding: "0 0.25rem", fontSize: "0.85rem", color: "#4a5568" }}>
          Environment
        </legend>
        <label style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
          <input
            type="radio"
            name="environment"
            value="production"
            checked={environment === "production"}
            onChange={() => setEnvironment("production")}
            data-testid="salesforce-env-production"
          />
          Production
        </label>
        <label style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
          <input
            type="radio"
            name="environment"
            value="sandbox"
            checked={environment === "sandbox"}
            onChange={() => setEnvironment("sandbox")}
            data-testid="salesforce-env-sandbox"
          />
          Sandbox
        </label>
      </fieldset>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          data-testid="salesforce-save"
          disabled={!validUrl}
          onClick={() =>
            exit("saved", {
              instanceUrl: trimmedUrl,
              // The "OAuth token" is synthetic on purpose — masked at render
              // time by the catalog so the demo doesn't teach the bad
              // habit of printing real credentials.
              accessToken: `sf_${environment}_${Math.random().toString(36).slice(2, 10)}`,
            })
          }
        >
          Authorize Salesforce ({environment})
        </button>
        <button type="button" data-testid="salesforce-cancel" onClick={() => exit("cancelled")}>
          Cancel
        </button>
      </div>
    </section>
  );
}
