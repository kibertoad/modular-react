import { useState } from "react";
import type { ModuleEntryProps } from "@modular-react/core";
import type { StrapiExits } from "./exits.js";

export interface ConfigureStrapiInput {
  readonly tenantId: string;
}

/**
 * Strapi-specific configure step — needs a base URL + API token, neither
 * of which the generic fallback would prompt for. That's the payoff of a
 * dedicated module: a UI tailored to the integration's actual auth model.
 */
export function ConfigureStrapi({
  input,
  exit,
}: ModuleEntryProps<ConfigureStrapiInput, StrapiExits>) {
  const [baseUrl, setBaseUrl] = useState("https://strapi.example.com");
  const [apiToken, setApiToken] = useState("");

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Configure Strapi</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#4a5568" }}>
          Tenant <code>{input.tenantId}</code> · Strapi-specific configure form.
        </p>
      </header>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>Base URL</span>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          data-testid="strapi-baseurl-input"
          style={{ padding: "0.4rem", border: "1px solid #cbd5e0", borderRadius: "0.25rem" }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>API token</span>
        <input
          type="text"
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
          placeholder="strapi-api-token"
          data-testid="strapi-token-input"
          style={{ padding: "0.4rem", border: "1px solid #cbd5e0", borderRadius: "0.25rem" }}
        />
      </label>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          data-testid="strapi-save"
          disabled={!apiToken}
          onClick={() => exit("saved", { baseUrl, apiToken })}
        >
          Save Strapi integration
        </button>
        <button type="button" onClick={() => exit("cancelled")}>
          Cancel
        </button>
      </div>
    </section>
  );
}
