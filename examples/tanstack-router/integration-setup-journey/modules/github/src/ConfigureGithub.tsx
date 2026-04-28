import { useState } from "react";
import type { ModuleEntryProps } from "@modular-react/core";
import type { GithubExits } from "./exits.js";

export interface ConfigureGithubInput {
  readonly tenantId: string;
  /** Pre-filled when the chooser knows the user's most-likely repo. */
  readonly suggestedRepo?: string;
}

/**
 * GitHub-specific configure step. The shape of `input` is defined by THIS
 * module — the journey hands it whatever the `selectModuleOrDefault`
 * branch declared. Since github gets a dedicated branch, the journey
 * passes `{ tenantId, suggestedRepo }`; the generic fallback would not.
 */
export function ConfigureGithub({
  input,
  exit,
}: ModuleEntryProps<ConfigureGithubInput, GithubExits>) {
  const [repo, setRepo] = useState(input.suggestedRepo ?? "");

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Configure GitHub</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#4a5568" }}>
          Tenant <code>{input.tenantId}</code> · GitHub-specific configure form.
        </p>
      </header>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span>Repository (owner/name)</span>
        <input
          type="text"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="org/repo"
          data-testid="github-repo-input"
          style={{ padding: "0.4rem", border: "1px solid #cbd5e0", borderRadius: "0.25rem" }}
        />
      </label>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          data-testid="github-save"
          disabled={!repo.includes("/")}
          onClick={() =>
            exit("saved", {
              repo,
              webhookId: `wh_gh_${Math.random().toString(36).slice(2, 10)}`,
            })
          }
        >
          Save GitHub integration
        </button>
        <button type="button" onClick={() => exit("cancelled")}>
          Cancel
        </button>
      </div>
    </section>
  );
}
