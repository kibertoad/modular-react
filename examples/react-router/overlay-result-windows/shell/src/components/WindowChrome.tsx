import { resolveOverlayTitle } from "@modular-react/core";
import type { OverlayWrapArgs } from "@modular-react/react";
import type { StepRef, WindowMeta } from "@example-rr-overlay-windows/app-shared";

/** A window the header switcher can jump to without closing the overlay. */
export interface SwitchTarget {
  readonly id: string;
  readonly label: string;
}

/**
 * The app's chrome around a window body — the whole of the `wrap` render-prop.
 * The headless host renders only the backdrop and the dialog panel; everything
 * *inside* the dialog (header, icon, title, switcher, close button) is drawn
 * here, from the design system. Icon comes from the opaque `entry.meta`; the
 * title text is `resolveOverlayTitle(entry, subject)` — the same value the host
 * wired to the dialog's `aria-label`, resolved against the current subject.
 *
 * The switcher jumps between windows **without closing** (it sets the active id
 * to a sibling). It lives inside the dialog on purpose: while a window is open
 * the backdrop covers the page behind it, so a swap control belongs in the
 * chrome — and the shell re-applies focus to the swapped-in content.
 *
 * `close` requests close (the same request backdrop-click and Escape make); the
 * shell never closes itself, so this just calls back into app state.
 */
export function WindowChrome({
  entry,
  subject,
  close,
  children,
  targets,
  onSwitch,
}: OverlayWrapArgs<StepRef> & {
  readonly targets: readonly SwitchTarget[];
  readonly onSwitch: (id: string) => void;
}) {
  const meta = entry.meta as WindowMeta | undefined;
  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.875rem 1.25rem",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <span data-testid="overlay-icon" aria-hidden style={{ fontSize: "1.1rem" }}>
          {meta?.icon}
        </span>
        <h2 data-testid="overlay-title" style={{ margin: 0, fontSize: "1.05rem", flex: 1 }}>
          {resolveOverlayTitle(entry, subject)}
        </h2>
        <button
          type="button"
          data-testid="overlay-close"
          onClick={close}
          aria-label="Close"
          style={{
            border: "none",
            background: "transparent",
            fontSize: "1.1rem",
            cursor: "pointer",
            lineHeight: 1,
            padding: "0.25rem 0.5rem",
          }}
        >
          ✕
        </button>
      </header>

      <nav
        aria-label="Switch window"
        style={{
          display: "flex",
          gap: "0.375rem",
          padding: "0.5rem 1.25rem",
          borderBottom: "1px solid #edf2f7",
          background: "#f8fafc",
        }}
      >
        {targets.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`switch-${t.id}`}
            aria-current={t.id === entry.id}
            disabled={t.id === entry.id}
            onClick={() => onSwitch(t.id)}
            style={{
              padding: "0.2rem 0.6rem",
              borderRadius: 5,
              border: "1px solid #cbd5e0",
              background: t.id === entry.id ? "#e2e8f0" : "#fff",
              cursor: t.id === entry.id ? "default" : "pointer",
              font: "inherit",
              fontSize: "0.8125rem",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: "1rem 1.25rem" }}>{children}</div>
    </div>
  );
}
