import { useRef, useState } from "react";
import { useSlots } from "@tanstack-react-modules/runtime";
import { JourneyOutlet, useJourneyContext, type TerminalOutcome } from "@modular-react/journeys";
import {
  useStore,
  type AppSlots,
  type IntegrationDefinition,
  type IntegrationKind,
} from "@example-tsr-remote-capabilities/app-shared";
import { integrationSetupHandle } from "@example-tsr-remote-capabilities/integration-setup-journey";

const ICON_MAP: Record<string, string> = {
  crm: "🤝",
  ticketing: "🎫",
  analytics: "📊",
  marketing: "📣",
  plug: "🔌",
};

function renderIcon(icon: string): string {
  return ICON_MAP[icon] ?? ICON_MAP.plug;
}

const AUTH_LABEL: Record<IntegrationDefinition["authentication"]["type"], string> = {
  oauth: "OAuth",
  apikey: "API key",
  none: "No auth",
};

const FILTER_LABEL: Record<IntegrationDefinition["filters"][number]["type"], string> = {
  search: "Search",
  daterange: "Date range",
};

/**
 * Field names whose values shouldn't reach the demo's rendered terminal
 * payload. Mirrors the redaction set in the existing journey example so
 * the demo doesn't teach the bad habit of printing credentials. The
 * journey state still holds the real value.
 */
const SENSITIVE_KEYS = new Set([
  "apiKey",
  "accessToken",
  "privateAppToken",
  "token",
  "secret",
  "password",
]);
const REDACTED = "[redacted]";

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
 * Catalog page. Reads the merged remote-manifest contributions out of the
 * `integrations` slot, renders one tile per integration, and starts the
 * `integration-setup` journey when the user clicks "Configure". The
 * journey's `start()` dispatches via `selectModuleOrDefault` against the
 * tile's `id` — Salesforce/HubSpot land on dedicated configure modules,
 * everything else lands on the generic configure form. While a journey
 * instance is mounted, the grid is hidden and `<JourneyOutlet>` renders
 * the active step in place.
 */
