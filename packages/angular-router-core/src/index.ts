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

// Shared dependencies context + injectors (from the Angular binding)
export {
  SHARED_DEPENDENCIES,
  provideSharedDependencies,
  createSharedInjectors,
} from "@modular-angular/angular";
export type { SharedDependenciesContextValue } from "@modular-angular/angular";

// Scoped stores (from the Angular binding)
export { createScopedStore } from "@modular-angular/angular";
export type { ScopedStore } from "@modular-angular/angular";

// Route `data` convention for zones and per-route static data
export type { ModuleRouteData } from "./route-data.js";
