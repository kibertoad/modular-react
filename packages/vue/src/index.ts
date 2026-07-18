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

// Vue-ecosystem: present a Pinia store behind the neutral `Store<T>` contract
// so it can fill a registry-owned store / reactive-service DI slot. Structural
// store shape — no `pinia` dependency (decision D3).
export { createPiniaStoreAdapter } from "./pinia-store.js";
export type { PiniaStoreLike } from "./pinia-store.js";

// Vue-specific plugin contract extension: app-level injection bindings a
// registry plugin contributes for the router-owning install path — the
// install-mode twin of the neutral `providers()` wrapping components. Consumed
// by `@modular-vue/runtime`'s `resolve()`; emitted by e.g. the journeys plugin.
export type { AppProvide, VueAppProvidingPlugin } from "./plugin-app-provide.js";

// Vue-specific: slots context + composables
export {
  slotsKey,
  recalculateSlotsKey,
  reactiveSlotsKey,
  provideSlots,
  useSlots,
  useReactiveSlots,
  resolveReactiveSlots,
  useRecalculateSlots,
  DynamicSlotsProvider,
  createSlotsSignal,
} from "./slots-context.js";
export type { SlotsSignal, ReactiveSlotsInput } from "./slots-context.js";

// Vue-specific: navigation context + composable
export { navigationKey, provideNavigation, useNavigation } from "./navigation-context.js";

// Vue-specific: modules context + composables
export { modulesKey, provideModules, useModules, getModuleMeta } from "./modules-context.js";

// Vue-specific: error boundary
export { ModuleErrorBoundary } from "./error-boundary.js";

// Vue-specific: module-exit plumbing (hosted by ModuleRoute / tabs; the
// "step 0" pattern — modules fire exits outside a journey, composition root
// decides what they mean).
export {
  moduleExitKey,
  ModuleExitProvider,
  useModuleExit,
  useModuleExitDispatcher,
} from "./module-exit.js";
export type { ModuleExitEvent, ModuleExitHandler } from "./module-exit.js";

// Vue-specific: router-mode module host (step 0 outside a workspace tab).
export { ModuleRoute } from "./module-route.js";
export type { ModuleRouteExitEvent } from "./module-route.js";

// Vue-specific: lazy entry-point resolution. Hosts call `resolveEntryComponent`
// to obtain a renderable component + idempotent `preload()` for both eager
// (`component:`) and lazy (`lazy:`) entries. `preloadEntry` is the convenience
// prefetch helper.
export { resolveEntryComponent, preloadEntry } from "./resolve-entry.js";
export type { ResolvedEntry } from "./resolve-entry.js";
