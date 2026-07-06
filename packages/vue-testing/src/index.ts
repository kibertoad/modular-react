export { createMockStore } from "./mock-store.js";
export { resolveModule } from "./resolve-module.js";
export type { ResolveModuleOptions, ResolveModuleResult } from "./resolve-module.js";
export { preloadEntries } from "./preload-entries.js";
// Re-export `preloadEntry` so test code only needs one import surface.
export { preloadEntry } from "@modular-vue/vue";
