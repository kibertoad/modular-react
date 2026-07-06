// Re-export the framework-neutral surface from core for convenience, mirroring
// what @modular-react/react and @modular-vue/vue re-export for their consumers.
export {
  // Types
  type ModuleDescriptor,
  type LazyModuleDescriptor,
  type NavigationItem,
  type NavigationItemBase,
  type ModuleLifecycle,
  type ReactiveService,
  type SlotMap,
  type SlotMapOf,
  type ZoneMap,
  type ZoneMapOf,
  type Store,
  type DynamicSlotFactory,
  type SlotFilter,
  type RegistryConfig,
  type NavigationGroup,
  type NavigationManifest,
  type ModuleEntry,

  // Functions
  createStore,
  isStore,
  isStoreApi,
  isReactiveService,
  separateDeps,
  defineModule,
  defineSlots,
  buildSlotsManifest,
  collectDynamicSlotFactories,
  evaluateDynamicSlots,
  buildNavigationManifest,
  validateNoDuplicateIds,
  validateDependencies,
  buildDepsSnapshot,
  runLifecycleHooks,
} from "@modular-frontend/core";

// Angular-specific: injection-context escape hatch shared by every accessor.
export type { InjectionContextOptions } from "./injection-context.js";

// Angular-specific: store / reactive-service signal bridges.
export { storeSignal, reactiveServiceSignal } from "./store-signal.js";

// Angular-specific: shared dependencies context + typed injectors.
export {
  SHARED_DEPENDENCIES,
  provideSharedDependencies,
  createSharedInjectors,
} from "./context.js";
export type { SharedDependenciesContextValue } from "./context.js";

// Angular-specific: scoped stores.
export { createScopedStore } from "./scoped-store.js";
export type { ScopedStore } from "./scoped-store.js";

// Angular-specific: slots context + accessors + dynamic-slots provider factory.
export {
  SLOTS,
  RECALCULATE_SLOTS,
  provideSlots,
  injectSlots,
  provideRecalculateSlots,
  injectRecalculateSlots,
  provideDynamicSlots,
  createSlotsSignal,
} from "./slots-context.js";
export type { SlotsSignal, DynamicSlotsConfig } from "./slots-context.js";

// Angular-specific: navigation context + accessor.
export { NAVIGATION, provideNavigation, injectNavigation } from "./navigation-context.js";

// Angular-specific: modules context + accessors.
export { MODULES, provideModules, injectModules, getModuleMeta } from "./modules-context.js";
