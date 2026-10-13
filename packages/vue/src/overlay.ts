import {
  Teleport,
  computed,
  defineComponent,
  getCurrentScope,
  h,
  inject,
  nextTick,
  onBeforeUnmount,
  onScopeDispose,
  provide,
  ref,
  shallowRef,
  toValue,
  watch,
  watchPostEffect,
  type Component,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  type PropType,
  type Ref,
  type ShallowRef,
  type VNode,
} from "vue";
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
} from "@modular-frontend/core";
import { injectSlotsSource } from "./panels.js";
import { ModuleErrorBoundary } from "./error-boundary.js";

/**
 * Vue host for the framework-neutral **state-keyed overlay** primitive (see
 * `resolveOverlay` / `defineOverlayHost` in `@modular-frontend/core`). An
 * overlay host is a named surface whose module-contributed windows are selected
 * by a caller-supplied **active id** — exactly one open at a time — and mounted
 * inside a framework-managed modal shell: teleported, backdrop-closed,
 * focus-trapped with focus return, scroll-locked, stack-registered, a11y-wired.
 * The pick-one, modal sibling of the render-all, inline `<PanelsOutlet>`.
 *
 * The host is **headless**: it renders exactly the two elements the behaviour
 * must own (backdrop, dialog panel), styleable via `backdropClass` /
 * `panelClass`; everything inside the dialog belongs to the app's `#wrap`
 * chrome. State stays app-owned — the host *requests* close (backdrop click,
 * Escape) by emitting `close`; the app clears the active id.
 *
 * ## Reactivity caveat
 *
 * The active entry recomputes when `activeId` changes — pass it from reactive
 * state (a Pinia computed, a ref) exactly as `usePanels` documents for its
 * subject; a non-reactive snapshot tracks nothing. Contributions track both
 * runtime slot sources, so windows contributed through `dynamicSlots` appear on
 * either update path (see `injectSlotsSource` in `panels.ts`).
 */

/**
 * Injection key holding the current overlay subject, provided by
 * {@link OverlayOutlet} so the active window (and its descendants) can read the
 * subject without prop-drilling. Held as a `ComputedRef` so reads stay reactive
 * to subject changes.
 */
export const overlaySubjectKey: InjectionKey<ComputedRef<unknown>> = Symbol(
  "modular-vue.overlaySubject",
);

/**
 * Read the subject of the enclosing {@link OverlayOutlet}. Reactive — the
 * returned `computed` updates when the outlet's subject changes. May hold
 * `null`: overlay selection is by id, and a window that keys on its own store
 * can be open with no subject. Throws when called outside an `<OverlayOutlet>`
 * so a missing host is a loud error, not a silently-undefined subject.
 *
 * @example
 * ```ts
 * const step = useOverlaySubject<StepRef | null>()
 * const label = computed(() => (step.value ? `Step ${step.value.stepIndex}` : ""))
 * ```
 */
export function useOverlaySubject<TSubject>(): ComputedRef<TSubject | null> {
  const subject = inject(overlaySubjectKey, null);
  if (!subject) {
    throw new Error(
      "[@modular-vue/vue] useOverlaySubject must be used inside an <OverlayOutlet> " +
        "(the outlet provides the current overlay subject).",
    );
  }
  return subject as ComputedRef<TSubject | null>;
}

/**
 * Resolve an overlay host against an active id as a reactive `computed`.
 *
 * Every input is a `MaybeRefOrGetter`, resolved *inside* the `computed` so it
 * is live: pass `activeId` as a ref/getter over reactive state (a ui-store
 * computed) so the active entry re-resolves when the selection changes. The
 * pure `resolveOverlay` recomputes on the slot contributions, the id, or the
 * duplicate stance changing.
 *
 * @example
 * ```ts
 * const active = useOverlay(resultViews, () => ui.resultView?.view ?? null)
 * // active.value → the one active OverlayEntry, or null
 * ```
 */
export function useOverlay<TSubject>(
  host: MaybeRefOrGetter<OverlayHostHandle<TSubject>>,
  activeId: MaybeRefOrGetter<string | null | undefined>,
  opts?: { onDuplicate?: MaybeRefOrGetter<OnDuplicateComponentId | undefined> },
): ComputedRef<OverlayEntry<TSubject> | null> {
  const readSlots = injectSlotsSource("useOverlay");
  return computed(() =>
    resolveOverlay(
      (readSlots()[toValue(host).slotKey] ?? []) as readonly OverlayEntry<TSubject>[],
      toValue(activeId),
      { onDuplicate: toValue(opts?.onDuplicate) },
    ),
  );
}

