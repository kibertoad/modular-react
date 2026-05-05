/**
 * Information about a single override event reported by
 * `mergeRouteStaticData` to the optional `onOverride` callback.
 */
export interface RouteStaticDataOverrideInfo {
  /** The static-data key whose value was overwritten. */
  key: string;
  /** The value contributed by the ancestor match. */
  previousValue: unknown;
  /** The value contributed by the deeper match (now winning). */
  nextValue: unknown;
  /** The ancestor match that contributed `previousValue`. */
  previousMatch: unknown;
  /** The deeper match that contributed `nextValue`. */
  nextMatch: unknown;
}

export interface MergeRouteStaticDataOptions {
  /**
   * Fires when a deeper match overwrites a key already set by a shallower
   * one. Intended for dev-mode diagnostics — `useZones` / `useRouteData`
   * wire a deduped console warner so accidental zone clobbers surface
   * during development. Pass `undefined` (or omit) for silent merging.
   *
   * The callback runs *during the merge* — keep it cheap, never throw.
   */
  onOverride?: (info: RouteStaticDataOverrideInfo) => void;
}

/**
 * Merge route-level static data from a matched route hierarchy into a single
 * object, with deepest-match-wins semantics.
 *
 * Router-agnostic core: each runtime package has its own `useRouteData` (and
 * sibling `useZones`) hook that calls its router's `useMatches` and passes
 * the result here along with a field accessor (`handle` for React Router,
 * `staticData` for TanStack Router). Keeping the merge logic in core means
 * the two runtimes can't drift in subtle ways — semantics (traversal order,
 * undefined handling, key shadowing, override reporting) live in one place.
 *
 * Merge rules (same for `useZones` and `useRouteData`):
 * - Iterate `matches` in the order given (root → leaf).
 * - Deeper matches overwrite shallower ones per-key.
 * - `undefined` values at any level are skipped — they never clobber a
 *   value from an ancestor. To **inherit** an ancestor's value, omit the
 *   key entirely or set it to `undefined`.
 * - `null` is preserved like any other defined value — to **explicitly
 *   clear** an ancestor's value at a deeper route, set the key to `null`
 *   (the shell's render is then responsible for treating `null` as
 *   "intentionally absent"). This is the only in-merge way to remove an
 *   inherited zone.
 * - When `onOverride` is provided, it fires once per overwritten key with
 *   both the previous (ancestor) and next (deeper) match objects, so
 *   callers can diagnose accidental clobbers.
 */
export function mergeRouteStaticData<T extends object>(
  matches: readonly unknown[],
  getData: (match: unknown) => unknown,
  options?: MergeRouteStaticDataOptions,
): Partial<T> {
  const merged: Record<string, unknown> = {};
  // Only allocate the source-tracking map when a caller actually wants
  // override notifications; the common production path has no overhead.
  const sources: Record<string, unknown> | null = options?.onOverride ? {} : null;
  const onOverride = options?.onOverride;

  for (const match of matches) {
    const data = getData(match);
    // `typeof null === "object"` is the well-known JS footgun — the truthiness
    // check covers that. `Array.isArray` excludes the other object-but-wrong
    // shape: arrays enumerate via numeric keys and would silently merge into
    // `merged` as `{ 0: ..., 1: ... }` if we didn't filter them out.
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (value !== undefined) {
          if (sources && Object.prototype.hasOwnProperty.call(merged, key)) {
            // `sources` is non-null iff `onOverride` was provided.
            onOverride!({
              key,
              previousValue: merged[key],
              nextValue: value,
              previousMatch: sources[key],
              nextMatch: match,
            });
          }
          merged[key] = value;
          if (sources) sources[key] = match;
        }
      }
    }
  }
  return merged as Partial<T>;
}
