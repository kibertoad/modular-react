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

// Detection helpers
export { isStoreApi, isReactiveService, separateDeps } from "./is-store-api.js";

// Module definition
export { defineModule } from "./define-module.js";
export { defineSlots } from "./define-slots.js";

// Shared dependencies context + hooks
export { SharedDependenciesContext, createSharedHooks } from "./context.js";

// Scoped stores
export { createScopedStore } from "./scoped-store.js";
export type { ScopedStore } from "./scoped-store.js";
