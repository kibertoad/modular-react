import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import type { ComponentType, ReactNode, RefObject } from "react";
import {
  firstFocusableIn,
  isDevEnv,
  lockBodyScroll,
  resolveOverlay,
  resolveOverlayTitle,
  sharedOverlayStack,
  trapTabFocus,
  unlockBodyScroll,
  type OnDuplicateComponentId,
  type OverlayEntry,
  type OverlayHostHandle,
  type OverlayStackTicket,
} from "@modular-react/core";
import { ModuleErrorBoundary } from "./error-boundary.js";
import { useSlots } from "./slots-context.js";

/**
 * React host for the framework-neutral **state-keyed overlay** primitive (see
 * `resolveOverlay` / `defineOverlayHost` in `@modular-react/core`). An overlay
 * host is a named surface whose module-contributed windows are selected by a
 * caller-supplied **active id** — exactly one open at a time — and mounted
 * inside a framework-managed modal shell: portaled, backdrop-closed,
 * focus-trapped with focus return, scroll-locked, stack-registered,
 * a11y-wired. The pick-one, modal sibling of the render-all, inline
 * `<PanelsOutlet>`.
 *
 * The host is **headless**: it renders exactly the two elements the behaviour
 * must own (backdrop, dialog panel), styleable via `backdropClassName` /
 * `panelClassName`; everything inside the dialog belongs to the app's `wrap`
 * chrome. State stays app-owned — the host *requests* close (backdrop click,
 * Escape) via `onClose`; the app clears the active id.
 */

// Sentinel default so a read outside an `<OverlayOutlet>` is a loud error
// rather than a silently-undefined subject that a valid `null` subject can't
// be told apart from.
const NO_SUBJECT = Symbol("modular-react.no-overlay-subject");

/**
 * Context carrying the current overlay subject, set by {@link OverlayOutlet}.
 * Prefer {@link useOverlaySubject} — it throws outside the outlet instead of
 * handing back the private sentinel default.
 */
export const OverlaySubjectContext = createContext<unknown>(NO_SUBJECT);

/**
 * Read the subject of the enclosing {@link OverlayOutlet}. May be `null`:
 * overlay selection is by id, and a window that keys on its own store can be
 * open with no subject. Throws when called outside an `<OverlayOutlet>` so a
 * missing host is a loud error.
 *
 * @example
 * ```tsx
 * const step = useOverlaySubject<StepRef | null>()
 * return <h3>{step ? `Step ${step.stepIndex}` : ""}</h3>
 * ```
 */
export function useOverlaySubject<TSubject>(): TSubject | null {
  const subject = useContext(OverlaySubjectContext);
  if (subject === NO_SUBJECT) {
    throw new Error(
      "[@modular-react/react] useOverlaySubject must be used inside an <OverlayOutlet> " +
        "(the outlet provides the current overlay subject).",
    );
  }
  return subject as TSubject | null;
}

/**
 * Resolve an overlay host against an active id. Reads the host's slot key from
 * the slots context and runs the pure `resolveOverlay`, memoized on the
 * entries, the id, and the duplicate stance.
 *
 * A `null` / `undefined` active id resolves to no entry; a dangling id (no
 * entry registered under it) also resolves to `null` — see the dev warning in
 * {@link OverlayOutlet}.
 *
 * @example
 * ```tsx
 * const active = useOverlay(resultViews, ui.resultView?.view ?? null)
 * ```
 */
// Stable identity for "this host has no contributions", so the memo below
// doesn't see a fresh `[]` on every render.
const NO_ENTRIES: readonly OverlayEntry<never>[] = [];

export function useOverlay<TSubject>(
  host: OverlayHostHandle<TSubject>,
  activeId: string | null | undefined,
  opts?: { onDuplicate?: OnDuplicateComponentId },
): OverlayEntry<TSubject> | null {
  const slots = useSlots<Record<string, readonly OverlayEntry<TSubject>[]>>();
  const entries = (slots[host.slotKey] ?? NO_ENTRIES) as readonly OverlayEntry<TSubject>[];
  const onDuplicate = opts?.onDuplicate;
  return useMemo(
    () => resolveOverlay(entries, activeId, onDuplicate ? { onDuplicate } : undefined),
    [entries, activeId, onDuplicate],
  );
}

