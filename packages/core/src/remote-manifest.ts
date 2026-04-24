import type { NavigationItemBase, SlotMap, SlotMapOf } from "./types.js";

/**
 * A navigation item shape that can round-trip through JSON.
 *
 * `to` is narrowed to `string` (no function form — function `to` cannot
 * cross a network boundary) and `icon` is narrowed to `string` (no
 * `ComponentType` form — the shell is expected to map icon identifiers
 * to components locally).
 *
 * `label` / `meta` inherit the generics from {@link NavigationItem}, so
 * typed i18n keys and typed `meta` still work; the host just needs to
 * trust (or validate) that the JSON conforms to its declared types.
 */
export interface RemoteNavigationItem<TLabel extends string = string, TMeta = unknown> {
  readonly label: TLabel;
  readonly to: string;
  readonly icon?: string;
  readonly group?: string;
  readonly order?: number;
  readonly hidden?: boolean;
  readonly meta?: TMeta;
}

/**
 * A JSON-safe subset of {@link ModuleDescriptor} — the descriptor shape a
 * backend can legitimately return from an HTTP endpoint and a host app can
 * deserialize without losing information.
 *
 * Fields intentionally omitted:
 *
 * - `component`, `zones`, `createRoutes` — React components and route
 *   builders can't cross a network boundary. If a feature needs these, it
 *   must ship as code.
 * - `dynamicSlots`, `lifecycle` — functions, non-serializable.
 * - `requires`, `optionalRequires` — dependency contracts are a property of
 *   the code that uses them, not of the remote manifest. Validate against
 *   the host `AppDependencies` at the call site that consumes the manifest.
 *
 * The navigation shape is narrowed to {@link RemoteNavigationItem} so the
 * type system refuses function `to` and component `icon` up front — the two
 * fields on the default {@link NavigationItem} that aren't JSON-safe.
 *
 * Typical use: receive `RemoteModuleManifest[]` from an API, pass the array
 * to {@link mergeRemoteManifests}, then return the merged slots/navigation
 * from a shell-owned module's {@link ModuleDescriptor.dynamicSlots} (for
 * slots) or directly as static `navigation` / `slots` when the fetch
 * completes before {@link ModuleDescriptor} registration.
 *
 * @example
 * ```ts
 * type AppRemoteManifest = RemoteModuleManifest<AppSlots, AppNavItem>
 *
 * const response: AppRemoteManifest[] = await httpClient.get("/api/integrations")
 * ```
 */
export interface RemoteModuleManifest<
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = RemoteNavigationItem,
> {
  readonly id: string;
  readonly version: string;
  readonly slots?: { readonly [K in keyof TSlots]?: TSlots[K] };
  readonly navigation?: readonly TNavItem[];
  readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * The result of merging a set of {@link RemoteModuleManifest}s into a single
 * bundle the shell can feed into `dynamicSlots` / `navigation`.
 *
 * - `slots` is a partial of the app slot map: only keys that at least one
 *   manifest contributed to appear. Suitable for returning directly from a
 *   `dynamicSlots(deps)` factory.
 * - `navigation` is the concatenated navigation items across all manifests,
 *   in input order. Sorting + grouping still happens in
 *   `buildNavigationManifest` at registry-resolve time — don't re-sort here.
 * - `meta` is a flat `{ [moduleId]: meta }` map, so the shell can look up a
 *   specific remote module's catalog metadata by id without scanning the
 *   original array.
 */
export interface MergedRemoteManifests<
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = RemoteNavigationItem,
> {
  readonly slots: { [K in keyof TSlots]?: TSlots[K] };
  readonly navigation: readonly TNavItem[];
  readonly meta: Record<string, Readonly<Record<string, unknown>>>;
}

/**
 * Merge a list of {@link RemoteModuleManifest}s into a single bundle of
 * slots, navigation, and per-module meta.
 *
 * Use this helper for the **cumulative topology** — many manifests held
 * simultaneously (catalogue tiles, partner-app command entries, feature
 * packs). If your app instead holds a single active manifest at a time and
 * swaps it on context change (per-project, per-tenant, per-workspace), skip
 * this helper entirely and read the active manifest's `slots` directly:
 *
 * ```ts
 * dynamicSlots: (deps) => deps.integrations.activeManifest?.slots ?? {}
 * ```
 *
 * See the "Storing: merge-many vs swap-one topology" section of the
 * Remote Capability Manifests guide for the full tradeoff.
 *
 * Duplicate ids throw — remote manifests coming from different backend
 * services that accidentally share an id would silently clobber each other
 * in the meta map and double-contribute to slots, so fail loudly instead.
 *
 * This helper does NOT validate the shape of individual manifests. Validate
 * at the network boundary (zod / valibot / hand-rolled guard) before
 * passing values in — once a manifest is typed as `RemoteModuleManifest`,
 * this function trusts the type.
 *
 * @example
 * ```ts
 * const remotes = await httpClient.get<RemoteModuleManifest[]>("/api/capabilities")
 * const merged = mergeRemoteManifests(remotes)
 *
 * // Inside a shell-owned integrations module:
 * dynamicSlots: (deps) => mergeRemoteManifests(deps.integrations.manifests).slots
 * ```
 */
export function mergeRemoteManifests<
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = RemoteNavigationItem,
>(
  manifests: readonly RemoteModuleManifest<TSlots, TNavItem>[],
): MergedRemoteManifests<TSlots, TNavItem> {
  const slots: Record<string, unknown[]> = {};
  const navigation: TNavItem[] = [];
  const meta: Record<string, Readonly<Record<string, unknown>>> = {};
  const seen = new Set<string>();

  for (const manifest of manifests) {
    if (seen.has(manifest.id)) {
      throw new Error(
        `[@modular-react/core] mergeRemoteManifests: duplicate remote manifest id "${manifest.id}". Each remote manifest must have a unique id.`,
      );
    }
    seen.add(manifest.id);

    if (manifest.slots) {
      for (const [key, items] of Object.entries(manifest.slots)) {
        if (!Array.isArray(items)) continue;
        if (!slots[key]) slots[key] = [];
        slots[key].push(...items);
      }
    }

    if (manifest.navigation) {
      navigation.push(...manifest.navigation);
    }

    if (manifest.meta) {
      meta[manifest.id] = manifest.meta;
    }
  }

  return {
    slots: slots as unknown as { [K in keyof TSlots]?: TSlots[K] },
    navigation,
    meta,
  };
}
