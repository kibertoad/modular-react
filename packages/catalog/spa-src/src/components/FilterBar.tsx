import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CatalogFacets, CustomFacet } from "../types";

const ALL_SENTINEL = "__all__";

export interface FilterState {
  query: string;
  team: string;
  domain: string;
  tag: string;
  status: string;
  /** Custom facet selections, keyed by facet key (no `c.` prefix). */
  custom: Record<string, string>;
}

export const EMPTY_FILTER: FilterState = {
  query: "",
  team: "",
  domain: "",
  tag: "",
  status: "",
  custom: {},
};

const CUSTOM_FACET_PREFIX = "c.";

/**
 * Convert a route's search-params object into a {@link FilterState}. Custom
 * facet selections live under `c.<key>` in the URL and are unpacked into
 * `custom`.
 */
export function filterStateFromSearch(search: Record<string, string | undefined>): FilterState {
  const custom: Record<string, string> = {};
  for (const [k, v] of Object.entries(search)) {
    if (k.startsWith(CUSTOM_FACET_PREFIX) && typeof v === "string" && v.length > 0) {
      custom[k.slice(CUSTOM_FACET_PREFIX.length)] = v;
    }
  }
  return {
    query: search.query ?? "",
    team: search.team ?? "",
    domain: search.domain ?? "",
    status: search.status ?? "",
    tag: search.tag ?? "",
    custom,
  };
}

/** Inverse of {@link filterStateFromSearch}. */
export function filterStateToSearch(f: FilterState): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {
    query: f.query || undefined,
    team: f.team || undefined,
    domain: f.domain || undefined,
    status: f.status || undefined,
    tag: f.tag || undefined,
  };
  for (const [k, v] of Object.entries(f.custom)) {
    if (v) out[`${CUSTOM_FACET_PREFIX}${k}`] = v;
  }
  return out;
}

export function isFilterActive(value: FilterState): boolean {
  return Boolean(
    value.query ||
    value.team ||
    value.domain ||
    value.tag ||
    value.status ||
    Object.values(value.custom).some(Boolean),
  );
}

export function FilterBar({
  facets,
  value,
  onChange,
}: {
  facets: CatalogFacets;
  value: FilterState;
  onChange: (next: FilterState) => void;
}) {
  const customFacets = facets.custom ?? [];
  const active = isFilterActive(value);

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <Input
          placeholder="Search…"
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
        />
        <FacetSelect
          placeholder="All teams"
          options={facets.teams}
          value={value.team}
          onChange={(team) => onChange({ ...value, team })}
        />
        <FacetSelect
          placeholder="All domains"
          options={facets.domains}
          value={value.domain}
          onChange={(domain) => onChange({ ...value, domain })}
        />
        <FacetSelect
          placeholder="All tags"
          options={facets.tags}
          value={value.tag}
          onChange={(tag) => onChange({ ...value, tag })}
        />
        <FacetSelect
          placeholder="All statuses"
          options={facets.statuses}
          value={value.status}
          onChange={(status) => onChange({ ...value, status })}
        />
        <Button
          variant="outline"
          onClick={() => onChange(EMPTY_FILTER)}
          disabled={!active}
          aria-label="Clear filters"
        >
          Clear
        </Button>
      </div>
      {customFacets.length > 0 && (
        <div className="grid gap-3 md:grid-cols-5">
          {customFacets.map((f) => (
            <CustomFacetSelect
              key={f.key}
              facet={f}
              value={value.custom[f.key] ?? ""}
              onChange={(v) =>
                onChange({
                  ...value,
                  custom: stripEmpty({ ...value.custom, [f.key]: v }),
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function stripEmpty(rec: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) if (v) out[k] = v;
  return out;
}

function FacetSelect({
  placeholder,
  options,
  value,
  onChange,
}: {
  placeholder: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      value={value || ALL_SENTINEL}
      onValueChange={(v) => onChange(v === ALL_SENTINEL ? "" : (v as string))}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_SENTINEL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CustomFacetSelect({
  facet,
  value,
  onChange,
}: {
  facet: CustomFacet;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      value={value || ALL_SENTINEL}
      onValueChange={(v) => onChange(v === ALL_SENTINEL ? "" : (v as string))}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_SENTINEL}>{facet.label}</SelectItem>
        {facet.values.map((v) => (
          <SelectItem key={v} value={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
