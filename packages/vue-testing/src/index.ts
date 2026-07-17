// `createMockStore` and `resolveModule` are framework-neutral — they live in
// `@modular-frontend/testing` and are re-exported here so Vue test code has a
// single import surface alongside the binding-specific preload helpers.
export { createMockStore, resolveModule } from "@modular-frontend/testing";
export type { ResolveModuleOptions, ResolveModuleResult } from "@modular-frontend/testing";
export { renderModule } from "./render-module.js";
export type { RenderModuleOptions } from "./render-module.js";
export { renderJourney } from "./render-journey.js";
export type { RenderJourneyOptions, RenderJourneyResult } from "./render-journey.js";
// `simulateJourney` is the framework-neutral headless journey simulator; it
// lives in `@modular-frontend/journeys-engine` and is re-exported here (through
// `@modular-vue/journeys/testing`) so Vue test code has a single import surface,
// mirroring `@react-router-modules/testing`'s re-export of it.
export { simulateJourney } from "@modular-vue/journeys/testing";
export type { JourneySimulator } from "@modular-vue/journeys/testing";
export { preloadEntries } from "./preload-entries.js";
// Re-export `preloadEntry` so test code only needs one import surface.
export { preloadEntry } from "@modular-vue/vue";
