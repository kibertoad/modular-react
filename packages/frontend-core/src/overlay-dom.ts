/**
 * Client-only DOM behaviour shared by the bindings' overlay hosts — the single
 * implementation of the modal behaviour *semantics* that must not drift
 * between React and Vue (the `collapseEntriesById` argument, applied to focus
 * and scroll): which elements count as focusable, how Tab wraps at the
 * dialog's edges, how the body scroll lock is counted, and the one app-wide
 * {@link sharedOverlayStack} every overlay registers on.
 *
 * The engine's resolver surface (`overlay.ts`) stays pure — this module is the
 * deliberate exception, and it holds a narrow line:
 *
 * - **No DOM at module scope.** Everything here is a function a binding calls
 *   from client-side effects/watchers; each entry point no-ops without a
 *   `document`, so importing this module is SSR-safe.
 * - **No event registration, no reactivity.** Listening for keydowns, wiring
 *   refs, and re-rendering on stack changes is the per-binding glue; this
 *   module only answers "what should happen".
 *
 * Consumed by `useModalBehavior` in `@modular-react/react` and
 * `@modular-vue/vue`; apps normally never touch these directly.
 */

import { createOverlayStack, type OverlayStack } from "./overlay.js";

/**
 * The one app-wide overlay stack. Both bindings' `useModalBehavior` (and
 * therefore both `<OverlayOutlet>` hosts) register on this instance, so every
 * overlay in an app — outlet-hosted or bespoke — shares one ordering and
 * "Escape closes the top first" holds across all of them. It lives in the
 * engine (a shared peer dependency, so exactly one copy exists) rather than in
 * a binding, so the ordering even survives a mixed-binding app — e.g. a
 * migration running React and Vue surfaces side by side.
 *
 * Use {@link createOverlayStack} instead for an isolated stack (tests, a
 * coordination scope deliberately separate from the app's overlays).
 */
export const sharedOverlayStack: OverlayStack = createOverlayStack();

// One body-overflow save/restore across however many overlays are open,
// whichever binding, host, or composable opened them.
let scrollLockCount = 0;
let prevBodyOverflow = "";

/**
 * Lock body scroll (counted): the first lock saves `body.style.overflow` and
 * sets it to `hidden`; further locks only increment. No-op without a
 * `document`. Pair every call with {@link unlockBodyScroll}.
 */
export function lockBodyScroll(): void {
  if (typeof document === "undefined") return;
  if (scrollLockCount++ === 0) {
    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

/**
 * Release one {@link lockBodyScroll}; the last release restores the saved
 * `body.style.overflow`. Safe to call when nothing is locked (no-op).
 */
export function unlockBodyScroll(): void {
  if (typeof document === "undefined") return;
  if (scrollLockCount > 0 && --scrollLockCount === 0) {
    document.body.style.overflow = prevBodyOverflow;
  }
}

// What the behaviour treats as focusable. Deliberately structural (attributes
// only): it does not chase the rendered-visibility long tail (visibility:
// hidden, display: none in a parent, zero-size) — see the "conscious
// constraints" section of docs/overlay-host.md.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * The first focusable element inside `root` (the behaviour's initial-focus
 * default), or `null` when the dialog has no focusable content — callers then
 * focus `root` itself (which is why the hosts render the panel with
 * `tabindex="-1"`).
 */
export function firstFocusableIn(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
}

/**
 * Tab-cycle containment for a Tab/Shift+Tab `keydown`: wrap focus at the
 * dialog's edges; if focus escaped the dialog (or the dialog has no focusable
 * content), pull it back in. The caller is responsible for only invoking this
 * for the top-of-stack overlay.
 */
export function trapTabFocus(event: KeyboardEvent, root: HTMLElement): void {
  const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (focusables.length === 0) {
    event.preventDefault();
    root.focus();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && root.contains(active);
  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (!inside || active === last) {
    event.preventDefault();
    first.focus();
  }
}