// ---------------------------------------------------------------------------
// Managed modal behaviour
// ---------------------------------------------------------------------------

// The stack instance, scroll lock, and focus semantics live in the engine
// (`sharedOverlayStack`, `lockBodyScroll` / `unlockBodyScroll`,
// `firstFocusableIn` / `trapTabFocus`) — one implementation shared with the
// React binding so the behaviour cannot drift. This module contributes only
// the Vue glue: watchers, refs, and reactivity.

// Reactive mirror of stack changes so per-instance `isTop` computeds re-read.
const stackVersion = ref(0);
sharedOverlayStack.subscribe(() => {
  stackVersion.value++;
});

/**
 * Hold a ticket on {@link sharedOverlayStack} while `active`: the one
 * push/release path shared by {@link useModalBehavior} and
 * {@link useOverlayTicket}. Releases when `active` turns false, on
 * `release()`, and on scope dispose when there is a scope.
 *
 * Every push, the first one included, runs in a post-flush effect. Post-flush
 * jobs run in the order they were queued, so within one tick the owner of a
 * state change queues before the components that change mounts. An
 * already-mounted outlet that opens a window therefore pushes before an
 * overlay or a foreign layer the window mounts open. A `watch` with
 * `immediate` would not do this: its first run is synchronous in setup, during
 * the parent's render.
 */
function holdStackTicket(active: MaybeRefOrGetter<boolean>): {
  ticket: ShallowRef<OverlayStackTicket | null>;
  isTop: ComputedRef<boolean>;
  release: () => void;
} {
  // A shallowRef, not a plain variable: `push()` notifies before the
  // assignment, so a computed read during that notify must be invalidated by
  // the assignment itself, not only by the next stack change.
  const ticket = shallowRef<OverlayStackTicket | null>(null);

  const isTop = computed(() => {
    // Depend on the stack version so pushes/releases elsewhere re-evaluate.
    void stackVersion.value;
    return ticket.value?.isTop() ?? false;
  });

  // The effect reads `held`, not `ticket`, so its own assignment does not
  // re-run it.
  let held: OverlayStackTicket | null = null;
  const release = () => {
    const was = held;
    held = null;
    ticket.value = null;
    was?.release();
  };

  watchPostEffect(() => {
    if (!toValue(active)) {
      release();
      return;
    }
    // Client-only: the stack is module-level, so a server push would leak
    // across requests.
    if (held || typeof document === "undefined") return;
    held = sharedOverlayStack.push();
    ticket.value = held;
  });
  if (getCurrentScope()) onScopeDispose(release);

  return { ticket, isTop, release };
}

/**
 * The managed modal *behaviour* as a standalone composable, for a window that
 * needs a bespoke root (a full-bleed detail surface, a hand-styled shell) but
 * still wants correct, consistent behaviour instead of re-deriving it:
 *
 * - registers on the shared overlay **stack** while `active` (nested overlays
 *   layer in open order; `isTop` tells this one whether it is topmost);
 * - closes on **Escape** only when topmost (the top overlay closes first);
 * - **traps focus** inside `dialogRef` (Tab cycles; focus that escapes is
 *   pulled back) and moves initial focus in on activation — `initialFocus` if
 *   given, else the first focusable, else the dialog element itself (give it
 *   `tabindex="-1"`);
 * - **returns focus** to the previously-focused element on deactivation;
 * - **locks body scroll** while any overlay is open (shared count).
 *
 * `{@link OverlayOutlet}` uses exactly this composable internally, so a
 * bespoke root and a hosted window behave identically. All DOM work is
 * client-only; on the server this is inert.
 *
 * @example
 * ```ts
 * const { dialogRef, isTop } = useModalBehavior({
 *   active: () => ui.detailOpen,
 *   onClose: () => ui.closeDetail(),
 * })
 * ```
 */
