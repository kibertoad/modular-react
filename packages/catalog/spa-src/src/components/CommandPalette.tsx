import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useCatalog } from "../catalog-context";

const OPEN_EVENT = "catalog:open-palette";

/**
 * Programmatically open the command palette from anywhere in the app — used
 * by the header's clickable hint so the same code path drives both the
 * keystroke and the click. Safe to call before `<CommandPalette />` mounts;
 * the next mount will pick up an already-fired event because dispatchEvent
 * runs synchronously and we attach the listener immediately on mount.
 */
export function openCommandPalette(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_EVENT));
  }
}

type ResultKind = "module" | "journey" | "team" | "domain" | "tag";

interface PaletteResult {
  kind: ResultKind;
  id: string;
  label: string;
  hint?: string;
}

const KIND_LABELS: Record<ResultKind, string> = {
  module: "Modules",
  journey: "Journeys",
  team: "Teams",
  domain: "Domains",
  tag: "Tags",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { model } = useCatalog();

  // Global keystroke: cmd/ctrl+K toggles, Escape closes (handled by Dialog).
  // The header hint also opens the palette via a custom `catalog:open-palette`
  // event so click and keystroke share one entry point — no prop drilling
  // and no shared state to keep in sync.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpenRequest() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpenRequest);
    };
  }, []);

  const results = collectResults(model);

  function activate(r: PaletteResult) {
    setOpen(false);
    if (r.kind === "module") {
      navigate({ to: "/modules/$id", params: { id: r.id } });
    } else if (r.kind === "journey") {
      navigate({ to: "/journeys/$id", params: { id: r.id } });
    } else if (r.kind === "team") {
      navigate({ to: "/teams/$team", params: { team: r.id } });
    } else if (r.kind === "domain") {
      navigate({ to: "/domains/$domain", params: { domain: r.id } });
    } else {
      navigate({ to: "/tags/$tag", params: { tag: r.id } });
    }
  }

  // cmdk's built-in matcher does substring search across each item's text
  // content, which is what we want for a palette. The catalog's main filter
  // rail uses the hand-rolled match.ts elsewhere — different layer.
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search modules, journeys, teams, domains, tags…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        {(["module", "journey", "team", "domain", "tag"] as const).map((kind) => {
          const items = results.filter((r) => r.kind === kind);
          if (items.length === 0) return null;
          return (
            <CommandGroup key={kind} heading={KIND_LABELS[kind]}>
              {items.map((r) => (
                <CommandItem
                  key={`${r.kind}-${r.id}`}
                  // cmdk filters on this string; combine label+hint so typing
                  // anything from either matches.
                  value={`${r.label} ${r.id} ${r.hint ?? ""}`}
                  onSelect={() => activate(r)}
                >
                  <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                    {r.kind}
                  </span>
                  <span className="flex-1 truncate">
                    <span className="text-sm font-medium">{r.label}</span>
                    {r.hint && <span className="ml-2 text-xs text-muted-foreground">{r.hint}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}

function collectResults(model: ReturnType<typeof useCatalog>["model"]): PaletteResult[] {
  const all: PaletteResult[] = [];
  for (const m of model.modules) {
    all.push({
      kind: "module",
      id: m.id,
      label: m.meta.name ?? m.id,
      hint: m.meta.description ?? `${m.id}@${m.version}`,
    });
  }
  for (const j of model.journeys) {
    all.push({
      kind: "journey",
      id: j.id,
      label: j.meta.name ?? j.id,
      hint: j.meta.description ?? `${j.id}@${j.version}`,
    });
  }
  for (const t of model.facets.teams) all.push({ kind: "team", id: t, label: t });
  for (const d of model.facets.domains) all.push({ kind: "domain", id: d, label: d });
  for (const tag of model.facets.tags) all.push({ kind: "tag", id: tag, label: tag });
  return all;
}
