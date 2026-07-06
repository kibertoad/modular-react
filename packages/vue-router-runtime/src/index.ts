// Registry
export { createRegistry } from "./registry.js";
export type { ModuleRegistry } from "./registry.js";

// Types
export type {
  RegistryConfig,
  ResolveManifestOptions,
  ResolvedManifest,
  ModuleExitEvent,
} from "./types.js";

// Re-export shared runtime types from @modular-frontend/core.
export type {
  NavigationGroup,
  NavigationManifest,
  ModuleEntry,
  DynamicSlotFactory,
  SlotFilter,
} from "@modular-frontend/core";

// Re-export shared pure functions from @modular-frontend/core.
export {
  buildSlotsManifest,
  collectDynamicSlotFactories,
  evaluateDynamicSlots,
  buildNavigationManifest,
  validateNoDuplicateIds,
  validateDependencies,
} from "@modular-frontend/core";

// Re-export the Vue slots-signal helper from the binding.
export { createSlotsSignal } from "@modular-vue/vue";
export type { SlotsSignal } from "@modular-vue/vue";
