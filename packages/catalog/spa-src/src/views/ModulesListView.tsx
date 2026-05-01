import { useMemo } from "react";
import { useCatalog } from "../catalog-context";
import { matchEntry } from "../match";
import { ModuleEntryCard } from "../components/EntryCard";
import {
  FilterBar,
  filterStateFromSearch,
  filterStateToSearch,
  type FilterState,
} from "../components/FilterBar";
import { modulesIndexRoute } from "../router";
import type { ModuleEntry } from "../types";

export function ModulesListView() {
  const { model } = useCatalog();
  const search = modulesIndexRoute.useSearch();
  const navigate = modulesIndexRoute.useNavigate();
  const filter = useMemo(() => filterStateFromSearch(search), [search]);

  const filtered = useMemo(
    () => model.modules.filter((m) => matchModule(m, filter)),
    [model.modules, filter],
  );

  const setFilter = (next: FilterState) => {
    navigate({
      search: filterStateToSearch(next),
      replace: true,
    });
  };

  return (
    <div>
      <FilterBar facets={model.facets} value={filter} onChange={setFilter} />
      <p className="mb-3 text-sm text-muted-foreground">
        Showing {filtered.length} of {model.modules.length} module
        {model.modules.length === 1 ? "" : "s"}.
      </p>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((m) => (
          <ModuleEntryCard key={m.id} entry={m} search={search} />
        ))}
      </div>
    </div>
  );
}

function matchModule(m: ModuleEntry, f: FilterState): boolean {
  if (f.team && m.meta.ownerTeam !== f.team) return false;
  if (f.domain && m.meta.domain !== f.domain) return false;
  if (f.status && m.meta.status !== f.status) return false;
  if (f.tag && !(m.meta.tags ?? []).includes(f.tag)) return false;
  for (const [key, selected] of Object.entries(f.custom)) {
    if (!selected) continue;
    const values = m.customFacets?.[key] ?? [];
    if (!values.includes(selected)) return false;
  }
  return matchEntry(f.query, [
    m.id,
    m.meta.name,
    m.meta.description,
    m.meta.ownerTeam,
    m.meta.domain,
    ...(m.meta.tags ?? []),
    ...m.slotKeys,
    ...m.navigationLabels,
  ]);
}