// ---------------------------------------------------------------------------
// Managed modal behaviour
// ---------------------------------------------------------------------------

// The stack instance, scroll lock, and focus semantics live in the engine
// (`sharedOverlayStack`, `lockBodyScroll` / `unlockBodyScroll`,
// `firstFocusableIn` / `trapTabFocus`) — one implementation shared with the
// Vue binding so the behaviour cannot drift. This module contributes only the
// React glue: effects, refs, and re-renders.

/**
 * The managed modal *behaviour* as a standalone hook, for a window that needs
 * a bespoke root (a full-bleed detail surface, a hand-styled shell) but still
 * wants correct, consistent behaviour instead of re-deriving it:
 *
 * - registers on the shared overlay **stack** while `active` (nested overlays
 *   layer in open order; `isTop` tells this one whether it is topmost);
 * - closes on **Escape** only when topmost (the top overlay closes first);
 * - **traps focus** inside `dialogRef` (Tab cycles; focus that escapes is
 *   pulled back) and moves initial focus in on activation — `initialFocus` if
 *   given, else the first focusable, else the dialog element itself (give it
 *   `tabIndex={-1}`);
 * - **returns focus** to the previously-focused element on deactivation;
 * - **locks body scroll** while any overlay is open (shared count).
 *
 * `{@link OverlayOutlet}` uses exactly this hook internally, so a bespoke root
 * and a hosted window behave identically. Effect-driven: inert on the server.
 *
 * @example
 * ```tsx
 * const { dialogRef, isTop } = useModalBehavior({
 *   active: detailOpen,
 *   onClose: () => setDetailOpen(false),
 * })
 * ```
 */
export function useModalBehavior(opts: {
  /** Whether the overlay is currently open. Drives activation/deactivation. */
  active: boolean;
  /** Called when the behaviour requests close (Escape while topmost). */
  onClose: () => void;
  /** Element to receive initial focus on activation (default: first focusable). */
  initialFocus?: HTMLElement | null;
  /**
   * Identity of the content currently hosted inside the dialog. When it
   * changes while `active` (the overlay swaps windows without closing —
   * `<OverlayOutlet>` passes the mounted window's key), initial focus is
   * re-applied so focus follows the new content instead of falling to `body`
   * with the old one. Irrelevant for a root whose content never swaps.
   */
  contentKey?: string | number | null;
}): { dialogRef: RefObject<HTMLElement | null>; isTop: boolean } {
  const dialogRef = useRef<HTMLElement | null>(null);
  const ticketRef = useRef<OverlayStackTicket | null>(null);

  // Latest-ref pattern: the activation effect must not re-run (and re-stack
  // the overlay) because a caller passed an inline onClose/initialFocus.
  const onCloseRef = useRef(opts.onClose);
  onCloseRef.current = opts.onClose;
  const initialFocusRef = useRef(opts.initialFocus);
  initialFocusRef.current = opts.initialFocus;

  // Re-render on stack changes and re-read `isTop` during render. Deliberately
  // NOT useSyncExternalStore: `sharedOverlayStack.push()` notifies
  // synchronously *before* the activation effect below can assign `ticketRef`,
  // so an eager snapshot read at notify time would see a stale null and settle
  // on `false`. A version bump re-renders instead, and the render-time read
  // happens after the ticket is assigned. The explicit bump after assignment
  // covers this instance's own push; the subscription covers everyone else's.
  const [, bumpStackVersion] = useReducer((n: number) => n + 1, 0);
  useEffect(() => sharedOverlayStack.subscribe(bumpStackVersion), []);
  const isTop = ticketRef.current?.isTop() ?? false;

  useEffect(() => {
    if (!opts.active) return;

    const ticket = sharedOverlayStack.push();
    ticketRef.current = ticket;
    bumpStackVersion();
    const restoreFocusTo =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockBodyScroll();

    const onKeydown = (event: KeyboardEvent) => {
      if (!ticket.isTop()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        trapTabFocus(event, dialogRef.current);
      }
    };
    document.addEventListener("keydown", onKeydown, true);

    return () => {
      document.removeEventListener("keydown", onKeydown, true);
      unlockBodyScroll();
      ticketRef.current = null;
      ticket.release();
      if (restoreFocusTo?.isConnected) restoreFocusTo.focus();
    };
  }, [opts.active]);

  // Initial focus, separate from activation so it re-runs when the hosted
  // content swaps under an open overlay (contentKey change): the old window's
  // focused element unmounts and focus would otherwise fall to `body`. Runs
  // after the activation effect above (declaration order), against the DOM
  // this render committed.
  useEffect(() => {
    if (!opts.active) return;
    const target =
      initialFocusRef.current ??
      (dialogRef.current ? firstFocusableIn(dialogRef.current) : null) ??
      dialogRef.current;
    target?.focus();
  }, [opts.active, opts.contentKey]);

  return { dialogRef, isTop };
}

