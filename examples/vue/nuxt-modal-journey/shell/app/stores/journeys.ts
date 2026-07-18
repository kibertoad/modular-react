import { defineStore } from "pinia";
import type { SerializedJourney } from "@modular-vue/journeys";
import type { SetupWizardState } from "@example-vue-nuxt-modal/setup-wizard-journey";

/**
 * Backing store for `createPiniaJourneyPersistence`. In-flight journeys live
 * here, keyed by `keyFor(...)`, so they participate in Pinia devtools and a
 * single `$reset()` clears every persisted journey. Closing and reopening the
 * modal for the same frame resumes the stored instance instead of starting a
 * fresh one.
 */
export const useJourneysStore = defineStore("journeys", {
  state: () => ({
    journeys: {} as Record<string, SerializedJourney<SetupWizardState>>,
  }),
});
