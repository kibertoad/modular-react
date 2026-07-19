/**
 * State-keyed overlay host — a pick-**one**, app-state-keyed, open-contribution
 * projection of a resolved slot, plus the pure stacking semantics behind a
 * framework-managed modal surface.
 *
 * An *overlay host* is a named surface (a slot key) whose module-contributed
 * windows are selected at render time by a caller-supplied **active id** — a
 * piece of application state such as "the result view the user opened". Exactly
 * one entry (or none) is active at a time; a binding's `<OverlayOutlet>` mounts
 * it inside a managed modal shell (teleported, backdrop-closed, focus-trapped,
 * scroll-locked, stacked, a11y-wired). Contributions come from first-party and
 * consumer modules alike, through the existing `module.slots` path — overlays
 * introduce no new registration seam.
 *
 * This is the pick-one, modal sibling of the render-all, inline **panels**
 * primitive ({@link resolvePanels} / `definePanelGroup`): panels render every
 * contribution whose `when(subject)` passes, inline in the document flow;
 * an overlay host renders the one contribution named by the active id, outside
 * the flow, with managed behaviour. Same slot substrate, opposite reduction on
 * both axes — a different primitive.
 *
 * Like the pairing and panels helpers, {@link resolveOverlay} is a **pure,
 * read-side projection of an already-resolved slot**: it registers nothing and
 * introduces no module type. The thin per-binding hosts (`useOverlay` /
 * `<OverlayOutlet>` / `useOverlaySubject` / `useModalBehavior`) live in
 * `@modular-react/react` and `@modular-vue/vue`.
 *
 * Components stay opaque {@link UiComponent}s here (per PR-01) — the engine
 * never renders, calls, or inspects them.
 *
 * See the "State-keyed overlay host" guide (`docs/overlay-host.md`) for the
 * full pattern, both bindings' hosts, and the behaviour contract.
 */

import {
  collapseEntriesById,
  type ComponentEntry,
  type OnDuplicateComponentId,
} from "./component-registry.js";
import type { UiComponent } from "./ui-types.js";

/**
 * One overlay window contributed to an overlay host, addressed by `id`.
 *
 * A deliberate **superset of {@link ComponentEntry}** (id + component + meta),
 * so a slot that already serves the pick-one pairing surface
 * (`resolveComponentRegistry`) can serve an overlay host too — an app migrating
 * a hand-rolled modal surface onto the host converts window by window, not in a
 * flag-day.
 *
 * Placed in a module's `slots` under the host's slot key — a slot entry is
 * opaque by design, so contributing typed `OverlayEntry` objects is exactly
 * what slots are for.
 *
 * @typeParam TSubject - the application-state value threaded to the active
 * window (a selected step, a block, …). The {@link OverlayHostHandle} carries
 * it so `title(subject)` and a binding's injected subject are typed end to end.
 * The subject is deliberately allowed to be `null` while the overlay is open —
 * selection is by id, and a window may read its own store instead.
 * @typeParam TMeta - app-defined presentation metadata (icon name, width
 * variant, …), carried opaquely for the app's chrome to interpret. Behaviour
 * the *host* needs is first-class (`title`); presentation the *app* renders is
 * `meta`.
 */
export interface OverlayEntry<TSubject, TMeta = unknown> extends ComponentEntry<
  UiComponent,
  TMeta
> {
  /**
   * Accessible name for the dialog, resolved against the current subject (see
   * {@link resolveOverlayTitle}). A binding's host wires it to the dialog
   * element's `aria-label`, so a contributed window gets a labelled dialog with
   * zero app effort. Optional — an app whose chrome renders its own labelled
   * heading may omit it.
   */
  readonly title?: string | ((subject: TSubject | null) => string);
  /**
   * Extra props merged with the injected `{ subject }` by a binding's host. The
   * engine never reads these — it only carries them. The injected subject wins:
   * a `subject` key placed here is overwritten by the host's own injection.
   */
  readonly props?: Record<string, unknown>;
}

/**
 * A lightweight, phantom-typed token identifying an overlay host: its slot key
 * plus the subject type its windows receive. Mirrors the handle convention of
 * `definePanelGroup` / `defineJourneyHandle` — the only runtime field is
 * `slotKey`; `__subject` is phantom (never read at runtime), carrying
 * `TSubject` so a binding's `useOverlay(host, activeId)` and
 * `useOverlaySubject()` type-check against the host.
 */
export interface OverlayHostHandle<TSubject> {
  /** The slot key modules contribute {@link OverlayEntry} objects under. */
  readonly slotKey: string;
  /** Phantom carrier for `TSubject` — never present at runtime. */
  readonly __subject?: TSubject;
}

/**
 * Declare an overlay host over a slot key, pinning the subject type.
 *
 * Runtime identity is just `{ slotKey }`; the return type carries `TSubject` so
 * every downstream call site (the host outlet, the module contributions, nested
 * `useOverlaySubject` reads) shares one typed handle instead of restating the
 * subject type.
 *
 * @example
 * ```ts
 * // Shared handle — export once, import at both the host and the contributors.
 * export const resultViews = defineOverlayHost<StepRef>("resultViews");
 * ```
 */
export function defineOverlayHost<TSubject>(slotKey: string): OverlayHostHandle<TSubject> {
  return { slotKey };
}

