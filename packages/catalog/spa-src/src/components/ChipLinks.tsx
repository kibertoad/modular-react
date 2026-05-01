import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";

export function TeamChip({ team }: { team: string }) {
  return (
    <Badge variant="secondary" render={<Link to="/teams/$team" params={{ team }} />}>
      <span aria-hidden>👥</span> {team}
    </Badge>
  );
}

export function DomainChip({ domain }: { domain: string }) {
  return (
    <Badge variant="secondary" render={<Link to="/domains/$domain" params={{ domain }} />}>
      <span aria-hidden>📂</span> {domain}
    </Badge>
  );
}

export function TagChip({ tag }: { tag: string }) {
  return (
    <Badge variant="outline" render={<Link to="/tags/$tag" params={{ tag }} />}>
      {tag}
    </Badge>
  );
}