export default function IntegrationsPage() {
  const { integrations } = useSlots<AppSlots>();
  const status = useStore("integrations", (s) => s.status);
  const error = useStore("integrations", (s) => s.error);
  const connected = useStore("integrations", (s) => s.connected);
  const markConnected = useStore("integrations", (s) => s.markConnected);
  const ctx = useJourneyContext();

  const [activeIntegration, setActiveIntegration] = useState<IntegrationDefinition | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<{
    integration: IntegrationDefinition;
    outcome: TerminalOutcome;
  } | null>(null);
  // Synchronous re-entry guard — without it, a double-click between renders
  // would mint two journey instances and orphan the first.
  const startingRef = useRef(false);

  if (!ctx) {
    throw new Error(
      "[IntegrationsPage] useJourneyContext() returned null — journeysPlugin() must be attached to the registry.",
    );
  }

  const startConfigure = (integration: IntegrationDefinition) => {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      setTerminal(null);
      setActiveIntegration(integration);
      const id = ctx.runtime.start(integrationSetupHandle, {
        tenantId: "tenant-demo",
        integration,
      });
      setInstanceId(id);
    } finally {
      startingRef.current = false;
    }
  };

  const dismissTerminal = () => setTerminal(null);

  const onJourneyFinished = (outcome: TerminalOutcome) => {
    const integration = activeIntegration;
    setInstanceId(null);
    setActiveIntegration(null);
    if (!integration) return;
    if (outcome.status === "completed") {
      markConnected(integration.id);
    }
    setTerminal({ integration, outcome });
  };

  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem" }}>Integrations</h2>
      <p style={{ color: "#718096", marginBottom: "1.5rem" }}>
        Tiles below are merged from <code>shell/public/integrations.json</code> via{" "}
        <code>mergeRemoteManifests</code>. Click <strong>Configure</strong> to start the{" "}
        <code>integration-setup</code> journey — its <code>selectModuleOrDefault</code> dispatch
        routes Salesforce and HubSpot to dedicated modules, and everything else (Zendesk, Mixpanel,
        Pipedrive, …) to the generic configure step. Edit the JSON and reload to see new tiles light
        up automatically.
      </p>

      <StatusBanner status={status} error={error} count={integrations.length} />

      {terminal && (
        <TerminalPanel
          integration={terminal.integration}
          outcome={terminal.outcome}
          onDismiss={dismissTerminal}
        />
      )}

      {instanceId && activeIntegration && (
        <div
          data-testid="journey-host"
          style={{
            marginTop: "1.5rem",
            background: "white",
            padding: "1.5rem",
            border: "1px solid #e2e8f0",
            borderRadius: "0.5rem",
          }}
        >
          <JourneyOutlet instanceId={instanceId} onFinished={onJourneyFinished} />
        </div>
      )}

      {!instanceId && (
        <div
          data-testid="catalog-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "1rem",
            marginTop: "1.5rem",
          }}
        >
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              isConnected={connected.has(integration.id)}
              onConfigure={() => startConfigure(integration)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBanner({
  status,
  error,
  count,
}: {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  count: number;
}) {
  const palette = {
    idle: { bg: "#edf2f7", fg: "#4a5568", text: "Waiting to fetch manifests." },
    loading: { bg: "#ebf8ff", fg: "#2b6cb0", text: "Fetching manifests from the backend…" },
    ready: {
      bg: "#f0fff4",
      fg: "#276749",
      text: `Loaded ${count} integration(s) from the backend.`,
    },
    error: { bg: "#fff5f5", fg: "#c53030", text: error ?? "Failed to fetch manifests." },
  }[status];
  return (
    <div
      data-testid="status-banner"
      data-status={status}
      style={{
        padding: "0.75rem 1rem",
        borderRadius: "0.375rem",
        backgroundColor: palette.bg,
        color: palette.fg,
        fontSize: "0.875rem",
      }}
    >
      {palette.text}
    </div>
  );
}

function TerminalPanel({
  integration,
  outcome,
  onDismiss,
}: {
  integration: IntegrationDefinition;
  outcome: TerminalOutcome;
  onDismiss: () => void;
}) {
  return (
    <section
      data-testid="result"
      data-status={outcome.status}
      style={{
        marginTop: "1.5rem",
        background: "white",
        padding: "1.25rem",
        border: "1px solid #e2e8f0",
        borderRadius: "0.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <h3 style={{ margin: 0 }}>
        {integration.name} {outcome.status === "completed" ? "configured" : "configuration aborted"}
      </h3>
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
          margin: 0,
        }}
      >
        {JSON.stringify(redactSecrets(outcome.payload), null, 2)}
      </pre>
      <div>
        <button type="button" data-testid="result-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}

/**
 * The capability-gated shared tile. One React component renders every
 * integration in the catalog — it never has hard-coded knowledge of
 * "Salesforce" or "HubSpot". Auth badge, filter chips, and per-capability
 * affordances all come from the typed `IntegrationDefinition`.
 *
 * The "Configure" button is what hands control off to the journey. The
 * tile doesn't know whether a given integration earns a dedicated
 * configure module — that's the journey's call, made via
 * `selectModuleOrDefault` against the same `id` we pass in.
 */
function IntegrationCard({
  integration,
  isConnected,
  onConfigure,
}: {
  integration: IntegrationDefinition;
  isConnected: boolean;
  onConfigure: () => void;
}) {
  const { authentication, filters, capabilities } = integration;

  return (
    <article
      data-testid={`integration-card-${integration.id}`}
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "0.5rem",
        padding: "1rem",
        backgroundColor: "white",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.5rem" }}>{renderIcon(integration.icon)}</span>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#2d3748" }}>
            {integration.name}
          </h3>
          <Badge tone="neutral">{integration.category.toUpperCase()}</Badge>
          <Badge tone="info">{AUTH_LABEL[authentication.type]}</Badge>
          {isConnected && (
            <Badge tone="success" testId={`connected-${integration.id}`}>
              Connected
            </Badge>
          )}
        </div>
        <p style={{ fontSize: "0.875rem", color: "#4a5568", marginTop: "0.5rem" }}>
          {integration.description}
        </p>
      </header>

      {filters.length > 0 && (
        <section>
          <Label>Supported filters</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
            {filters.map((filter) => (
              <Badge key={filter.id} tone="subtle">
                {FILTER_LABEL[filter.type]}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {capabilities.importTracking && (
          <CapabilityChip>
            Import (poll {capabilities.importTracking.data.pollingIntervalMs}ms)
          </CapabilityChip>
        )}
        {capabilities.contactSync && (
          <CapabilityChip>Sync ({capabilities.contactSync.data.direction})</CapabilityChip>
        )}
        {!capabilities.importTracking && !capabilities.contactSync && (
          <span style={{ fontSize: "0.75rem", color: "#a0aec0" }}>
            No write capabilities — read-only integration.
          </span>
        )}
      </section>

      <footer>
        <button
          type="button"
          data-testid={`configure-${integration.id}`}
          onClick={onConfigure}
          style={{
            border: "1px solid #2b6cb0",
            background: "#2b6cb0",
            color: "white",
            borderRadius: "0.375rem",
            padding: "0.4rem 0.75rem",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          {isConnected ? "Reconfigure" : "Configure"}
        </button>
      </footer>
    </article>
  );
}

function Badge({
  children,
  tone,
  testId,
}: {
  children: React.ReactNode;
  tone: "neutral" | "info" | "subtle" | "success";
  testId?: string;
}) {
  const palette = {
    neutral: { bg: "#edf2f7", fg: "#4a5568" },
    info: { bg: "#ebf8ff", fg: "#2b6cb0" },
    subtle: { bg: "#f7fafc", fg: "#718096" },
    success: { bg: "#c6f6d5", fg: "#276749" },
  }[tone];
  return (
    <span
      data-testid={testId}
      style={{
        display: "inline-block",
        padding: "0.125rem 0.5rem",
        borderRadius: "9999px",
        backgroundColor: palette.bg,
        color: palette.fg,
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.03em",
      }}
    >
      {children}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.6875rem",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "#a0aec0",
        marginBottom: "0.25rem",
      }}
    >
      {children}
    </div>
  );
}

function CapabilityChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        border: "1px solid #cbd5e0",
        borderRadius: "0.375rem",
        padding: "0.2rem 0.5rem",
        backgroundColor: "white",
        color: "#2d3748",
        fontSize: "0.75rem",
      }}
    >
      {children}
    </span>
  );
}

// Re-export so tests can import IntegrationKind from this file via the
// barrel without breaking the page component's default export.
export type { IntegrationKind };
