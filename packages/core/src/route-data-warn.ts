import { isDevEnv } from "./dev-env.js";
import type { RouteStaticDataOverrideInfo } from "./route-data.js";

/**
 * Package label for the warning prefix. Closed set: the two runtime
 * packages that wrap `mergeRouteStaticData` with `useZones` /
 * `useRouteData`. New runtimes that integrate `mergeRouteStaticData`
 * should add their package name here.
 */
export type RouteDataRuntimeLabel =
  | "@react-router-modules/runtime"
  | "@tanstack-react-modules/runtime";

/** Hook surfacing the warning. Closed set: the two route-data hooks. */
export type RouteDataHookName = "useZones" | "useRouteData";

/** Human label for the merged field — router-specific. */
export type RouteDataFieldLabel = "handle" | "staticData";

/**
 * Build an `onOverride` callback for `mergeRouteStaticData` that logs a
 * deduped `console.warn` whenever a deeper route silently overrides a key
 * already set by an ancestor.
 *
 * Returns `undefined` outside of dev environments so runtime hooks can
 * unconditionally pass the result as `options.onOverride` without paying
 * any production cost (the merge skips its bookkeeping when the callback
 * is undefined).
 *
 * Dedup key is `(key, previousMatchId, nextMatchId)` so the warning fires
 * once per unique override per process — not once per render. Match `id`s
 * are read off the match object at warn time; both React Router and
 * TanStack Router expose a stable `id` field on `useMatches()` entries.
 *
 * Dedup state lives on the returned closure, not module-globally — under
 * dev HMR each module re-evaluation allocates a fresh warner, so a
 * previously-suppressed override may warn again after a hot reload. That's
 * the expected behavior; the dedup is "once per process per warner
 * instance", not "once per process forever."
 *
 * Cross-package helper consumed by `@react-router-modules/runtime` and
 * `@tanstack-react-modules/runtime` to back the override warning fired by
 * `useZones` and `useRouteData`. The parameter types are deliberately
 * narrow literal unions — they catch label typos at compile time and pin
 * the contract to first-party runtime hooks. The warning format and dedup
 * key shape are not part of the public stability contract; they may
 * evolve across minor versions if the runtime hooks change.
 *
 * @param runtimeLabel  Package label for the warning prefix.
 * @param hookName      Hook surfacing the warning.
 * @param fieldLabel    Field being merged: `"handle"` (React Router) or
 *                      `"staticData"` (TanStack).
 */
export function createRouteDataOverrideWarner(
  runtimeLabel: RouteDataRuntimeLabel,
  hookName: RouteDataHookName,
  fieldLabel: RouteDataFieldLabel,
): ((info: RouteStaticDataOverrideInfo) => void) | undefined {
  if (!isDevEnv()) return undefined;

  const seen = new Set<string>();
  return (info) => {
    const prevId = readMatchId(info.previousMatch);
    const nextId = readMatchId(info.nextMatch);
    // Use ASCII Unit Separator (\x1F) between the triple parts so a
    // space in any one component (theoretical for route IDs, possible
    // for keys) can't bleed into another and create a false dedup hit.
    const dedupKey = `${info.key}\x1F${prevId}\x1F${nextId}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);

    // eslint-disable-next-line no-console
    console.warn(
      `[${runtimeLabel}] ${hookName}: route "${nextId}" overrides ${fieldLabel} key "${info.key}" already set by ancestor "${prevId}". ` +
        `If this override is intentional, ignore this warning. ` +
        `If "${info.key}" is owned by the shell layout, the descendant route should not declare it — ` +
        `omit the key to inherit, or set it to \`null\` to explicitly clear it.`,
    );
  };
}

function readMatchId(match: unknown): string {
  if (match && typeof match === "object") {
    const m = match as { id?: unknown; routeId?: unknown };
    if (typeof m.id === "string") return m.id;
    if (typeof m.routeId === "string") return m.routeId;
  }
  return "<unknown>";
}
