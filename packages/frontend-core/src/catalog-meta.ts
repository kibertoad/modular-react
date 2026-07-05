/**
 * Officially-supported descriptive metadata fields the framework and its
 * sibling packages (notably `@modular-react/catalog`) recognize and read.
 *
 * These keys live inside the descriptor's `meta` bag, not as top-level
 * descriptor fields, but they are intersected into the descriptor's
 * `meta` typing so authors get autocomplete and type checking for free —
 * regardless of whether they supply a custom `TMeta` generic.
 *
 * All keys are optional. A descriptor that omits the entire `meta` field,
 * or that only fills in app-specific keys via `TMeta`, remains valid.
 *
 * The runtime never reads these fields; they exist for discovery UIs,
 * documentation generators, and tooling.
 */
export interface CatalogMeta {
  /** Human-readable display name (distinct from `id`, which is the unique identifier). */
  readonly name?: string;

  /** One-line summary used by directory listings, command palettes, and search results. */
  readonly description?: string;

  /**
   * Owning team identifier — opaque string the catalog pivots on.
   * Apps typically use a slug like "billing-platform" or an email/group address.
   */
  readonly ownerTeam?: string;

  /**
   * Domain or capability area the descriptor belongs to (e.g. "finance",
   * "onboarding", "observability"). Used for grouping and faceted filtering.
   */
  readonly domain?: string;

  /** Free-form discovery tags. Authors should keep them short and lowercase. */
  readonly tags?: readonly string[];

  /**
   * Lifecycle hint that surfaces in catalog UIs as a badge.
   * `experimental` — opt-in only, may change without notice.
   * `stable`       — recommended for production use.
   * `deprecated`   — kept for compatibility but discouraged for new work.
   */
  readonly status?: "experimental" | "stable" | "deprecated";

  /** SemVer of the version where the descriptor first became available. */
  readonly since?: string;

  /** Discovery links surfaced on detail pages. All optional. */
  readonly links?: {
    /** Canonical documentation URL. */
    readonly docs?: string;
    /** Source code URL (typically a git provider link). */
    readonly source?: string;
    /** Slack channel or other chat URL for the owning team. */
    readonly slack?: string;
    /** Operational runbook for incidents. */
    readonly runbook?: string;
  };

  /**
   * Optional asset URLs (screenshots, illustrations) the catalog can render
   * on the detail page. The framework treats them as opaque strings.
   */
  readonly screenshots?: readonly string[];
}
