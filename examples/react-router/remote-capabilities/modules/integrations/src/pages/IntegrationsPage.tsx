import { useSlots } from "@react-router-modules/runtime";
import { useStore } from "@example/app-shared";
import type { AppSlots, IntegrationTile } from "@example/app-shared";

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

export default function IntegrationsPage() {
  const { integrations } = useSlots<AppSlots>();
  const status = useStore("integrations", (s) => s.status);
  const error = useStore("integrations", (s) => s.error);

  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem" }}>Integrations</h2>
      <p style={{ color: "#718096", marginBottom: "1.5rem" }}>
        Every tile below was delivered by the backend via a capability manifest. Edit{" "}
        <code>shell/public/integrations.json</code> and reload to see a new tile appear — no
        frontend code change, no rebuild.
      </p>

      <StatusBanner status={status} error={error} count={integrations.length} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "1rem",
          marginTop: "1.5rem",
        }}
      >
        {integrations.map((tile) => (
          <IntegrationCard key={tile.id} tile={tile} />
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

function IntegrationCard({ tile }: { tile: IntegrationTile }) {
  return (
    <article
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "0.5rem",
        padding: "1rem",
        backgroundColor: "white",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "1.5rem" }}>{renderIcon(tile.icon)}</span>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#2d3748" }}>{tile.name}</h3>
      </div>
      <p style={{ fontSize: "0.75rem", color: "#a0aec0", marginBottom: "0.5rem" }}>
        {tile.category.toUpperCase()}
      </p>
      <p style={{ fontSize: "0.875rem", color: "#4a5568" }}>{tile.description}</p>
    </article>
  );
}