// ---------------------------------------------------------------------------
// The managed host
// ---------------------------------------------------------------------------

/** Chrome render-prop argument for {@link OverlayOutletProps.wrap}. */
export interface OverlayWrapArgs<TSubject> {
  readonly entry: OverlayEntry<TSubject>;
  readonly subject: TSubject | null;
  /** Request close (the same request backdrop click and Escape make). */
  readonly close: () => void;
  /** Whether this overlay is currently the top of the stack. */
  readonly isTop: boolean;
  readonly children: ReactNode;
}

export interface OverlayOutletProps<TSubject> {
  /** The {@link OverlayHostHandle} from `defineOverlayHost`. */
  readonly host: OverlayHostHandle<TSubject>;
  /** The active window id from app state; `null` renders `empty` (or nothing). */
  readonly activeId: string | null | undefined;
  /**
   * The value threaded to the window as a `subject` prop **and** via context
   * ({@link useOverlaySubject}); may be `null` (selection is by id).
   */
  readonly subject?: TSubject | null;
  /**
   * Optional discriminator folded into the mounted window's React key so
   * switching subjects remounts window content rather than reusing a stale
   * instance — the `<PanelsOutlet>` `subjectKey` contract.
   */
  readonly subjectKey?: string | ((subject: TSubject | null) => string | number);
  /** Duplicate-id stance forwarded to `resolveOverlay` (default: throw). */
  readonly onDuplicate?: OnDuplicateComponentId;
  /** Called when the host requests close (backdrop click, Escape while topmost). */
  readonly onClose?: () => void;
  /** Portal target (default `document.body`). */
  readonly to?: Element | null;
  /** Render in place instead of portaling (tests, inline embedding). */
  readonly portalDisabled?: boolean;
  /**
   * Request close when a press starts **and** releases on the backdrop itself
   * (default `true`). A press that starts inside the dialog and slips onto the
   * backdrop — a text selection, a missed drag — is not a close request.
   */
  readonly closeOnBackdrop?: boolean;
  /** The app's styling for the two host-rendered elements. Headless otherwise. */
  readonly backdropClassName?: string;
  readonly panelClassName?: string;
  /** Rendered (in place, not portaled) when no window is active. */
  readonly empty?: ReactNode;
  /**
   * The app's chrome around the window body, rendered inside the dialog
   * element; receives `{ entry, subject, close, isTop, children }` and must
   * render `children` somewhere. Header, icon (from `entry.meta`), close
   * button — all live here.
   */
  readonly wrap?: (args: OverlayWrapArgs<TSubject>) => ReactNode;
}

