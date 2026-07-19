import { defineModule } from "@modular-vue/core";
import type { AppDependencies, AppSlots } from "@example-vue-overlay-windows/app-shared";
import SecurityReportWindow from "./SecurityReportWindow.vue";

/**
 * A **consumer** module — the kind a downstream deployment ships. It contributes
 * its own window (`acme:security-report`) to the `resultViews` host that the
 * first-party `run-core` module knows nothing about, with **no edit to the host
 * and no framework change**: the window flows in through the same `slots` path
 * every module uses, and inherits the full managed-modal behaviour contract
 * (teleport, focus trap, Escape, scroll lock, a11y) for free.
 *
 * Its id is namespaced (`acme:security-report`) so it can never collide with a
 * first-party window id — the overlay resolver's duplicate-id check would
 * otherwise throw. This is the open-contribution property the overlay host
 * exists to provide.
 */
export default defineModule<AppDependencies, AppSlots>({
  id: "acme-extras",
  version: "1.0.0",
  slots: {
    resultViews: [
      {
        id: "acme:security-report",
        component: SecurityReportWindow,
        title: "Security report",
        meta: { icon: "🛡️", width: "normal" },
      },
    ],
  },
});
