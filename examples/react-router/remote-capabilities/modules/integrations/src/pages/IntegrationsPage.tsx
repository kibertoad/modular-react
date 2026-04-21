import { useSlots } from "@react-router-modules/runtime";
import { useStore } from "@example/app-shared";
import type { AppSlots, IntegrationDefinition } from "@example/app-shared";

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

export default function IntegrationsPage() {
  const { integrations } = useSlots<AppSlots>();
  const status = useStore("integrations", (s) => s.status);
  const error = useStore("integrations", (s) => s.error);

  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem" }}>Integrations</h2>
      <p style={{ color: "#718096", marginBottom: "1.5rem" }}>
        Every card below is rendered by the <strong>same shared component</strong>, fed by a
        backend-delivered manifest. Auth type, supported filters, and capability-gated action
        buttons all come from the JSON — unsupported controls are simply not rendered. Edit{" "}
        <code>shell/public/integrations.json</code> and reload to see the UI morph.
      </p>

      <StatusBanner status={status} error={error} count={integrations.length} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "1rem",
          marginTop: "1.5rem",
        }}
      >
        {integrations.map((integration) => (
          <IntegrationCard key={integration.id} integration={integration} />
        ))}
      </div>
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

/**
 * The capability-gated shared component.
 *
 * This one React component renders every integration in the catalog. It never
 * has hard-coded knowledge of "Salesforce" or "HubSpot" — it only reads the
 * typed `IntegrationDefinition` and decides what UI to show.
 *
 * Adding a new integration on the backend lights up a new card here with the
 * right controls, zero FE changes. Adding a *new capability* (e.g. "webhooks")
 * is a code change: extend `IntegrationCapabilities` + render it below.
 */
function IntegrationCard({ integration }: { integration: IntegrationDefinition }) {
  const { authentication, filters, capabilities } = integration;

  return (
    <article
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
        </div>
        <p style={{ fontSize: "0.875rem", color: "#4a5568", marginTop: "0.5rem" }}>
          {integration.description}
        </p>
      </header>

      {/* Filter chips — only supported filters render. */}
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

      {/* Action row — each button is gated by a capability. Unsupported buttons
          are not rendered at all, so an integration without importTracking
          literally cannot show an "Import" affordance. */}
      <section style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {capabilities.importTracking && (
          <ActionButton>
            Start import
            <small style={{ opacity: 0.7, marginLeft: "0.25rem" }}>
              (poll {capabilities.importTracking.data.pollingIntervalMs}ms)
            </small>
          </ActionButton>
        )}
        {capabilities.contactSync && (
          <ActionButton>Sync contacts ({capabilities.contactSync.data.direction})</ActionButton>
        )}
        {!capabilities.importTracking && !capabilities.contactSync && (
          <span style={{ fontSize: "0.75rem", color: "#a0aec0" }}>
            No write capabilities — read-only integration.
          </span>
        )}
      </section>
    </article>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "neutral" | "info" | "subtle";
}) {
  const palette = {
    neutral: { bg: "#edf2f7", fg: "#4a5568" },
    info: { bg: "#ebf8ff", fg: "#2b6cb0" },
    subtle: { bg: "#f7fafc", fg: "#718096" },
  }[tone];
  return (
    <span
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

function ActionButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      style={{
        border: "1px solid #cbd5e0",
        borderRadius: "0.375rem",
        padding: "0.375rem 0.75rem",
        backgroundColor: "white",
        color: "#2d3748",
        fontSize: "0.8125rem",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
