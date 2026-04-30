import { useMemo } from "react";
import { useCatalog } from "../catalog-context";
import { matchEntry } from "../match";
import { JourneyEntryCard } from "../components/EntryCard";
import {
  FilterBar,
  filterStateFromSearch,
  filterStateToSearch,
  type FilterState,
} from "../components/FilterBar";
import { journeysIndexRoute } from "../router";
import type { JourneyEntry } from "../types";

export function JourneysListView() {
  const { model } = useCatalog();
  const search = journeysIndexRoute.useSearch();
  const navigate = journeysIndexRoute.useNavigate();
  const filter = useMemo(() => filterStateFromSearch(search), [search]);

  const filtered = useMemo(
    () => model.journeys.filter((j) => matchJourney(j, filter)),
    [model.journeys, filter],
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
        Showing {filtered.length} of {model.journeys.length} journey
        {model.journeys.length === 1 ? "" : "s"}.
      </p>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((j) => (
          <JourneyEntryCard key={j.id} entry={j} search={search} />
        ))}
      </div>
    </div>
  );
}

function matchJourney(j: JourneyEntry, f: FilterState): boolean {
  if (f.team && j.meta.ownerTeam !== f.team) return false;
  if (f.domain && j.meta.domain !== f.domain) return false;
  if (f.status && j.meta.status !== f.status) return false;
  if (f.tag && !(j.meta.tags ?? []).includes(f.tag)) return false;
  for (const [key, selected] of Object.entries(f.custom)) {
    if (!selected) continue;
    const values = j.customFacets?.[key] ?? [];
    if (!values.includes(selected)) return false;
  }
  return matchEntry(f.query, [
    j.id,
    j.meta.name,
    j.meta.description,
    j.meta.ownerTeam,
    j.meta.domain,
    ...(j.meta.tags ?? []),
    ...j.modulesUsed,
  ]);
}
