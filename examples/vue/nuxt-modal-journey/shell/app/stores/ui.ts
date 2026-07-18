import { defineStore } from "pinia";

/**
 * Pure UI state: whether the wizard modal is open, which frame it targets, and
 * the id of the running journey instance. The journey is opened/closed purely
 * by this boolean — no route navigation (the modal-hosted, no-URL shape).
 *
 * `instanceId` is the running journey. It is *not* torn down when the modal
 * closes: a keep-alive subscription (see `JourneyKeepAlive.vue`) holds a
 * listener so the outlet's abandon-on-unmount is skipped, which is what makes
 * close → reopen → resume work in-session.
 */
export const useUiStore = defineStore("ui", {
  state: () => ({
    isOpen: false,
    frameId: "A",
    instanceId: null as string | null,
  }),
  actions: {
    close() {
      this.isOpen = false;
    },
    finish() {
      this.isOpen = false;
      this.instanceId = null;
    },
  },
});
