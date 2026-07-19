import { defineOverlayHost } from "@modular-react/core";

/**
 * The **subject** the overlay host threads to the active window: a reference to
 * one step of an agent run. Selection is by **id** (which window is open lives
 * in app state), so the subject is payload only — the active window reads it to
 * render its body; it never selects the window. It may be `null` while a window
 * is open (a window that keys on its own store simply ignores it).
 */
export interface StepRef {
  readonly instanceId: string;
  readonly stepIndex: number;
  readonly label: string;
}

/**
 * App **presentation** metadata carried opaquely on each window entry. `title`
 * is behaviour (the host resolves it to the dialog's `aria-label`); everything
 * only *your* chrome renders — an icon, a width variant — belongs here in
 * `meta`, which the framework never interprets. The shell's `wrap` chrome reads
 * these to draw the header and size the dialog.
 */
export interface WindowMeta {
  readonly icon: string;
  readonly width?: "normal" | "wide";
}

/**
 * The shared overlay-host handle. Exported once and imported at both the host
 * (`shell`, which mounts one `<OverlayOutlet host={resultViews} …>`) and every
 * contributor (the window modules), so the `StepRef` subject type is stated in
 * exactly one place. Its only runtime field is the slot key modules contribute
 * their windows under; the subject type rides along as a phantom so
 * `title(subject)` and `useOverlaySubject()` type-check end to end.
 */
export const resultViews = defineOverlayHost<StepRef>("resultViews");
