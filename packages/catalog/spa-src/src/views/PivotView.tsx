import { Link } from "@tanstack/react-router";
import { useCatalog } from "../catalog-context";
import { JourneyEntryCard, ModuleEntryCard } from "../components/EntryCard";
import { domainPivotRoute, tagPivotRoute, teamPivotRoute } from "../router";
import type { JourneyEntry, ModuleEntry } from "../types";

type PivotKind = "team" | "domain" | "tag";

const LABELS: Record<PivotKind, { singular: string; icon: string }> = {
  team: { singular: "team", icon: "👥" },
  domain: { singular: "domain", icon: "📂" },
  tag: { singular: "tag", icon: "🏷️" },
};

export function TeamPivotView() {
  const { team } = teamPivotRoute.useParams();
  return <PivotShell kind="team" value={team} />;
}

export function DomainPivotView() {
  const { domain } = domainPivotRoute.useParams();
  return <PivotShell kind="domain" value={domain} />;
}

export function TagPivotView() {
  const { tag } = tagPivotRoute.useParams();
  return <PivotShell kind="tag" value={tag} />;
}

function PivotShell({ kind, value }: { kind: PivotKind; value: string }) {
  const { model } = useCatalog();
  const matchedModules = model.modules.filter((m) => matches(m, kind, value));
  const matchedJourneys = model.journeys.filter((j) => matches(j, kind, value));
  const label = LABELS[kind];

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label.singular}</p>
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <span aria-hidden>{label.icon}</span>
          <span>{value}</span>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {matchedModules.length} module{matchedModules.length === 1 ? "" : "s"} ·{" "}
          {matchedJourneys.length} journey
          {matchedJourneys.length === 1 ? "" : "s"}
        </p>
      </div>

      {matchedModules.length === 0 && matchedJourneys.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm">
          Nothing here matches this {label.singular}.{" "}
          <Link to="/modules" className="underline">
            Back to modules
          </Link>
        </div>
      )}

      {matchedModules.length > 0 && (
        <section className="mb-8">
          <h3 className="mb-3 text-sm font-semibold">Modules</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {matchedModules.map((m) => (
              <ModuleEntryCard key={m.id} entry={m} />
            ))}
          </div>
        </section>
      )}

      {matchedJourneys.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">Journeys</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {matchedJourneys.map((j) => (
              <JourneyEntryCard key={j.id} entry={j} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function matches(entry: ModuleEntry | JourneyEntry, kind: PivotKind, value: string): boolean {
  if (kind === "team") return entry.meta.ownerTeam === value;
  if (kind === "domain") return entry.meta.domain === value;
  return (entry.meta.tags ?? []).includes(value);
}
