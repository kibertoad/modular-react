import { defineJourneyPersistence } from "@modular-react/journeys";
import type { SerializedJourney } from "@modular-react/journeys";
import type {
  OnboardingInput,
  OnboardingState,
} from "@example-onboarding/customer-onboarding-journey";

/**
 * localStorage-backed journey persistence. One key per customer-per-journey:
 * starting a journey for the same customer twice resumes instead of minting a
 * fresh instance (see `JourneyRuntime.start` idempotency semantics).
 *
 * `load` is synchronous here; the runtime transitions the instance straight
 * from `loading` to `active` on the same tick, which keeps the demo simple.
 *
 * `defineJourneyPersistence` ties the adapter's `keyFor` input to the
 * journey's `OnboardingInput` type, so the `customerId` cast below is
 * unnecessary elsewhere — the shell is typed against the journey end-to-end.
 */
export const journeyPersistence = defineJourneyPersistence<OnboardingInput, OnboardingState>({
  keyFor: ({ journeyId, input }) => `journey:${input.customerId}:${journeyId}`,

  load: (key: string): SerializedJourney<OnboardingState> | null => {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SerializedJourney<OnboardingState>;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  },

  save: (key: string, blob: SerializedJourney<OnboardingState>): void => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(blob));
  },

  remove: (key: string): void => {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  },
});

/**
 * Probe storage for a persisted active journey without starting one. Used by
 * the Home page to show "Resume" vs "Start" affordances before the user
 * commits to opening a tab.
 */
export function hasPersistedJourney(journeyId: string, customerId: string): boolean {
  if (typeof localStorage === "undefined") return false;
  const key = journeyPersistence.keyFor({ journeyId, input: { customerId } });
  const raw = localStorage.getItem(key);
  if (!raw) return false;
  try {
    const blob = JSON.parse(raw) as SerializedJourney;
    return blob.status === "active";
  } catch {
    return false;
  }
}