export function useModalBehavior(opts: {
  /** Whether the overlay is currently open. Drives activation/deactivation. */
  active: MaybeRefOrGetter<boolean>;
  /** Called when the behaviour requests close (Escape while topmost). */
  onClose: () => void;
  /** Element to receive initial focus on activation (default: first focusable). */
  initialFocus?: MaybeRefOrGetter<HTMLElement | null | undefined>;
  /**
   * Identity of the content currently hosted inside the dialog. When it
   * changes while `active` (the overlay swaps windows without closing —
   * `<OverlayOutlet>` passes the mounted window's key), initial focus is
   * re-applied so focus follows the new content instead of falling to `body`
   * with the old one. Irrelevant for a root whose content never swaps.
   */
  contentKey?: MaybeRefOrGetter<string | number | null | undefined>;
}): { dialogRef: Ref<HTMLElement | null>; isTop: ComputedRef<boolean> } {
  const dialogRef = ref<HTMLElement | null>(null);
  // Created before the activation watcher below, so on the same flush the
  // ticket is released before deactivation returns focus. The first push runs
  // post-flush, after activation; until then the keydown handler stands down.
  const stack = holdStackTicket(opts.active);
  let open = false;
  let restoreFocusTo: HTMLElement | null = null;

  const onKeydown = (event: KeyboardEvent) => {
    if (!stack.ticket.value?.isTop()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      opts.onClose();
      return;
    }
    if (event.key === "Tab" && dialogRef.value) {
      trapTabFocus(event, dialogRef.value);
    }
  };

  const focusIntoDialog = () => {
    // The dialog (or its swapped-in content) renders in the same tick the
    // trigger flips; focus after the DOM settles.
    void nextTick(() => {
      if (!open) return; // deactivated before the tick settled
      const target =
        toValue(opts.initialFocus) ??
        (dialogRef.value ? firstFocusableIn(dialogRef.value) : null) ??
        dialogRef.value;
      target?.focus();
    });
  };

  const activate = () => {
    // Client-only: on the server the behaviour is inert (nothing teleports,
    // nothing focuses); the app hydrates and activates in the browser.
    if (typeof document === "undefined" || open) return;
    open = true;
    restoreFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockBodyScroll();
    document.addEventListener("keydown", onKeydown, true);
    focusIntoDialog();
  };

  const deactivate = () => {
    if (!open) return;
    open = false;
    document.removeEventListener("keydown", onKeydown, true);
    unlockBodyScroll();
    // Release before returning focus. On unmount this runs before scope
    // dispose; elsewhere the ticket watcher has already released (idempotent).
    stack.release();
    if (restoreFocusTo?.isConnected) restoreFocusTo.focus();
    restoreFocusTo = null;
  };

  watch(
    () => toValue(opts.active),
    (active) => {
      if (active) activate();
      else deactivate();
    },
    { immediate: true, flush: "post" },
  );
  // Re-apply initial focus when the hosted content swaps under an open
  // overlay: the old window's focused element unmounts and focus would
  // otherwise fall to `body`.
  watch(
    () => toValue(opts.contentKey),
    () => {
      if (open) focusIntoDialog();
    },
    { flush: "post" },
  );
  onBeforeUnmount(deactivate);

  return { dialogRef, isTop: stack.isTop };
}

/**
 * Hold a ticket on the shared overlay stack while `active`, with none of the
 * modal behaviour, for a **foreign layer** (another UI library's menu,
 * popover, select, or dialog) opened inside a hosted overlay. While the
 * ticket is top, every `useModalBehavior` below it stands down: no Escape
 * handling, no `preventDefault`, no Tab trap. The foreign layer owns its keys,
 * Tab included, so it must keep focus inside the window. Whether it does
 * depends on the widget: Radix and Reka UI menus (in modal mode) block Tab,
 * but a menu that closes on Tab, a combobox, or a non-modal popover lets focus
 * move on. Check each widget, and turn on its modal mode or focus trap, or
 * handle Tab in the app. Its library dismisses it. On release the overlay
 * below is top again.
 *
 * Pushes when `active` turns true, so tickets layer in open order, and
 * releases when it turns false and when the owning scope is disposed. A layer
 * that is already open when its host window mounts lands above that window:
 * the push runs post-flush, after the window's. Throws outside a component
 * setup or effect scope, because nothing would release the ticket. Deciding
 * *when* a foreign layer is open is app scope, because it is UI-library
 * specific; pass that state as `active`. Client-only: on the server this is
 * inert.
 *
 * @example
 * ```ts
 * const open = ref(false) // v-model:open of the dropdown
 * useOverlayTicket(open)
 * ```
 */
