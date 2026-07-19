import { useState } from "react";
import { createPortal } from "react-dom";
import { defineModule } from "@react-router-modules/core";
import { useModalBehavior, useOverlaySubject } from "@modular-react/react";
import type { AppDependencies, AppSlots, StepRef } from "@example-rr-overlay-windows/app-shared";

/**
 * First-party window module. Contributes two windows to the `resultViews`
 * overlay host through the ordinary `slots` path — the overlay host adds no new
 * registration seam (`OverlayEntry` is a superset of `ComponentEntry`). Neither
 * window carries any `<dialog>`/portal/backdrop/Escape/focus code: the managed
 * shell owns all of that. A window is just a body plus presentation metadata.
 *
 * - `test-report` — a dynamic `title(step)` (→ the dialog's `aria-label`) and,
 *   inside its body, a **nested bespoke overlay** built on `useModalBehavior`.
 *   That confirm dialog registers on the same shared stack as the hosted
 *   window, so Escape closes the **top** one first (the confirm), then the
 *   window — the stacking guarantee, demonstrated with the composable the
 *   `<OverlayOutlet>` is itself built on.
 * - `run-logs` — reads the subject through `useOverlaySubject`, the context
 *   reader that reaches the current step without prop-drilling.
 */

/** Reads the subject from the injected `subject` prop; hosts a nested confirm. */
function TestReportWindow({ subject }: { subject: StepRef | null }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // A bespoke overlay (its own hand-styled root) that still behaves like a
  // first-class modal because it shares the one overlay stack: Escape closes it
  // before the window beneath it, and its own focus trap / focus return / scroll
  // lock coordinate with the hosted window's.
  const { dialogRef } = useModalBehavior({
    active: confirmOpen,
    onClose: () => setConfirmOpen(false),
  });

  return (
    <div data-testid="window-body-test-report">
      <p style={{ marginTop: 0 }}>
        <strong>{subject?.label ?? "Unknown step"}</strong> passed — 42 assertions, 0 failed.
      </p>
      <button type="button" data-testid="open-confirm" onClick={() => setConfirmOpen(true)}>
        Discard this run…
      </button>

      {confirmOpen &&
        createPortal(
          <div
            data-testid="confirm-backdrop"
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(15, 23, 42, 0.6)",
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) setConfirmOpen(false);
            }}
          >
            <div
              ref={dialogRef as React.RefObject<HTMLDivElement | null>}
              role="dialog"
              aria-modal="true"
              aria-label="Discard run?"
              tabIndex={-1}
              data-testid="confirm-dialog"
              style={{
                background: "#fff",
                borderRadius: 8,
                padding: "1rem 1.25rem",
                maxWidth: 320,
                boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
              }}
            >
              <p style={{ marginTop: 0 }}>Discard this run? This can't be undone.</p>
              <button
                type="button"
                data-testid="confirm-cancel"
                onClick={() => setConfirmOpen(false)}
              >
                Keep it
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Reads the subject from context via `useOverlaySubject` — no prop-drilling. */
function RunLogsWindow() {
  const step = useOverlaySubject<StepRef>();
  return (
    <div data-testid="window-body-run-logs">
      <pre
        style={{
          margin: 0,
          padding: "0.75rem",
          background: "#0f172a",
          color: "#e2e8f0",
          borderRadius: 6,
          fontSize: "0.8125rem",
          overflowX: "auto",
        }}
      >
        {`[step ${step?.stepIndex ?? "?"}] ${step?.label ?? ""}\n> resolving modules… ok\n> mounting shell… ok\n> exit 0`}
      </pre>
    </div>
  );
}

export default defineModule<AppDependencies, AppSlots>({
  id: "run-core",
  version: "1.0.0",
  slots: {
    resultViews: [
      {
        id: "test-report",
        component: TestReportWindow,
        title: (step: StepRef | null) =>
          step ? `Test report — step ${step.stepIndex}` : "Test report",
        meta: { icon: "🧪", width: "wide" },
      },
      {
        id: "run-logs",
        component: RunLogsWindow,
        title: "Run logs",
        meta: { icon: "📜", width: "normal" },
      },
    ],
  },
});
