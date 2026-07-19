import { defineModule } from "@modular-vue/core";
import type { AppDependencies, AppSlots, StepRef } from "@example-vue-overlay-windows/app-shared";
import TestReportWindow from "./TestReportWindow.vue";
import RunLogsWindow from "./RunLogsWindow.vue";

/**
 * First-party window module. Contributes two windows to the `resultViews`
 * overlay host through the ordinary `slots` path — the overlay host adds no new
 * registration seam (`OverlayEntry` is a superset of `ComponentEntry`). Neither
 * window carries any teleport / backdrop / Escape / focus code; the managed
 * shell owns all of it. A window is just a body plus presentation metadata.
 *
 * - `test-report` — a dynamic `title(step)` (→ the dialog's `aria-label`) and a
 *   nested `useModalBehavior` confirm inside its body (the shared-stack demo).
 * - `run-logs` — reads the subject through `useOverlaySubject`.
 */
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
