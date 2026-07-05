// Public surface of @modular-react/journeys/testing.
//
// The journey test helpers are framework-neutral, so they live in
// @modular-frontend/journeys-engine. This entry keeps the existing
// "@modular-react/journeys/testing" import path working by re-exporting them.
export { createTestHarness, simulateJourney } from "@modular-frontend/journeys-engine/testing";
export type {
  InstanceSnapshot,
  JourneyTestHarness,
  JourneySimulator,
} from "@modular-frontend/journeys-engine/testing";
