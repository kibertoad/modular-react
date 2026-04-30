import { Link } from "@tanstack/react-router";
import { useCatalog } from "../catalog-context";
import { StatusBadge } from "../components/StatusBadge";
import { TagChip } from "../components/ChipLinks";
import { DetailTabs } from "../components/DetailTabs";
import { KindBadge } from "../components/KindBadge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { journeyDetailRoute } from "../router";
import type { JourneyEntry } from "../types";

export function JourneyDetailView() {
  const { model } = useCatalog();
  const { id } = journeyDetailRoute.useParams();
  const entry = model.journeys.find((j) => j.id === id);

  if (!entry) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm">
            No journey with id <code className="font-mono">{id}</code>.
          </p>
          <Link to="/journeys" className="mt-3 inline-block text-sm underline">
            ← Back to journeys
          </Link>
        </CardContent>
      </Card>
    );
  }

  const invokedBy = model.journeysByInvokedJourney[entry.id] ?? [];
  const startedBy = model.modulesByStartedJourney[entry.id] ?? [];

  return (
    <Card>
      <CardHeader>
        <Link to="/journeys" className="text-sm underline">
          ← Back to journeys
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{entry.meta.name ?? entry.id}</h2>
              <KindBadge kind="journey" />
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
          overview={<Overview entry={entry} invokedBy={invokedBy} startedBy={startedBy} />}
        />
      </CardContent>
    </Card>
  );
}

function Overview({
  entry,
  invokedBy,
  startedBy,
}: {
  entry: JourneyEntry;
  invokedBy: readonly string[];
  startedBy: readonly string[];
}) {
  return (
    <>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        {entry.meta.ownerTeam && (
          <Row
            label="Owner team"
            value={
              <Link to="/teams/$team" params={{ team: entry.meta.ownerTeam }} className="underline">
                {entry.meta.ownerTeam}
              </Link>
            }
          />
        )}
        {entry.meta.domain && (
          <Row
            label="Domain"
            value={
              <Link
                to="/domains/$domain"
                params={{ domain: entry.meta.domain }}
                className="underline"
              >
                {entry.meta.domain}
              </Link>
            }
          />
        )}
        {entry.meta.tags?.length ? (
          <Row
            label="Tags"
            value={
              <div className="flex flex-wrap gap-1.5">
                {entry.meta.tags.map((t) => (
                  <TagChip key={t} tag={t} />
                ))}
              </div>
            }
          />
        ) : null}
        <Row
          label="Modules used"
          value={
            entry.modulesUsed.length === 0 ? (
              "—"
            ) : (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {entry.modulesUsed.map((mid) => (
                  <Link
                    key={mid}
                    to="/modules/$id"
                    params={{ id: mid }}
                    className="font-mono text-xs underline"
                  >
                    {mid}
                  </Link>
                ))}
              </div>
            )
          }
        />
        {entry.invokesJourneyIds.length > 0 && (
          <Row
            label="Invokes journeys"
            value={
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {entry.invokesJourneyIds.map((jid) => (
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
            }
          />
        )}
        {invokedBy.length > 0 && (
          <Row
            label="Invoked by journeys"
            value={
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {invokedBy.map((jid) => (
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
            }
          />
        )}
        {startedBy.length > 0 && (
          <Row
            label="Started by modules"
            value={
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {startedBy.map((mid) => (
                  <Link
                    key={mid}
                    to="/modules/$id"
                    params={{ id: mid }}
                    className="font-mono text-xs underline"
                  >
                    {mid}
                  </Link>
                ))}
              </div>
            }
          />
        )}
        {Object.keys(entry.moduleCompat).length > 0 && (
          <Row
            label="Module compat"
            value={
              <ul className="space-y-0.5 font-mono text-xs">
                {Object.entries(entry.moduleCompat).map(([id, range]) => (
                  <li key={id}>
                    {id} <span className="text-muted-foreground">{range}</span>
                  </li>
                ))}
              </ul>
            }
          />
        )}
      </dl>

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
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
