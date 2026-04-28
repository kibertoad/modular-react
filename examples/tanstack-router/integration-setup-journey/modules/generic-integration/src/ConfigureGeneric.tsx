import { useState } from "react";
import type { ModuleEntryProps } from "@modular-react/core";
import type { IntegrationKind } from "@example-tsr-integration-setup/app-shared";
import type { GenericExits } from "./exits.js";

export interface ConfigureGenericInput {
  readonly tenantId: string;
  /**
   * The integration the chooser picked. Lets the generic UI display the
   * right title without forking into per-integration components — the
   * journey's selectModuleOrDefault fallback funnels every "no specific
   * module" branch through here.
   */
  readonly kind: IntegrationKind;
}

/**
 * Generic configure step — the destination of the journey's
 * `selectModuleOrDefault` fallback for any integration kind that doesn't
 * have a dedicated module yet (contentful, notion, …).
 *
 * The UI is intentionally simple: a single "API key" field. A real shell
 * would have more shape, but the surface area difference between this
 * and a dedicated module (see `github` / `strapi`) is the point — the
 * journey can pick the right level of fidelity per integration without
 * the chooser or the modules knowing about that decision.
 */
export function ConfigureGeneric({
  input,
  exit,
}: ModuleEntryProps<ConfigureGenericInput, GenericExits>) {
  const [apiKey, setApiKey] = useState("");

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }} data-testid="generic-title">
          Configure {input.kind}
        </h2>
        <p style={{ margin: "0.25rem 0 0", color: "#4a5568" }}>
          Tenant <code>{input.tenantId}</code> · generic API-key form (no dedicated module for{" "}
          <code>{input.kind}</code>).
        </p>
      </header>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>API key</span>
        <input
          type="text"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={`${input.kind}-api-key`}
          data-testid="generic-apikey-input"
          style={{ padding: "0.4rem", border: "1px solid #cbd5e0", borderRadius: "0.25rem" }}
        />
      </label>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          data-testid="generic-save"
          disabled={!apiKey}
          onClick={() => exit("saved", { kind: input.kind, apiKey })}
        >
          Save {input.kind} integration
        </button>
        <button type="button" onClick={() => exit("cancelled")}>
          Cancel
        </button>
      </div>
    </section>
  );
}
