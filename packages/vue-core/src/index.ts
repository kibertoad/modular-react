// Types (shared types re-exported via types.ts, plus router-specific)
export type {
  ModuleDescriptor,
  AnyModuleDescriptor,
  LazyModuleDescriptor,
  NavigationItem,
  NavigationItemBase,
  ModuleLifecycle,
  ReactiveService,
  SlotMap,
  SlotMapOf,
  ZoneMap,
  ZoneMapOf,
} from "./types.js";

// Detection helpers (framework-neutral, re-exported from the engine)
export { isStoreApi, isReactiveService, separateDeps } from "@modular-frontend/core";

// Module definition
export { defineModule } from "./define-module.js";
export { defineSlots } from "./define-slots.js";

// Shared dependencies context + composables (from the Vue binding)
export {
  sharedDependenciesKey,
  provideSharedDependencies,
  createSharedComposables,
} from "@modular-vue/vue";
export type { SharedDependenciesContextValue } from "@modular-vue/vue";

// Scoped stores (from the Vue binding)
export { createScopedStore } from "@modular-vue/vue";
export type { ScopedStore } from "@modular-vue/vue";

// Route `meta` convention for zones and per-route static data
export type { ModuleRouteMeta } from "./route-meta.js";
