import { createWebStoragePersistence } from "@modular-react/journeys";
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
 * `createWebStoragePersistence` handles SSR guards, JSON parse errors, and
 * lazy `Storage` resolution — see `@modular-react/journeys`.
 */
export const journeyPersistence = createWebStoragePersistence<OnboardingInput, OnboardingState>({
  keyFor: ({ journeyId, input }) => `journey:${input.customerId}:${journeyId}`,
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
