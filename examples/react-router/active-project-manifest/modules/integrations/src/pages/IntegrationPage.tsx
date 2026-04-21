import { useSlots } from "@react-router-modules/runtime";
import { useStore } from "@example-active/app-shared";
import type { AppSlots, IntegrationDefinition } from "@example-active/app-shared";

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

export default function IntegrationPage() {
  const { integration } = useSlots<AppSlots>();
  const status = useStore("integrations", (s) => s.status);
  const activeProjectId = useStore("integrations", (s) => s.activeProjectId);
  const error = useStore("integrations", (s) => s.error);

  const definition = integration[0];

  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem" }}>Active project integration</h2>
      <p style={{ color: "#718096", marginBottom: "1.5rem" }}>
        Pick a project in the sidebar. Its integration manifest is fetched on demand, written to the
        store, and rendered by <strong>the same shared component</strong> — auth, filters, and
        capability-gated actions all decided by the manifest. Switching projects discards the old
        manifest and swaps the whole surface.
      </p>

      <StatusBanner status={status} activeProjectId={activeProjectId} error={error} />

      {definition ? (
        <IntegrationCard integration={definition} />
      ) : (
        <EmptyState status={status} activeProjectId={activeProjectId} />
      )}
    </div>
  );
}

function StatusBanner({
  status,
  activeProjectId,
  error,
}: {
  status: "idle" | "loading" | "ready" | "error";
  activeProjectId: string | null;
  error: string | null;
}) {
  const palette = {
    idle: {
      bg: "#edf2f7",
      fg: "#4a5568",
      text: "No project selected — pick one in the sidebar to load its integration.",
    },
    loading: {
      bg: "#ebf8ff",
      fg: "#2b6cb0",
      text: `Loading integration for ${activeProjectId}…`,
    },
    ready: {
      bg: "#f0fff4",
      fg: "#276749",
      text: `Integration for ${activeProjectId} loaded.`,
    },
    error: {
      bg: "#fff5f5",
      fg: "#c53030",
      text: error ?? "Failed to fetch manifest.",
    },
  }[status];

  return (
    <div
      style={{
        padding: "0.75rem 1rem",
        borderRadius: "0.375rem",
        backgroundColor: palette.bg,
        color: palette.fg,
        fontSize: "0.875rem",
        marginBottom: "1rem",
      }}
    >
      {palette.text}
    </div>
  );
}

function EmptyState({
  status,
  activeProjectId,
}: {
  status: "idle" | "loading" | "ready" | "error";
  activeProjectId: string | null;
}) {
  if (status === "ready" && activeProjectId != null) {
    return (
      <div style={{ color: "#a0aec0", fontStyle: "italic" }}>
        This project has no integration configured on the backend.
      </div>
    );
  }
  return null;
}

/**
 * The capability-gated shared component. Identical in spirit to the one in
 * the `remote-capabilities` example — it has no idea whether its input came
 * from a merged catalog or a per-project swap, because the library's types
 * don't care and the component doesn't either.
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
        maxWidth: "480px",
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
