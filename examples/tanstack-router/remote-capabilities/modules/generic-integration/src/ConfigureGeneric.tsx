import { useState } from "react";
import type { ModuleEntryProps } from "@modular-react/core";
import type { IntegrationDefinition } from "@example-tsr-remote-capabilities/app-shared";
import type { GenericExits } from "./exits.js";

export interface ConfigureGenericInput {
  readonly tenantId: string;
  /**
   * Full remote-manifest definition for the integration the journey
   * dispatched on. The generic step reads `id` to label itself, and reads
   * `authentication.type` to vary the field copy without forking into a
   * per-integration component — the journey's `selectModuleOrDefault`
   * fallback funnels every "no specific module" branch through here.
   */
  readonly integration: IntegrationDefinition;
}

const AUTH_HINT: Record<IntegrationDefinition["authentication"]["type"], string> = {
  oauth: "Paste an OAuth access token issued by the integration's auth flow.",
  apikey: "Paste the integration's API key.",
  none: "No credential required — paste any string to confirm.",
};

/**
 * Generic configure step — destination of the journey's
 * `selectModuleOrDefault` fallback for any kind that doesn't have a
 * dedicated module yet (zendesk, mixpanel, pipedrive, …).
 *
 * The UI is intentionally simple: a single "API key" field. Compare to
 * `ConfigureSalesforce` / `ConfigureHubspot` to see why dedicated modules
 * earn their keep — the journey decides per-integration which fidelity to
 * route to without the catalog or the modules knowing about that decision.
 */
export function ConfigureGeneric({
  input,
  exit,
}: ModuleEntryProps<ConfigureGenericInput, GenericExits>) {
  const [apiKey, setApiKey] = useState("");
  const trimmed = apiKey.trim();
  const { integration } = input;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }} data-testid="generic-title">
          Configure {integration.name}
        </h2>
        <p style={{ margin: "0.25rem 0 0", color: "#4a5568" }}>
          Tenant <code>{input.tenantId}</code> · generic configure form (no dedicated module for{" "}
          <code>{integration.id}</code>).
        </p>
      </header>

      <p style={{ color: "#718096", fontSize: "0.875rem", margin: 0 }}>
        {AUTH_HINT[integration.authentication.type]}
      </p>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>API key</span>
        {/* type=password + autoComplete=new-password keeps the demo from
            teaching the wrong default — even a synthetic credential
            shouldn't be plain-text-rendered or autofilled by the browser. */}
        <input
          type="password"
          autoComplete="new-password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={`${integration.id}-api-key`}
          data-testid="generic-apikey-input"
          style={{ padding: "0.4rem", border: "1px solid #cbd5e0", borderRadius: "0.25rem" }}
        />
      </label>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          data-testid="generic-save"
          disabled={trimmed === ""}
          onClick={() => exit("saved", { kind: integration.id, apiKey: trimmed })}
        >
          Save {integration.name} integration
        </button>
        <button type="button" data-testid="generic-cancel" onClick={() => exit("cancelled")}>
          Cancel
        </button>
      </div>
    </section>
  );
}
