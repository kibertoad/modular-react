import { useState } from "react";
import { JourneyOutlet, useJourneyContext } from "@modular-react/journeys";
import type { TerminalOutcome } from "@modular-react/journeys";
import { integrationSetupHandle } from "@example-tsr-integration-setup/integration-setup-journey";

/**
 * Single-page shell. Press "Start" to mint a journey instance and mount
 * `<JourneyOutlet>` against it; the outlet walks the journey through
 * `chooser` → (specific module | generic fallback) → terminal. The
 * terminal payload is rendered below so e2e tests can assert which
 * branch executed without reaching into module internals.
 */
export function Home() {
  const ctx = useJourneyContext();
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<TerminalOutcome | null>(null);

  if (!ctx) {
    throw new Error(
      "[Home] useJourneyContext() returned null — journeysPlugin() must be attached to the registry.",
    );
  }

  const start = () => {
    setTerminal(null);
    const id = ctx.runtime.start(integrationSetupHandle, { tenantId: "tenant-demo" });
    setInstanceId(id);
  };

  const reset = () => {
    setInstanceId(null);
    setTerminal(null);
  };

  return (
    <div className="container">
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ marginBottom: "0.5rem" }}>Integration setup</h1>
        <p style={{ color: "#4a5568", maxWidth: "55ch" }}>
          Start the journey. The chooser lists every module that contributes to the{" "}
          <code>integrations</code> slot. Pick GitHub or Strapi to land on a dedicated configure
          step; pick Contentful or Notion to land on the generic configure step via the journey's{" "}
          <code>selectModuleOrDefault</code> fallback.
        </p>
      </header>

      {!instanceId && !terminal && (
        <button type="button" data-testid="start-journey" onClick={start}>
          Start integration setup
        </button>
      )}

      {instanceId && !terminal && (
        <div
          style={{
            background: "white",
            padding: "1.5rem",
            border: "1px solid #e2e8f0",
            borderRadius: "0.5rem",
          }}
        >
          <JourneyOutlet
            instanceId={instanceId}
            onFinished={(outcome) => {
              setInstanceId(null);
              setTerminal(outcome);
            }}
          />
        </div>
      )}

      {terminal && (
        <section
          data-testid="result"
          style={{
            background: "white",
            padding: "1.5rem",
            border: "1px solid #e2e8f0",
            borderRadius: "0.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <h2 style={{ margin: 0 }}>
            Journey {terminal.status === "completed" ? "completed" : "aborted"}
          </h2>
          <pre
            data-testid="result-payload"
            style={{
              background: "#f7fafc",
              padding: "0.75rem",
              borderRadius: "0.375rem",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.85rem",
              overflow: "auto",
            }}
          >
            {JSON.stringify(terminal.payload, null, 2)}
          </pre>
          <div>
            <button type="button" data-testid="run-again" onClick={reset}>
              Run again
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