export function useOverlayTicket(active: MaybeRefOrGetter<boolean>): {
  isTop: ComputedRef<boolean>;
} {
  // Without a scope nothing releases the ticket when its owner goes away, and
  // a leaked ticket silently disables Escape and Tab in every hosted overlay.
  if (!getCurrentScope()) {
    throw new Error(
      "[@modular-vue/vue] useOverlayTicket must be called inside a component setup or an " +
        "effect scope (the ticket is released when that scope is disposed).",
    );
  }
  const { isTop } = holdStackTicket(active);
  return { isTop };
}

// ---------------------------------------------------------------------------
// The managed host
// ---------------------------------------------------------------------------

function keyFor(entry: OverlayEntry<unknown>, subjectKey: unknown, subject: unknown): string {
  if (subjectKey === undefined) return entry.id;
  const discriminator =
    typeof subjectKey === "function"
      ? (subjectKey as (s: unknown) => string | number)(subject)
      : (subjectKey as string | number);
  return `${entry.id}:${discriminator}`;
}

/**
 * Render the one active overlay of a host inside a framework-managed modal
 * shell: teleported (default `body`), backdrop click-self → `close`, focus
 * trap + focus return, body scroll lock, shared-stack registration (Escape
 * closes the top overlay first), `role="dialog"` / `aria-modal` /
 * `aria-label` (from the entry's `title`, resolved against the subject) or
 * `aria-labelledby` (pointed at a heading the window renders in `#wrap`).
 *
 * - `host` — the {@link OverlayHostHandle} from `defineOverlayHost`.
 * - `activeId` — the active window id from app state; `null` renders the
 *   `#empty` slot (or nothing). A dangling id (no entry registered under it)
 *   renders nothing and dev-warns — the `pairById` "missing" stance.
 * - `subject` — the value threaded to the window as a `subject` prop **and**
 *   via `provide` ({@link useOverlaySubject}); may be `null` (selection is by
 *   id). `subjectKey` folds the subject's identity into the mounted window's
 *   key so switching subjects remounts rather than reusing a stale instance —
 *   the `<PanelsOutlet>` `subjectKey` contract.
 * - `to` — teleport target (default `"body"`); `teleportDisabled` renders in
 *   place (tests, inline embedding).
 * - `closeOnBackdrop` — default `true`. Close is requested only when a press
 *   both starts and releases on the backdrop itself; a press that starts
 *   inside the dialog and slips onto the backdrop (a text selection, a missed
 *   drag) is not a close request.
 * - `backdropClass` / `panelClass` — the app's styling for the only two
 *   elements the host renders. Headless: no opinionated CSS is applied; a
 *   bare host is functional but unstyled.
 *
 * The backdrop and dialog carry stable, namespaced hooks for e2e suites:
 * `data-modular-overlay-backdrop`, `data-modular-overlay-panel`, and
 * `data-overlay-id="<entry.id>"` — no configuration, no drift.
 *
 * Emits `close` when the backdrop is clicked or Escape is pressed while
 * topmost. **The host never closes itself** — state stays app-owned; clear the
 * active id in the handler.
 *
 * Slots:
 * - `#empty` — shown (in place, not teleported) when no window is active.
 * - `#wrap` — the app's chrome around the window body, rendered inside the
 *   dialog element; receives `{ entry, subject, close, isTop, children }` and
 *   must render `children` somewhere. Header, icon (from `entry.meta`), close
 *   button, header-hosted `<PanelsOutlet>` regions — all live here.
 *
 * The window body renders inside `ModuleErrorBoundary` (label `"Overlay"`) so
 * a throwing window can't take down the shell around it.
 *
 * Authored with `defineComponent` + a render function (no SFC compiler in the
 * package build; see decision D4).
 */
