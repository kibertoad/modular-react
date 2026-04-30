import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TeamChip, DomainChip, TagChip } from "./ChipLinks";
import { KindBadge } from "./KindBadge";
import { StatusBadge } from "./StatusBadge";
import type { ListSearch } from "../router";
import type { JourneyEntry, ModuleEntry } from "../types";

export function ModuleEntryCard({ entry, search }: { entry: ModuleEntry; search?: ListSearch }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <Link
        to="/modules/$id"
        params={{ id: entry.id }}
        search={search ?? {}}
        className="block focus:outline-none"
      >
        <CardHeader className="gap-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{entry.meta.name ?? entry.id}</CardTitle>
              <KindBadge kind="module" />
            </div>
            <StatusBadge status={entry.meta.status} />
          </div>
          <CardDescription className="font-mono text-xs">
            {entry.id}@{entry.version}
          </CardDescription>
        </CardHeader>
        {entry.meta.description && (
          <CardContent>
            <p className="line-clamp-3 text-sm text-muted-foreground">{entry.meta.description}</p>
          </CardContent>
        )}
      </Link>
      {hasChips(entry) && (
        <CardContent className="flex flex-wrap gap-1.5">
          {entry.meta.ownerTeam && <TeamChip team={entry.meta.ownerTeam} />}
          {entry.meta.domain && <DomainChip domain={entry.meta.domain} />}
          {entry.meta.tags?.map((t) => (
            <TagChip key={t} tag={t} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export function JourneyEntryCard({ entry, search }: { entry: JourneyEntry; search?: ListSearch }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <Link
        to="/journeys/$id"
        params={{ id: entry.id }}
        search={search ?? {}}
        className="block focus:outline-none"
      >
        <CardHeader className="gap-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{entry.meta.name ?? entry.id}</CardTitle>
              <KindBadge kind="journey" />
            </div>
            <StatusBadge status={entry.meta.status} />
          </div>
          <CardDescription className="font-mono text-xs">
            {entry.id}@{entry.version}
          </CardDescription>
        </CardHeader>
        {entry.meta.description && (
          <CardContent>
            <p className="line-clamp-3 text-sm text-muted-foreground">{entry.meta.description}</p>
          </CardContent>
        )}
      </Link>
      <CardContent className="flex flex-wrap gap-1.5">
        {entry.meta.ownerTeam && <TeamChip team={entry.meta.ownerTeam} />}
        {entry.meta.domain && <DomainChip domain={entry.meta.domain} />}
        {entry.modulesUsed.length > 0 && (
          <Badge variant="ghost">
            🧩 {entry.modulesUsed.length} module
            {entry.modulesUsed.length === 1 ? "" : "s"}
          </Badge>
        )}
        {entry.meta.tags?.map((t) => (
          <TagChip key={t} tag={t} />
        ))}
      </CardContent>
    </Card>
  );
}

function hasChips(entry: ModuleEntry): boolean {
  return Boolean(
    entry.meta.ownerTeam || entry.meta.domain || (entry.meta.tags && entry.meta.tags.length > 0),
  );
}
