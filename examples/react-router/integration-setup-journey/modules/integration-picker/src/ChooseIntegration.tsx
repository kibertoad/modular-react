import type { ModuleEntryProps } from "@modular-react/core";
import { useSlots } from "@modular-react/react";
import type { AppSlots } from "@example-rr-integration-setup/app-shared";
import type { PickerExits } from "./exits.js";

export interface ChooseIntegrationInput {
  readonly tenantId: string;
}

/**
 * Generic chooser screen. The list of integrations comes from the
 * `integrations` slot — every module that contributes a row decides what
 * `id`/`label`/`description` it surfaces. The chooser stays agnostic of
 * which integrations exist or which ones map to dedicated modules.
 *
 * The journey owns the dispatch table (`selectModuleOrDefault`); the
 * chooser only reports which kind the user picked.
 */
export function ChooseIntegration({ exit }: ModuleEntryProps<ChooseIntegrationInput, PickerExits>) {
  const { integrations } = useSlots<AppSlots>();

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Pick an integration</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#4a5568" }}>
          {integrations.length} integration
          {integrations.length === 1 ? "" : "s"} available — pick one to configure.
        </p>
      </header>

      <ul
        data-testid="integration-list"
        style={{
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        {integrations.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              data-testid={`pick-${option.id}`}
              onClick={() => exit("chosen", { kind: option.id })}
              style={{ width: "100%", textAlign: "left" }}
            >
              <strong>{option.label}</strong>
              <span style={{ color: "#718096", marginLeft: "0.5rem" }}>{option.description}</span>
            </button>
          </li>
        ))}
      </ul>

      <div>
        <button type="button" onClick={() => exit("cancelled")}>
          Cancel
        </button>
      </div>
    </section>
  );
}