export const OverlayOutlet = defineComponent({
  name: "OverlayOutlet",
  props: {
    host: { type: Object as PropType<OverlayHostHandle<unknown>>, required: true },
    activeId: { type: String as PropType<string | null>, default: null },
    // `type: null` accepts any runtime value (subject / class bindings are
    // opaque to the host). The `default` is cast to the prop's declared type so
    // `ExtractPropTypes` keeps `unknown` — an un-cast `default: null` /
    // `default: undefined` collapses the inferred `$props` type to `null` /
    // `undefined`, which makes `<OverlayOutlet :subject="…" :panel-class="…">`
    // reject real values in a typed template (vue-tsc).
    subject: { type: null as unknown as PropType<unknown>, default: null as unknown },
    subjectKey: {
      type: null as unknown as PropType<string | ((subject: unknown) => string | number)>,
      default: undefined,
    },
    onDuplicate: { type: String as PropType<OnDuplicateComponentId>, default: undefined },
    to: { type: [String, Object] as PropType<string | HTMLElement>, default: "body" },
    teleportDisabled: { type: Boolean, default: false },
    closeOnBackdrop: { type: Boolean, default: true },
    backdropClass: { type: null as unknown as PropType<unknown>, default: undefined as unknown },
    panelClass: { type: null as unknown as PropType<unknown>, default: undefined as unknown },
    // `id` of an element that names the dialog — forwarded to `aria-labelledby`.
    // Use when a window omits `title` (so no `aria-label` is set) but renders
    // its own heading in `#wrap`: point this at that heading's `id` so the modal
    // is still named for assistive tech.
    ariaLabelledby: { type: String, default: undefined },
  },
  emits: ["close"],
  setup(props, { slots, emit }) {
    // Every prop flows into useOverlay as a getter so the computed tracks it —
    // reading `props.x` here in setup would freeze its mount-time value.
    const entry = useOverlay<unknown>(
      () => props.host,
      () => props.activeId,
      { onDuplicate: () => props.onDuplicate },
    );
    const subjectRef = computed(() => (entry.value ? props.subject : null));
    provide(overlaySubjectKey, subjectRef);

    const close = () => emit("close");
    const { dialogRef, isTop } = useModalBehavior({
      active: () => entry.value !== null,
      onClose: close,
      contentKey: () => (entry.value ? keyFor(entry.value, props.subjectKey, props.subject) : null),
    });

    if (isDevEnv()) {
      // A dangling active id is data, not a crash (the id may name a window
      // another deployment ships) — but it is worth a loud dev breadcrumb.
      watch(
        () => (props.activeId != null && entry.value === null ? props.activeId : null),
        (dangling) => {
          if (dangling !== null) {
            console.warn(
              `[@modular-vue/vue] OverlayOutlet: active id "${dangling}" matches no registered ` +
                `overlay in slot "${props.host.slotKey}". Rendering nothing. Register a window ` +
                `under that id (module slots) or clear the id.`,
            );
          }
        },
        { immediate: true },
      );
    }

    // A press that starts inside the dialog (text selection, a slipped drag)
    // and releases over the backdrop still fires `click` on the backdrop —
    // that is not a close request. Close only when the press both started and
    // ended on the backdrop itself.
    let pressStartedInsidePanel = false;
    const onBackdropPointerdown = (event: PointerEvent) => {
      pressStartedInsidePanel = event.target !== event.currentTarget;
    };
    const onBackdropClick = (event: MouseEvent) => {
      const startedInsidePanel = pressStartedInsidePanel;
      pressStartedInsidePanel = false;
      if (props.closeOnBackdrop && event.target === event.currentTarget && !startedInsidePanel) {
        close();
      }
    };

    return () => {
      const active = entry.value;
      if (!active) {
        return slots.empty ? slots.empty() : null;
      }

      const body: VNode = h(active.component as Component, {
        ...active.props,
        subject: props.subject,
      });
      const inner = slots.wrap
        ? slots.wrap({
            entry: active,
            subject: props.subject,
            close,
            isTop: isTop.value,
            children: body,
          })
        : body;

      return h(Teleport, { to: props.to, disabled: props.teleportDisabled }, [
        h(
          "div",
          {
            class: props.backdropClass,
            "data-modular-overlay-backdrop": "",
            "data-overlay-id": active.id,
            onPointerdown: onBackdropPointerdown,
            onClick: onBackdropClick,
          },
          [
            h(
              "div",
              {
                ref: dialogRef,
                role: "dialog",
                "aria-modal": "true",
                "aria-label": resolveOverlayTitle(active, props.subject),
                "aria-labelledby": props.ariaLabelledby,
                tabindex: -1,
                class: props.panelClass,
                "data-modular-overlay-panel": "",
              },
              [
                h(
                  ModuleErrorBoundary,
                  {
                    key: keyFor(active, props.subjectKey, props.subject),
                    moduleId: active.id,
                    label: "Overlay",
                  },
                  () => inner,
                ),
              ],
            ),
          ],
        ),
      ]);
    };
  },
});
