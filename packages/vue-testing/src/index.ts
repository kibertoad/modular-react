// `createMockStore` and `resolveModule` are framework-neutral — they live in
// `@modular-frontend/testing` and are re-exported here so Vue test code has a
// single import surface alongside the binding-specific preload helpers.
export { createMockStore, resolveModule } from "@modular-frontend/testing";
export type { ResolveModuleOptions, ResolveModuleResult } from "@modular-frontend/testing";
export { renderModule } from "./render-module.js";
export type { RenderModuleOptions } from "./render-module.js";
export { preloadEntries } from "./preload-entries.js";
// Re-export `preloadEntry` so test code only needs one import surface.
export { preloadEntry } from "@modular-vue/vue";
