// Types
export type {
  ModuleDescriptor,
  LazyModuleDescriptor,
  NavigationItem,
  ModuleLifecycle,
  ReactiveService,
  SlotMap,
  SlotMapOf,
  ZoneMap,
  ZoneMapOf,
} from "./types.js";

// Store
export { createStore } from "./store.js";
export type { Store } from "./store.js";

// Detection helpers
export { isStore, isStoreApi, isReactiveService, separateDeps } from "./detection.js";

// Module definition
export { defineModule } from "./define-module.js";
export { defineSlots } from "./define-slots.js";

// Slots
export { buildSlotsManifest, collectDynamicSlotFactories, evaluateDynamicSlots } from "./slots.js";
export type { DynamicSlotFactory, SlotFilter } from "./slots.js";

// Navigation
export { buildNavigationManifest, resolveNavHref } from "./navigation.js";

// Lazy-module helpers
export { warnIgnoredLazyFields } from "./lazy-module.js";

// Validation
export { validateNoDuplicateIds, validateDependencies } from "./validation.js";

// Runtime types
export type {
  RegistryConfig,
  NavigationGroup,
  NavigationManifest,
  ModuleEntry,
} from "./runtime-types.js";
export { buildDepsSnapshot, runLifecycleHooks } from "./runtime-types.js";
