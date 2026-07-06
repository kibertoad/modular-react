import { isDevEnv } from "./dev-env.js";
import type { RouteStaticDataOverrideInfo } from "./route-data.js";

/**
 * Package label for the warning prefix. Closed set: the first-party runtime
 * packages that wrap `mergeRouteStaticData` with `useZones` /
 * `useRouteData` (React Router, TanStack Router, vue-router). New runtimes
 * that integrate `mergeRouteStaticData` should add their package name here.
 */
export type RouteDataRuntimeLabel =
  | "@react-router-modules/runtime"
  | "@tanstack-react-modules/runtime"
  | "@modular-vue/runtime";

/** Hook surfacing the warning. Closed set: the two route-data hooks. */
export type RouteDataHookName = "useZones" | "useRouteData";

/** Human label for the merged field — router-specific. */
export type RouteDataFieldLabel = "handle" | "staticData" | "meta";

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
 * are read off the match object at warn time: React Router and TanStack
 * Router expose a stable `id`/`routeId` on `useMatches()` entries, and
 * vue-router's matched records fall back to their `name` or `path`. Because
 * a vue-router `path` is not unique (nameless index routes share their
 * parent's `path`), the match's position in the hierarchy is folded into
 * both the dedup key and the message when the ids would otherwise collide.
 *
 * Dedup state lives on the returned closure, not module-globally — under
 * dev HMR each module re-evaluation allocates a fresh warner, so a
 * previously-suppressed override may warn again after a hot reload. That's
 * the expected behavior; the dedup is "once per process per warner
 * instance", not "once per process forever."
 *
 * Cross-package helper consumed by `@react-router-modules/runtime`,
 * `@tanstack-react-modules/runtime`, and `@modular-vue/runtime` to back the
 * override warning fired by `useZones` and `useRouteData`. The parameter
 * types are deliberately
 * narrow literal unions — they catch label typos at compile time and pin
 * the contract to first-party runtime hooks. The warning format and dedup
 * key shape are not part of the public stability contract; they may
 * evolve across minor versions if the runtime hooks change.
 *
 * @param runtimeLabel  Package label for the warning prefix.
 * @param hookName      Hook surfacing the warning.
 * @param fieldLabel    Field being merged: `"handle"` (React Router),
 *                      `"staticData"` (TanStack), or `"meta"` (vue-router).
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
    // The router id is not always unique: vue-router nameless index routes
    // share their parent's `path`, so an index child and its parent read the
    // same id. Fold the match position into both the dedup key and the label
    // so distinct override sites don't collide (silently suppressing a real
    // clobber) and the message doesn't read as a route overriding itself.
    const prevPart = info.previousIndex === undefined ? prevId : `${prevId}#${info.previousIndex}`;
    const nextPart = info.nextIndex === undefined ? nextId : `${nextId}#${info.nextIndex}`;
    // Use ASCII Unit Separator (\x1F) between the triple parts so a
    // space in any one component (theoretical for route IDs, possible
    // for keys) can't bleed into another and create a false dedup hit.
    const dedupKey = `${info.key}\x1F${prevPart}\x1F${nextPart}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);

    // Only surface the position when the two ids are otherwise identical —
    // keeps the message byte-identical for React/TanStack (unique ids) and
    // disambiguates the vue-router same-`path` case.
    const ambiguous = prevId === nextId && info.previousIndex !== undefined;
    const prevLabel = ambiguous ? `${prevId} (match ${info.previousIndex})` : prevId;
    const nextLabel = ambiguous ? `${nextId} (match ${info.nextIndex})` : nextId;

    // eslint-disable-next-line no-console
    console.warn(
      `[${runtimeLabel}] ${hookName}: route "${nextLabel}" overrides ${fieldLabel} key "${info.key}" already set by ancestor "${prevLabel}". ` +
        `If this override is intentional, ignore this warning. ` +
        `If "${info.key}" is owned by the shell layout, the descendant route should not declare it — ` +
        `omit the key to inherit, or set it to \`null\` to explicitly clear it.`,
    );
  };
}

function readMatchId(match: unknown): string {
  if (match && typeof match === "object") {
    const m = match as { id?: unknown; routeId?: unknown; name?: unknown; path?: unknown };
    if (typeof m.id === "string") return m.id;
    if (typeof m.routeId === "string") return m.routeId;
    // vue-router matched records carry no `id`; their `name` (when set) or
    // `path` is the stable identifier.
    if (typeof m.name === "string") return m.name;
    if (typeof m.path === "string") return m.path;
  }
  return "<unknown>";
}
