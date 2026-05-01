import { Link } from "@tanstack/react-router";
import { useCatalog } from "../catalog-context";
import { StatusBadge } from "../components/StatusBadge";
import { TagChip } from "../components/ChipLinks";
import { DetailTabs } from "../components/DetailTabs";
import { KindBadge } from "../components/KindBadge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { moduleDetailRoute } from "../router";
import type {
  ModuleEntry,
  ModuleEntryUsage,
  ModuleExitUsage,
  TransitionDestination,
} from "../types";

export function ModuleDetailView() {
  const { model } = useCatalog();
  const { id } = moduleDetailRoute.useParams();
  const entry = model.modules.find((m) => m.id === id);

  if (!entry) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm">
            No module with id <code className="font-mono">{id}</code>.
          </p>
          <Link to="/modules" className="mt-3 inline-block text-sm underline">
            ← Back to modules
          </Link>
        </CardContent>
      </Card>
    );
  }

  const usedBy = model.journeysByModule[entry.id] ?? [];
  const entryUsage = model.moduleEntryUsage[entry.id] ?? {};
  const exitUsage = model.moduleExitUsage[entry.id] ?? {};

  return (
    <Card>
      <CardHeader>
        <Link to="/modules" className="text-sm underline">
          ← Back to modules
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{entry.meta.name ?? entry.id}</h2>
              <KindBadge kind="module" />
            </div>
            <p className="font-mono text-sm text-muted-foreground">
              {entry.id}@{entry.version}
            </p>
          </div>
          <StatusBadge status={entry.meta.status} />
        </div>
        {entry.meta.description && (
          <p className="mt-3 text-muted-foreground">{entry.meta.description}</p>
        )}
      </CardHeader>
      <CardContent>
        <DetailTabs
          tabs={entry.extensionTabs ?? []}
          overview={
            <>
              <DetailGrid
                entry={entry}
                usedBy={usedBy}
                entryUsage={entryUsage}
                exitUsage={exitUsage}
              />
              {Object.keys(entry.extraMeta).length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    Other metadata ({Object.keys(entry.extraMeta).length})
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">
                    {JSON.stringify(entry.extraMeta, null, 2)}
                  </pre>
                </details>
              )}
              <p className="mt-4 break-all font-mono text-xs text-muted-foreground">
                Source: {entry.sourcePath}
              </p>
            </>
          }
        />
      </CardContent>
    </Card>
  );
}

