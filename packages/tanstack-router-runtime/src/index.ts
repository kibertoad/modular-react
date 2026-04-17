// Registry
export { createRegistry } from "./registry.js";
export type { ModuleRegistry, ResolveOptions } from "./registry.js";

// Types
export type { RegistryConfig, ApplicationManifest } from "./types.js";

// Re-export shared runtime types from @modular-react/core
export type {
  NavigationGroup,
  NavigationManifest,
  ModuleEntry,
  DynamicSlotFactory,
  SlotFilter,
} from "@modular-react/core";

// Re-export shared pure functions from @modular-react/core
export {
  buildSlotsManifest,
  collectDynamicSlotFactories,
  evaluateDynamicSlots,
  buildNavigationManifest,
  validateNoDuplicateIds,
  validateDependencies,
} from "@modular-react/core";

// Re-export shared React hooks/contexts from @modular-react/react
export {
  NavigationContext,
  RecalculateSlotsContext,
  DynamicSlotsProvider,
  createSlotsSignal,
  useNavigation,
  useSlots,
  useRecalculateSlots,
  SlotsContext,
  useModules,
  getModuleMeta,
  ModulesContext,
  ModuleErrorBoundary,
} from "@modular-react/react";
export type { SlotsSignal } from "@modular-react/react";

// Zones (router-specific)
export { useZones } from "./zones.js";
export { useActiveZones } from "./active-zones.js";
export { useRouteData } from "./route-data.js";
