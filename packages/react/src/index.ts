// Re-export everything from core for convenience
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
} from "@modular-react/core";

// React-specific: shared dependencies context + hooks
export { SharedDependenciesContext, createSharedHooks } from "./context.js";

// React-specific: scoped stores
export { createScopedStore } from "./scoped-store.js";
export type { ScopedStore } from "./scoped-store.js";

// React-specific: slots context + hooks
export {
  SlotsContext,
  RecalculateSlotsContext,
  useSlots,
  useRecalculateSlots,
  DynamicSlotsProvider,
  createSlotsSignal,
} from "./slots-context.js";
export type { SlotsSignal } from "./slots-context.js";

// React-specific: navigation context + hook
export { NavigationContext, useNavigation } from "./navigation-context.js";

// React-specific: modules context + hooks
export { ModulesContext, useModules, getModuleMeta } from "./modules-context.js";

// React-specific: error boundary
export { ModuleErrorBoundary } from "./error-boundary.js";

// React-specific: module-exit plumbing (hosted by ModuleTab / ModuleRoute;
// the "step 0" pattern — modules fire exits outside a journey, composition
// root decides what they mean).
export { ModuleExitProvider, useModuleExit, useModuleExitDispatcher } from "./module-exit.js";
export type { ModuleExitEvent, ModuleExitHandler, ModuleExitProviderProps } from "./module-exit.js";

// React-specific: router-mode module host (step 0 outside a workspace tab).
export { ModuleRoute } from "./module-route.js";
export type { ModuleRouteProps, ModuleRouteExitEvent } from "./module-route.js";
