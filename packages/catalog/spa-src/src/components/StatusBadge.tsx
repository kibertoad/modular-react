import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<string, string> = {
  stable: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  experimental: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  deprecated: "bg-red-100 text-red-700 hover:bg-red-100",
};

export function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  return (
    <Badge className={cn("border-0", STATUS_CLASS[status] ?? "bg-muted text-foreground")}>
      {status}
    </Badge>
  );
}
