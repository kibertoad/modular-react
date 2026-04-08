// Registry
export { createRegistry } from "./registry.js";
export type { ReactiveRegistry, ResolveOptions } from "./registry.js";

// Types
export type {
  RegistryConfig,
  NavigationGroup,
  NavigationManifest,
  ApplicationManifest,
  ModuleEntry,
} from "./types.js";

// Navigation
export { useNavigation } from "./navigation-context.js";

// Slots
export { useSlots, SlotsContext } from "./slots-context.js";
export { buildSlotsManifest } from "./slots.js";

// Zones
export { useZones } from "./zones.js";
export { useActiveZones } from "./active-zones.js";

// Modules
export { useModules, getModuleMeta, ModulesContext } from "./modules-context.js";

// Error boundary (for custom usage)
export { ModuleErrorBoundary } from "./error-boundary.js";
