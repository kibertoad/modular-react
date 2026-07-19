/**
 * Subject-keyed panels — a render-**all**, predicate-gated, open-contribution
 * projection of a resolved slot.
 *
 * A *panel group* is a named region (a slot key) whose contributions are
 * selected at render time by a caller-supplied **subject** — a piece of
 * application state such as "the currently selected board block". Each
 * contribution carries an optional `when(subject)` predicate and an optional
 * `order`; the group renders **every** matching contribution, ordered, rather
 * than picking one. Contributions come from first-party and consumer modules
 * alike, through the existing `module.slots` path — panels introduce no new
 * registration seam.
 *
 * This is the fourth distinct aggregation shape in the family, and it is
 * deliberately *not* "zones" (that word already names two unrelated,
 * pick-one primitives — route/module zones and composition zones). Where the
 * component-pairing helpers ({@link resolveComponentRegistry} / `pairById`)
 * are a pick-**one**-by-id lookup, panels are a filtered, ordered,
 * render-**all** concatenation — a different reduction over the same slot
 * substrate, and so a different primitive.
 *
 * Like the pairing helpers, {@link resolvePanels} is a **pure, read-side
 * projection of an already-resolved slot**: it registers nothing and introduces
 * no module type. Because it is pure over its inputs, a Vue `computed` (or a
 * React `useMemo`) re-runs it on reactive change with no framework-specific
 * glue — which is what lets the same engine function serve every binding. The
 * thin per-binding hosts (`usePanels` / `<PanelsOutlet>` / `usePanelSubject`)
 * live in `@modular-react/react` and `@modular-vue/vue`.
 *
 * Components stay opaque {@link UiComponent}s here (per PR-01) — the engine
 * never renders, calls, or inspects them.
 *
 * See the "Subject-keyed panels" guide (`docs/subject-panels.md`) for the full
 * pattern, both bindings' hosts, and the reactivity caveat.
 */

import { collapseEntriesById, type OnDuplicateComponentId } from "./component-registry.js";
import type { UiComponent } from "./ui-types.js";

/**
 * One panel contributed to a panel group, addressed by `id`.
 *
 * Placed in a module's `slots` under the group's slot key — a slot entry is
 * opaque by design (`SlotMap = Record<string, readonly unknown[]>`), so
 * contributing typed `PanelEntry` objects is exactly what slots are for, not a
 * workaround.
 *
 * @typeParam TSubject - the application-state value the group is keyed on. The
 * {@link PanelGroupHandle} threads it into a binding's `usePanels(group, ...)`
 * so `when` predicates and the outlet's injected subject are typed end to end.
 */
export interface PanelEntry<TSubject> {
  /**
   * Stable identity for this contribution. Duplicate ids across the group are
   * a registration bug and throw by default (see {@link resolvePanels}); they
   * also key the rendered instance in a binding's outlet.
   */
  readonly id: string;
  /** The component to render for this panel. Carried opaquely — never inspected. */
  readonly component: UiComponent;
  /**
   * Visibility predicate. Return `true` to include this panel for the given
   * subject. Absent = always visible (whenever the subject itself is present).
   * The predicate receives the resolved, non-null subject.
   */
  readonly when?: (subject: TSubject) => boolean;
  /**
   * Ascending sort key among the visible panels. Absent is treated as `0`.
   * Ties preserve contribution (registration) order — the sort is stable.
   */
  readonly order?: number;
  /**
   * Extra props merged with the injected `{ subject }` by a binding's outlet.
   * The engine never reads these — it only carries them for the host. The
   * injected subject wins: a `subject` key placed here is overwritten by the
   * outlet's own injection, so don't use `props` to try to override it.
   */
  readonly props?: Record<string, unknown>;
}

/**
 * A lightweight, phantom-typed token identifying a panel group: its slot key
 * plus the subject type its entries are keyed on. Mirrors the handle
 * convention of `defineJourneyHandle` / `defineCompositionHandle` — the only
 * runtime field is `slotKey`; `__subject` is phantom (never read at runtime),
 * carrying `TSubject` so a binding's `usePanels(group, subject)` type-checks the
 * subject against the group and returns entries typed to it.
 */
export interface PanelGroupHandle<TSubject> {
  /** The slot key modules contribute {@link PanelEntry} objects under. */
  readonly slotKey: string;
  /** Phantom carrier for `TSubject` — never present at runtime. */
  readonly __subject?: TSubject;
}

