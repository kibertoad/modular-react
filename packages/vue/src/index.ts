// Re-export the framework-neutral surface from core for convenience, mirroring
// what @modular-react/react re-exports for React consumers.
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

// Vue-specific: shared dependencies context + composables
export {
  sharedDependenciesKey,
  provideSharedDependencies,
  createSharedComposables,
} from "./context.js";
export type { SharedDependenciesContextValue } from "./context.js";

// Vue-specific: scoped stores
export { createScopedStore } from "./scoped-store.js";
export type { ScopedStore } from "./scoped-store.js";

// Vue-specific: slots context + composables
export {
  slotsKey,
  recalculateSlotsKey,
  provideSlots,
  useSlots,
  useRecalculateSlots,
  DynamicSlotsProvider,
  createSlotsSignal,
} from "./slots-context.js";
export type { SlotsSignal } from "./slots-context.js";

// Vue-specific: navigation context + composable
export { navigationKey, provideNavigation, useNavigation } from "./navigation-context.js";

// Vue-specific: modules context + composables
export { modulesKey, provideModules, useModules, getModuleMeta } from "./modules-context.js";