/**
 * Resolve a host's raw slot entries against the active id: dedupe by id, then
 * pick the one entry the id names (or none).
 *
 * Semantics, in order:
 *
 * 1. **Duplicate ids throw by default.** Two modules contributing the same
 *    window id is a bug, mirroring `resolveComponentRegistry` /
 *    `resolvePanels` (the collapse is the same shared implementation, so the
 *    stances cannot drift). `onDuplicate: "last-wins"` / `"first-wins"` opt out
 *    when a deployment intentionally shadows a first-party window. Validation
 *    runs over *all* contributions, before the null-id guard, so a
 *    registration bug surfaces deterministically on first resolve — including
 *    the usual initial state where nothing is open.
 * 2. **Null active id → null.** Nothing open resolves to no entry.
 * 3. **Pick-one lookup.** The entry whose `id` equals `activeId`, or `null`
 *    when the id names nothing — a *dangling* reference. Dangling is data, not
 *    a crash (the id may name a window another deployment ships), matching
 *    `pairById`'s "missing" bucket stance: the binding hosts dev-warn on it and
 *    render nothing.
 *
 * Pure over its inputs — a Vue `computed` / React `useMemo` re-runs it on
 * reactive change with no glue, and unit tests call it with no DOM.
 *
 * @example
 * ```ts
 * const active = resolveOverlay(slots.resultViews, ui.resultView?.view ?? null)
 * // → the one active window's entry, or null
 * ```
 */
export function resolveOverlay<TSubject, TMeta = unknown>(
  entries: readonly OverlayEntry<TSubject, TMeta>[],
  activeId: string | null | undefined,
  opts?: { onDuplicate?: OnDuplicateComponentId },
): OverlayEntry<TSubject, TMeta> | null {
  // Validate registration before anything selection-dependent: duplicate ids
  // are a contribution bug whether or not something is open, so the throw (or
  // collapse) happens deterministically on first resolve.
  const { byId } = collapseEntriesById(
    entries,
    opts?.onDuplicate ?? "throw",
    (id) =>
      new Error(
        `[@modular-frontend/core] resolveOverlay: duplicate overlay id "${id}". ` +
          `Two modules contributed the same window id to one host. Namespace consumer ids ` +
          `(e.g. "acme:security-report") so they can't collide with first-party ones, or pass ` +
          `onDuplicate: "last-wins" / "first-wins" to intentionally shadow an id.`,
      ),
  );

  if (activeId === null || activeId === undefined) return null;
  return byId.get(activeId) ?? null;
}

/**
 * Resolve an entry's accessible name against the current subject: a function
 * `title` is called with the subject (which may be `null` — selection is by id,
 * not by subject), a string is returned as-is, an absent title resolves to
 * `undefined`. Shared by both bindings' hosts so the labelling rule cannot
 * drift.
 */
export function resolveOverlayTitle<TSubject, TMeta = unknown>(
  entry: OverlayEntry<TSubject, TMeta>,
  subject: TSubject | null,
): string | undefined {
  if (entry.title === undefined) return undefined;
  return typeof entry.title === "function" ? entry.title(subject) : entry.title;
}

/**
 * A live registration on an {@link OverlayStack}: `release()` when the overlay
 * deactivates (idempotent), `isTop()` to ask whether this overlay is the
 * topmost live registration — the one an Escape press should close.
 */
export interface OverlayStackTicket {
  /** Remove this registration from the stack. Safe to call more than once. */
  release(): void;
  /** Whether this registration is currently the top of the stack. `false` after release. */
  isTop(): boolean;
}

/**
 * The shared stacking semantics behind "the top overlay closes first" and
 * "nested overlays layer correctly": a LIFO stack of live registrations with a
 * subscribe seam so a binding can make `isTop` reactive (a Vue `ref` bumped on
 * notify, a React `useSyncExternalStore`). Pure data — no DOM, no listeners of
 * its own — which is what lets it live in the neutral engine while the
 * DOM-touching behaviour (key events, focus, scroll) stays per binding. Both
 * bindings consume one module-level stack instance, so every overlay in an app
 * — outlet-hosted or bespoke via `useModalBehavior` — shares one ordering.
 */
export interface OverlayStack {
  /** Register an activating overlay; the newest registration is the top. */
  push(): OverlayStackTicket;
  /** Number of live registrations (0 = no overlay open). */
  readonly size: number;
  /**
   * Subscribe to stack changes (any push or release). Returns an unsubscribe
   * function. Listeners are notified after the change is applied.
   */
  subscribe(listener: () => void): () => void;
}

/**
 * Create an {@link OverlayStack}. Bindings create one per module scope; apps
 * only need their own for bespoke coordination outside the shipped hosts.
 */
export function createOverlayStack(): OverlayStack {
  // Tokens are per-ticket object identities; order of the array is stack order.
  const live: object[] = [];
  const listeners = new Set<() => void>();

  const notify = () => {
    // Snapshot so a listener mutating the set mid-notify (unsubscribing itself
    // or a peer) can't affect this round's delivery.
    const snapshot = Array.from(listeners);
    for (const listener of snapshot) listener();
  };

  return {
    push() {
      const token = {};
      live.push(token);
      notify();
      return {
        release() {
          const at = live.indexOf(token);
          if (at === -1) return; // idempotent
          live.splice(at, 1);
          notify();
        },
        isTop() {
          return live.length > 0 && live[live.length - 1] === token;
        },
      };
    },
    get size() {
      return live.length;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