/**
 * Render the one active overlay of a host inside a framework-managed modal
 * shell: portaled (default `document.body`), backdrop click-self → `onClose`,
 * focus trap + focus return, body scroll lock, shared-stack registration
 * (Escape closes the top overlay first), `role="dialog"` / `aria-modal` /
 * `aria-label` (from the entry's `title`, resolved against the subject).
 *
 * The backdrop and dialog carry stable, namespaced hooks for e2e suites:
 * `data-modular-overlay-backdrop`, `data-modular-overlay-panel`, and
 * `data-overlay-id="<entry.id>"`.
 *
 * **The host never closes itself** — state stays app-owned; clear the active
 * id in `onClose`. A dangling active id renders nothing and dev-warns (the
 * `pairById` "missing" stance). The window body renders inside
 * `ModuleErrorBoundary` (label `"Overlay"`).
 *
 * @example
 * ```tsx
 * <OverlayOutlet
 *   host={resultViews}
 *   activeId={ui.resultView?.view ?? null}
 *   subject={selectedStep}
 *   onClose={() => ui.closeResultView()}
 *   backdropClassName="app-backdrop"
 *   panelClassName="app-dialog"
 *   wrap={({ entry, close, children }) => (
 *     <ResultWindowChrome entry={entry} onClose={close}>{children}</ResultWindowChrome>
 *   )}
 * />
 * ```
 */
export function OverlayOutlet<TSubject>({
  host,
  activeId,
  subject = null,
  subjectKey,
  onDuplicate,
  onClose,
  to,
  portalDisabled,
  closeOnBackdrop = true,
  backdropClassName,
  panelClassName,
  empty,
  wrap,
}: OverlayOutletProps<TSubject>): ReactNode {
  const entry = useOverlay(host, activeId, onDuplicate ? { onDuplicate } : undefined);

  const key =
    entry === null
      ? null
      : subjectKey === undefined
        ? entry.id
        : `${entry.id}:${typeof subjectKey === "function" ? subjectKey(subject) : subjectKey}`;

  const close = useCallback(() => onClose?.(), [onClose]);
  const { dialogRef, isTop } = useModalBehavior({
    active: entry !== null,
    onClose: close,
    contentKey: key,
  });

  // A press that starts inside the dialog (text selection, a slipped drag) and
  // releases over the backdrop still fires `click` on the backdrop — that is
  // not a close request. Close only when the press both started and ended on
  // the backdrop itself.
  const pressStartedInsidePanelRef = useRef(false);

  const dangling = activeId != null && entry === null ? activeId : null;
  useEffect(() => {
    if (isDevEnv() && dangling !== null) {
      // A dangling active id is data, not a crash (the id may name a window
      // another deployment ships) — but it is worth a loud dev breadcrumb.
      console.warn(
        `[@modular-react/react] OverlayOutlet: active id "${dangling}" matches no registered ` +
          `overlay in slot "${host.slotKey}". Rendering nothing. Register a window under that ` +
          `id (module slots) or clear the id.`,
      );
    }
  }, [dangling, host.slotKey]);

  if (entry === null) return empty ?? null;

  const Component = entry.component as ComponentType<Record<string, unknown>>;
  const content = <Component {...entry.props} subject={subject} />;
  const inner = wrap ? wrap({ entry, subject, close, isTop, children: content }) : content;

  const shell = (
    <OverlaySubjectContext value={subject}>
      <div
        className={backdropClassName}
        data-modular-overlay-backdrop=""
        data-overlay-id={entry.id}
        onPointerDown={(event) => {
          pressStartedInsidePanelRef.current = event.target !== event.currentTarget;
        }}
        onClick={(event) => {
          const pressStartedInsidePanel = pressStartedInsidePanelRef.current;
          pressStartedInsidePanelRef.current = false;
          if (closeOnBackdrop && event.target === event.currentTarget && !pressStartedInsidePanel) {
            close();
          }
        }}
      >
        <div
          ref={dialogRef as RefObject<HTMLDivElement | null>}
          role="dialog"
          aria-modal="true"
          aria-label={resolveOverlayTitle(entry, subject)}
          tabIndex={-1}
          className={panelClassName}
          data-modular-overlay-panel=""
        >
          <ModuleErrorBoundary key={key} moduleId={entry.id} label="Overlay">
            {inner}
          </ModuleErrorBoundary>
        </div>
      </div>
    </OverlaySubjectContext>
  );

  if (portalDisabled) return shell;
  // Client-only resolution of the default target; on the server the outlet
  // renders nothing (the modal is interaction-driven state).
  const target = to ?? (typeof document !== "undefined" ? document.body : null);
  return target ? createPortal(shell, target) : null;
}
