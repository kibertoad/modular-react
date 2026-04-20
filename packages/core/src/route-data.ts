/**
 * Merge route-level static data from a matched route hierarchy into a single
 * object, with deepest-match-wins semantics.
 *
 * Router-agnostic core: each runtime package has its own `useRouteData` (and
 * sibling `useZones`) hook that calls its router's `useMatches` and passes
 * the result here along with a field accessor (`handle` for React Router,
 * `staticData` for TanStack Router). Keeping the merge logic in core means
 * the two runtimes can't drift in subtle ways — semantics (traversal order,
 * undefined handling, key shadowing) live in one place.
 *
 * Merge rules (same for `useZones` and `useRouteData`):
 * - Iterate `matches` in the order given (root → leaf).
 * - Deeper matches overwrite shallower ones per-key.
 * - `undefined` values at any level are skipped — they never clobber a
 *   value from an ancestor. This lets a leaf route declare
 *   `{ HeaderActions: undefined }` *without* hiding the parent's component;
 *   omit the key entirely to inherit, set to a real value to override.
 */
export function mergeRouteStaticData<T extends object>(
  matches: readonly unknown[],
  getData: (match: unknown) => unknown,
): Partial<T> {
  const merged: Record<string, unknown> = {};
  for (const match of matches) {
    const data = getData(match);
    // `typeof null === "object"` is the well-known JS footgun — the truthiness
    // check covers that. `Array.isArray` excludes the other object-but-wrong
    // shape: arrays enumerate via numeric keys and would silently merge into
    // `merged` as `{ 0: ..., 1: ... }` if we didn't filter them out.
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (value !== undefined) {
          merged[key] = value;
        }
      }
    }
  }
  return merged as Partial<T>;
}
