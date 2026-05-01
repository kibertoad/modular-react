import { Badge } from "@/components/ui/badge";

const KIND_STYLE: Record<"module" | "journey", { label: string; className: string }> = {
  module: {
    label: "module",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  journey: {
    label: "journey",
    className: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
};

export function KindBadge({ kind }: { kind: "module" | "journey" }) {
  const style = KIND_STYLE[kind];
  return (
    <Badge variant="ghost" className={style.className}>
      {style.label}
    </Badge>
  );
}
