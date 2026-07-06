export { renderModule } from "./render-module.js";
export type { RenderModuleOptions } from "./render-module.js";
// `resolveModule` is framework-neutral — it lives in `@modular-frontend/testing`
// and is re-exported here so router test code has a single import surface.
export { resolveModule } from "@modular-frontend/testing";
export type { ResolveModuleOptions, ResolveModuleResult } from "@modular-frontend/testing";
export { renderJourney } from "./render-journey.js";
export type { RenderJourneyOptions, RenderJourneyResult } from "./render-journey.js";
export { simulateJourney } from "@modular-react/journeys/testing";
export type { JourneySimulator } from "@modular-react/journeys/testing";
export { createMockStore } from "./mock-store.js";
