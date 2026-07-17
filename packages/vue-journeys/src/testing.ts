// Public surface of @modular-vue/journeys/testing.
//
// The journey test helpers are framework-neutral, so they live in
// @modular-frontend/journeys-engine. This entry keeps the
// "@modular-vue/journeys/testing" import path working (mirroring
// "@modular-react/journeys/testing") by re-exporting them, so Vue test code
// does not have to reach into the engine directly.
export { createTestHarness, simulateJourney } from "@modular-frontend/journeys-engine/testing";
export type {
  InstanceSnapshot,
  JourneyTestHarness,
  JourneySimulator,
} from "@modular-frontend/journeys-engine/testing";
