/**
 * Read-side pairing of wire-delivered manifest data with code-shipped, locally
 * registered components.
 *
 * A remote manifest cannot carry a component (see {@link RemoteModuleManifest} —
 * `component` / `zones` / `createRoutes` are omitted). The sanctioned way to let
 * backend data light up a locally-installed view is to have the manifest carry a
 * string **discriminator** id, ship the component as code, register it through
 * the normal module → slot path, and pair the two by id at render time.
 *
 * These helpers are a **read-side projection of an already-resolved slot** — pure
 * functions, peers of {@link mergeRemoteManifests} / `buildSlotsManifest`. They
 * register nothing and introduce no new module type: components still enter only
 * via modules → slots. Because they are pure over their inputs, a Vue `computed`
 * (or a React `useMemo`) re-runs them on reactive change with no library-specific
 * glue, which is what lets the same helper serve every framework binding.
 *
 * See the "Pairing wire-safe manifests with code-shipped components" section of
 * the Remote Capability Manifests guide for the full pattern.
 */

/** One code-shipped component contributed to a registry slot, addressed by `id`. */
export interface ComponentEntry<C, TMeta = unknown> {
  readonly id: string;
  readonly component: C;
  readonly meta?: TMeta;
}

/**
 * An id → component lookup indexed from a slot of {@link ComponentEntry}. A plain
 * read-only view over the resolved slot — not a registration path.
 */
export interface ComponentRegistry<C, TMeta = unknown> {
  /** The component registered under `id`, or `undefined` if none. */
  get(id: string): C | undefined;
  /** The full {@link ComponentEntry} under `id` (component + meta), or `undefined`. */
  getEntry(id: string): ComponentEntry<C, TMeta> | undefined;
  /** Whether a component is registered under `id`. */
  has(id: string): boolean;
  /** Registered ids, in first-seen order. */
  readonly ids: readonly string[];
  /** The winning entries, in first-seen id order. */
  readonly entries: readonly ComponentEntry<C, TMeta>[];
}

/**
 * How {@link resolveComponentRegistry} handles two entries claiming the same id.
 *
 * - `throw` (default) — two modules registering the same view id is a bug, not a
 *   silent last-wins; fail loudly, mirroring duplicate-module-id validation.
 * - `last-wins` / `first-wins` — opt out when a deployment intentionally shadows a
 *   first-party id with its own.
 */
export type OnDuplicateComponentId = "throw" | "last-wins" | "first-wins";

/**
 * Index a slot of {@link ComponentEntry} into an id → component registry.
 *
 * Duplicate ids THROW by default. `onDuplicate: 'last-wins'` / `'first-wins'` opt
 * out when a deployment intentionally overrides a first-party id.
 *
 * @example
 * ```ts
 * const registry = resolveComponentRegistry(useReactiveSlots().value.resultViews)
 * const View = registry.get(activeViewId) // undefined → render a fallback
 * ```
 */
export function resolveComponentRegistry<C, TMeta = unknown>(
  entries: readonly ComponentEntry<C, TMeta>[],
  opts?: { onDuplicate?: OnDuplicateComponentId },
): ComponentRegistry<C, TMeta> {
  const onDuplicate = opts?.onDuplicate ?? "throw";
  const byId = new Map<string, ComponentEntry<C, TMeta>>();
  const order: string[] = [];

  for (const entry of entries) {
    if (byId.has(entry.id)) {
      if (onDuplicate === "throw") {
        throw new Error(
          `[@modular-frontend/core] resolveComponentRegistry: duplicate component id "${entry.id}". ` +
            `Two modules registered the same component id. Namespace consumer ids (e.g. "acme:security-report") ` +
            `so they can't collide with first-party ones, or pass onDuplicate: "last-wins" / "first-wins" to ` +
            `intentionally shadow an id.`,
        );
      }
      if (onDuplicate === "first-wins") continue;
      // last-wins: replace the component but keep the id's first-seen position.
      byId.set(entry.id, entry);
      continue;
    }
    byId.set(entry.id, entry);
    order.push(entry.id);
  }

  // Built once: the registry is immutable after construction, so `ids` and
  // `entries` keep a stable identity across reads (safe to feed into memoized
  // render paths) and callers can't reach the internal order array.
  const ids: readonly string[] = [...order];
  const resolvedEntries: readonly ComponentEntry<C, TMeta>[] = order.map((id) => byId.get(id)!);

  return {
    get: (id) => byId.get(id)?.component,
    getEntry: (id) => byId.get(id),
    has: (id) => byId.has(id),
    ids,
    entries: resolvedEntries,
  };
}

/**
 * Pair a list of manifest data entries with a {@link ComponentRegistry} by id.
 *
 * Partitions the input into three explicit buckets so the host handles each
 * outcome deliberately instead of re-deriving the split — and instead of a silent
 * miss when a manifest names a view no installed module provides:
 *
 * - `paired` — the referenced id resolved to a registered component.
 * - `missing` — an id was requested but no component is registered for it (a
 *   dangling reference; dev-warn + render a fallback).
 * - `unref` — `idOf` returned `undefined`, i.e. the item requested no view (e.g.
 *   route it to the generic panel).
 *
 * @example
 * ```ts
 * const { paired, missing, unref } = pairById(
 *   customAgentKinds,
 *   registry,
 *   (kind) => kind.presentation.resultView,
 * )
 * ```
 */
export function pairById<T, C, TMeta = unknown>(
  items: readonly T[],
  registry: ComponentRegistry<C, TMeta>,
  idOf: (item: T) => string | undefined,
): {
  readonly paired: readonly { item: T; id: string; component: C }[];
  readonly missing: readonly { item: T; id: string }[];
  readonly unref: readonly T[];
} {
  const paired: { item: T; id: string; component: C }[] = [];
  const missing: { item: T; id: string }[] = [];
  const unref: T[] = [];

  for (const item of items) {
    const id = idOf(item);
    if (id === undefined) {
      unref.push(item);
      continue;
    }
    const entry = registry.getEntry(id);
    if (entry === undefined) {
      missing.push({ item, id });
      continue;
    }
    paired.push({ item, id, component: entry.component });
  }

  return { paired, missing, unref };
}