/**
 * Declare a panel group over a slot key, pinning the subject type.
 *
 * Runtime identity is just `{ slotKey }`; the return type carries `TSubject` so
 * every downstream call site (`usePanels`, `<PanelsOutlet>`, the module
 * contributions) shares one typed handle instead of restating the subject type.
 *
 * @example
 * ```ts
 * // Shared handle — export once, import at both the host and the contributors.
 * export const inspectorPanels = definePanelGroup<BoardBlock>("inspectorPanels");
 * ```
 */
export function definePanelGroup<TSubject>(slotKey: string): PanelGroupHandle<TSubject> {
  return { slotKey };
}

/**
 * Resolve a group's raw slot entries against a subject: dedupe by id, drop
 * panels whose `when(subject)` is false, and stable-sort the survivors by
 * `order`.
 *
 * Semantics, in order:
 *
 * 1. **Duplicate ids throw by default.** Two modules contributing the same
 *    panel id is a bug, mirroring {@link resolveComponentRegistry}'s stance
 *    (and duplicate-module-id validation). `onDuplicate: "last-wins"` /
 *    `"first-wins"` opt out when a deployment intentionally shadows a
 *    first-party id with its own. Validation runs over *all* contributions,
 *    before the null-subject guard and the `when` filter, so a registration
 *    bug surfaces deterministically on first resolve — including the common
 *    initial state where nothing is selected yet.
 * 2. **Null subject → empty.** A `null` / `undefined` subject (nothing
 *    selected) resolves to no panels — no predicate runs.
 * 3. **Filter by predicate.** Panels without a `when` are always kept; those
 *    with one are kept iff it returns `true` for the (non-null) subject.
 * 4. **Stable sort by `order`.** Ascending, `order ?? 0`; ties keep
 *    contribution order (the underlying sort is stable). The input is not
 *    mutated.
 *
 * Pure over its inputs — a Vue `computed` / React `useMemo` re-runs it on
 * reactive change with no glue.
 *
 * @example
 * ```ts
 * const visible = resolvePanels(slots.inspectorPanels, selectedBlock)
 * // → the ordered panels whose `when(selectedBlock)` matched
 * ```
 */
export function resolvePanels<TSubject>(
  entries: readonly PanelEntry<TSubject>[],
  subject: TSubject | null | undefined,
  opts?: { onDuplicate?: OnDuplicateComponentId },
): readonly PanelEntry<TSubject>[] {
  // Validate registration before anything selection-dependent: duplicate ids
  // are a contribution bug whatever is (or isn't) selected, so the throw (or
  // collapse) happens deterministically on first resolve — not only once the
  // user selects something.
  const deduped = dedupeById(entries, opts?.onDuplicate ?? "throw");

  // Nothing selected → nothing to render. Guarded before the filter so `when`
  // predicates never see a null subject (their parameter is the resolved,
  // non-null value).
  if (subject === null || subject === undefined) return [];

  // `filter` allocates a fresh array, so the in-place sort below never touches
  // the caller's slot array.
  const visible = deduped.filter((entry) => (entry.when ? entry.when(subject) : true));

  // Stable sort by `order` (ascending, absent = 0). Array.prototype.sort is
  // stable, so equal `order` values keep their contribution order.
  return visible.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Collapse duplicate ids per {@link OnDuplicateComponentId} via the shared
 * {@link collapseEntriesById}, so the duplicate stance is the same
 * implementation `resolveComponentRegistry` uses — not a lookalike copy.
 */
function dedupeById<TSubject>(
  entries: readonly PanelEntry<TSubject>[],
  onDuplicate: OnDuplicateComponentId,
): readonly PanelEntry<TSubject>[] {
  const { byId, order } = collapseEntriesById(
    entries,
    onDuplicate,
    (id) =>
      new Error(
        `[@modular-frontend/core] resolvePanels: duplicate panel id "${id}". ` +
          `Two modules contributed the same panel id to one group. Namespace consumer ids ` +
          `(e.g. "acme:run-state") so they can't collide with first-party ones, or pass ` +
          `onDuplicate: "last-wins" / "first-wins" to intentionally shadow an id.`,
      ),
  );

  // Fast path: no duplicates collapsed, so the input order is already correct.
  if (order.length === entries.length) return entries;
  return order.map((id) => byId.get(id)!);
}