function DetailGrid({
  entry,
  usedBy,
  entryUsage,
  exitUsage,
}: {
  entry: ModuleEntry;
  usedBy: readonly string[];
  entryUsage: Readonly<Record<string, readonly ModuleEntryUsage[]>>;
  exitUsage: Readonly<Record<string, readonly ModuleExitUsage[]>>;
}) {
  const rows: { label: string; value: React.ReactNode }[] = [];

  if (entry.meta.ownerTeam) {
    rows.push({
      label: "Owner team",
      value: (
        <Link to="/teams/$team" params={{ team: entry.meta.ownerTeam }} className="underline">
          {entry.meta.ownerTeam}
        </Link>
      ),
    });
  }
  if (entry.meta.domain) {
    rows.push({
      label: "Domain",
      value: (
        <Link to="/domains/$domain" params={{ domain: entry.meta.domain }} className="underline">
          {entry.meta.domain}
        </Link>
      ),
    });
  }
  if (entry.meta.tags?.length) {
    rows.push({
      label: "Tags",
      value: (
        <div className="flex flex-wrap gap-1.5">
          {entry.meta.tags.map((t) => (
            <TagChip key={t} tag={t} />
          ))}
        </div>
      ),
    });
  }
  if (entry.meta.status)
    rows.push({ label: "Status", value: <StatusBadge status={entry.meta.status} /> });
  if (entry.meta.since) rows.push({ label: "Since", value: entry.meta.since });

  rows.push({ label: "Has routes", value: entry.hasRoutes ? "yes" : "no" });
  rows.push({ label: "Has component", value: entry.hasComponent ? "yes" : "no" });
  if (entry.slotKeys.length)
    rows.push({ label: "Contributes slots", value: entry.slotKeys.join(", ") });
  if (entry.navigationLabels.length)
    rows.push({ label: "Navigation", value: entry.navigationLabels.join(", ") });
  if (entry.requires.length) rows.push({ label: "Requires", value: entry.requires.join(", ") });
  if (entry.optionalRequires.length)
    rows.push({ label: "Optional requires", value: entry.optionalRequires.join(", ") });
  if (entry.entryPointNames.length)
    rows.push({
      label: "Entry points",
      value: <EntryPointsList names={entry.entryPointNames} usage={entryUsage} />,
    });
  if (entry.exitPointNames.length)
    rows.push({
      label: "Exit points",
      value: <ExitPointsList names={entry.exitPointNames} usage={exitUsage} />,
    });
  if (usedBy.length) {
    rows.push({
      label: "Used by journeys",
      value: (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {usedBy.map((jid) => (
            <Link
              key={jid}
              to="/journeys/$id"
              params={{ id: jid }}
              className="font-mono text-xs underline"
            >
              {jid}
            </Link>
          ))}
        </div>
      ),
    });
  }

  if (entry.meta.links) {
    const links = entry.meta.links;
    const linkEls: React.ReactNode[] = [];
    if (links.docs)
      linkEls.push(
        <a
          key="d"
          className="underline"
          href={links.docs}
          target="_blank"
          rel="noopener noreferrer"
        >
          docs
        </a>,
      );
    if (links.source)
      linkEls.push(
        <a
          key="s"
          className="underline"
          href={links.source}
          target="_blank"
          rel="noopener noreferrer"
        >
          source
        </a>,
      );
    if (links.runbook)
      linkEls.push(
        <a
          key="r"
          className="underline"
          href={links.runbook}
          target="_blank"
          rel="noopener noreferrer"
        >
          runbook
        </a>,
      );
    if (links.slack)
      linkEls.push(
        <a
          key="sl"
          className="underline"
          href={links.slack}
          target="_blank"
          rel="noopener noreferrer"
        >
          slack
        </a>,
      );
    if (linkEls.length) {
      rows.push({
        label: "Links",
        value: <div className="flex gap-3">{linkEls}</div>,
      });
    }
  }

  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EntryPointsList({
  names,
  usage,
}: {
  names: readonly string[];
  usage: Readonly<Record<string, readonly ModuleEntryUsage[]>>;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {names.map((name) => {
        const refs = usage[name] ?? [];
        return (
          <li key={name}>
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-2 list-none">
                <span className="font-mono text-xs">{name}</span>
                <span className="text-xs text-muted-foreground">
                  {refs.length === 0
                    ? "no journeys"
                    : `${refs.length} journey${refs.length === 1 ? "" : "s"}`}
                </span>
                <span className="text-xs text-muted-foreground transition-transform group-open:rotate-90">
                  ▸
                </span>
              </summary>
              {refs.length > 0 && (
                <ul className="mt-1.5 ml-3 space-y-1 border-l border-border pl-3">
                  {refs.map((ref) => (
                    <li key={ref.journeyId} className="text-xs">
                      <Link
                        to="/journeys/$id"
                        params={{ id: ref.journeyId }}
                        className="font-mono underline"
                      >
                        {ref.journeyId}
                      </Link>
                      {ref.handledExits.length > 0 && (
                        <span className="ml-2 text-muted-foreground">
                          handles: {ref.handledExits.join(", ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function ExitPointsList({
  names,
  usage,
}: {
  names: readonly string[];
  usage: Readonly<Record<string, readonly ModuleExitUsage[]>>;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {names.map((name) => {
        const refs = usage[name] ?? [];
        return (
          <li key={name}>
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-2 list-none">
                <span className="font-mono text-xs">{name}</span>
                <span className="text-xs text-muted-foreground">
                  {refs.length === 0
                    ? "no journeys"
                    : `${refs.length} handler${refs.length === 1 ? "" : "s"}`}
                </span>
                <span className="text-xs text-muted-foreground transition-transform group-open:rotate-90">
                  ▸
                </span>
              </summary>
              {refs.length > 0 && (
                <ul className="mt-1.5 ml-3 space-y-1 border-l border-border pl-3">
                  {refs.map((ref, i) => (
                    <li key={`${ref.journeyId}-${ref.fromEntry}-${i}`} className="text-xs">
                      <Link
                        to="/journeys/$id"
                        params={{ id: ref.journeyId }}
                        className="font-mono underline"
                      >
                        {ref.journeyId}
                      </Link>
                      <span className="ml-2 text-muted-foreground">
                        from <span className="font-mono">{ref.fromEntry}</span>
                      </span>
                      <ExitOutcomes usage={ref} />
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function ExitOutcomes({ usage }: { usage: ModuleExitUsage }) {
  const dests = usage.destinations ?? [];
  const tags: React.ReactNode[] = [];
  for (const d of dests) tags.push(<DestinationChip key={`d-${tags.length}`} dest={d} />);
  if (usage.aborts) tags.push(<OutcomeChip key={`a-${tags.length}`} kind="abort" />);
  if (usage.completes) tags.push(<OutcomeChip key={`c-${tags.length}`} kind="complete" />);
  if (tags.length === 0) return null;
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
      <span className="text-muted-foreground">→</span>
      {tags}
    </span>
  );
}

function DestinationChip({ dest }: { dest: TransitionDestination }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem]">
      <Link to="/modules/$id" params={{ id: dest.module }} className="underline">
        {dest.module}
      </Link>
      {dest.entry !== undefined && (
        <>
          <span className="text-muted-foreground">.</span>
          <span>{dest.entry}</span>
        </>
      )}
    </span>
  );
}

function OutcomeChip({ kind }: { kind: "abort" | "complete" }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[0.7rem] ${
        kind === "abort"
          ? "bg-destructive/10 text-destructive"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      }`}
    >
      {kind}
    </span>
  );
}
