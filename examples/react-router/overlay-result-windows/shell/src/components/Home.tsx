import { useState } from "react";
import { OverlayOutlet, useOverlay } from "@modular-react/react";
import { resultViews, type StepRef, type WindowMeta } from "@example-rr-overlay-windows/app-shared";
import { WindowChrome, type SwitchTarget } from "./WindowChrome.js";

/**
 * The host. Two pieces of local app state drive everything:
 *
 * - `activeView` — the **id** of the open window, or `null` for closed. This is
 *   the whole selection: the overlay host is pick-one, keyed by app state, not
 *   by route. The buttons set it; `onClose` (backdrop / Escape / the chrome's ✕)
 *   clears it. The host never closes itself.
 * - `stepIndex` — which run step is selected; the resolved `StepRef` is the
 *   **subject** threaded to the active window (as a prop and via context).
 *
 * `<OverlayOutlet>` reads the host's windows from the slots context, mounts the
 * one whose id equals `activeId` inside the managed modal shell, and hands its
 * body to `wrap`. The shell itself never branches on window id — adding a window
 * is a new *module*, not an edit here. `useOverlay` is called alongside the
 * outlet purely to size the dialog from the active window's `meta.width`.
 */

const STEPS: readonly StepRef[] = [
  { instanceId: "run-1", stepIndex: 0, label: "Install dependencies" },
  { instanceId: "run-1", stepIndex: 1, label: "Typecheck" },
  { instanceId: "run-1", stepIndex: 2, label: "Unit tests" },
];

const OPENERS: readonly { id: string; label: string; testId: string }[] = [
  { id: "test-report", label: "🧪 Test report", testId: "open-test-report" },
  { id: "run-logs", label: "📜 Run logs", testId: "open-run-logs" },
  { id: "acme:security-report", label: "🛡️ Security report", testId: "open-security-report" },
  // A window id no installed module provides — data, not a crash: the host
  // renders nothing and dev-warns rather than throwing.
  { id: "does-not-exist", label: "👻 Dangling id", testId: "open-dangling" },
];

// The real windows the in-dialog switcher can jump between (the dangling id is
// an opener only, never a switch target).
const SWITCH_TARGETS: readonly SwitchTarget[] = [
  { id: "test-report", label: "🧪 Report" },
  { id: "run-logs", label: "📜 Logs" },
  { id: "acme:security-report", label: "🛡️ Security" },
];

export function Home() {
  const [activeView, setActiveView] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const selectedStep = STEPS[stepIndex] ?? null;

  // Called alongside the outlet only to read the active window's presentation
  // metadata (its width variant) so the shell can size the dialog. The outlet
  // resolves the same entry internally to mount it.
  const active = useOverlay(resultViews, activeView);
  const width = (active?.meta as WindowMeta | undefined)?.width ?? "normal";

  return (
    <div style={{ padding: "1rem 1.5rem", display: "grid", gap: "1rem" }}>
      <section>
        <h2 style={{ margin: "0 0 0.25rem" }}>Agent run — {selectedStep?.instanceId}</h2>
        <p style={{ color: "#718096", margin: 0, fontSize: "0.9rem" }}>
          Select a step, then open a result window. Exactly one window is open at a time; which one
          is app state. Backdrop click, <kbd>Esc</kbd>, or the ✕ closes it.
        </p>
      </section>

      <section>
        <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>Steps (the subject)</h3>
        <div role="listbox" aria-label="Run steps" style={{ display: "flex", gap: "0.5rem" }}>
          {STEPS.map((s) => (
            <button
              key={s.stepIndex}
              type="button"
              role="option"
              data-testid={`step-${s.stepIndex}`}
              aria-selected={stepIndex === s.stepIndex}
              onClick={() => setStepIndex(s.stepIndex)}
              style={{
                padding: "0.4rem 0.75rem",
                borderRadius: 6,
                border: stepIndex === s.stepIndex ? "2px solid #3182ce" : "1px solid #cbd5e0",
                background: stepIndex === s.stepIndex ? "#ebf8ff" : "#fff",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {s.stepIndex}. {s.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>Open a window</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {OPENERS.map((o) => (
            <button
              key={o.id}
              type="button"
              data-testid={o.testId}
              aria-pressed={activeView === o.id}
              onClick={() => setActiveView(o.id)}
              style={{
                padding: "0.4rem 0.75rem",
                borderRadius: 6,
                border: activeView === o.id ? "2px solid #3182ce" : "1px solid #cbd5e0",
                background: "#fff",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      <OverlayOutlet
        host={resultViews}
        activeId={activeView}
        subject={selectedStep}
        // Fold the step identity into the window's key so switching steps
        // remounts the window body instead of reusing a stale instance.
        subjectKey={(s) => (s ? `${s.instanceId}:${s.stepIndex}` : "none")}
        onClose={() => setActiveView(null)}
        backdropClassName="ovl-backdrop"
        panelClassName={width === "wide" ? "ovl-panel ovl-panel--wide" : "ovl-panel"}
        empty={
          <p data-testid="overlay-closed" style={{ color: "#a0aec0", fontSize: "0.85rem" }}>
            No window open.
          </p>
        }
        wrap={(args) => (
          <WindowChrome {...args} targets={SWITCH_TARGETS} onSwitch={setActiveView} />
        )}
      />

      {/* Headless host → the app supplies every pixel. These two classes are the
          whole visual contract: the backdrop must position:fixed to overlay,
          the panel is the design system's dialog card. */}
      <style>{`
        .ovl-backdrop {
          position: fixed; inset: 0; z-index: 50;
          display: flex; align-items: flex-start; justify-content: center;
          padding-top: 8vh;
          background: rgba(15, 23, 42, 0.7);
        }
        .ovl-panel {
          width: 100%; max-width: 32rem;
          background: #fff; border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
          outline: none;
        }
        .ovl-panel--wide { max-width: 48rem; }
      `}</style>
    </div>
  );
}
