import { useRef, useState } from "react";
import { JourneyOutlet, useJourneyContext } from "@modular-react/journeys";
import type { TerminalOutcome } from "@modular-react/journeys";
import { integrationSetupHandle } from "@example-rr-integration-setup/integration-setup-journey";

/**
 * Field names whose values are sensitive enough that a demo shouldn't
 * print them straight into the page. The rendered payload swaps them for
 * a redaction marker; the underlying journey state still holds the real
 * value (a real shell would forward that to a backend, audit log, etc.).
 *
 * Keys listed here cover the github webhook id, the strapi token, and
 * the generic fallback's API key — i.e. every secret-shaped field the
 * example modules can emit.
 */
const SENSITIVE_KEYS = new Set(["apiKey", "apiToken", "token", "secret", "password", "webhookId"]);
const REDACTED = "[redacted]";

/**
 * Recursively walk the terminal payload and mask the value of any key
 * listed in `SENSITIVE_KEYS`. Non-object values pass through untouched
 * so the shape stays diff-friendly in the rendered JSON.
 */
function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k) ? REDACTED : redactSecrets(v);
    }
    return out;
  }
  return value;
}

/**
 * Single-page shell. Press "Start" to mint a journey instance and mount
 * `<JourneyOutlet>` against it; the outlet walks the journey through
 * `integration-picker` → (specific module | generic fallback) → terminal.
 * The terminal payload is rendered below so e2e tests can assert which
 * branch executed without reaching into module internals — secrets are
 * masked before they hit the DOM.
 */
export function Home() {
  const ctx = useJourneyContext();
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<TerminalOutcome | null>(null);
  // Synchronous re-entry guard — without it, a double-click on the Start
  // button between renders mints two journey instances (the second one
  // orphans the first, since `setInstanceId` only keeps the last id).
  const startingRef = useRef(false);

  if (!ctx) {
    throw new Error(
      "[Home] useJourneyContext() returned null — journeysPlugin() must be attached to the registry.",
    );
  }

  const start = () => {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      setTerminal(null);
      const id = ctx.runtime.start(integrationSetupHandle, { tenantId: "tenant-demo" });
      setInstanceId(id);
    } finally {
      startingRef.current = false;
    }
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
          Start the journey. The picker lists every module that contributes to the{" "}
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
          <p style={{ color: "#718096", fontSize: "0.85rem", margin: 0 }}>
            Sensitive fields ({Array.from(SENSITIVE_KEYS).join(", ")}) are masked before display.
          </p>
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
            {JSON.stringify(redactSecrets(terminal.payload), null, 2)}
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
