// Registry
export { createRegistry } from "./registry.js";
export type { ModuleRegistry } from "./registry.js";

// App shell — router-owning resolve() convenience
export { createModularApp } from "./app.js";

// Route builder (graft module routes onto a live vue-router instance)
export { graftModuleRoutes, createLazyModuleRoute } from "./route-builder.js";
export type { RouteBuilderOptions } from "./route-builder.js";

// Provider layer — the app-level plugin and the framework-mode component
export { createModularProvidersPlugin, createModularProvidersComponent } from "./providers.js";
export type { ModularProvidersConfig } from "./providers.js";

// Zones and route data — read module-contributed statics off route `meta`.
export { useZones } from "./zones.js";
export { useActiveZones } from "./active-zones.js";
export { useRouteData } from "./route-data.js";

// Types
export type {
  RegistryConfig,
  ApplicationManifest,
  ResolveOptions,
  ResolveManifestOptions,
  ResolvedManifest,
  ModuleExitEvent,
  NavigationGuard,
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

// Re-export the Vue binding composables/contexts a shell consumes, mirroring
// how @react-router-modules/runtime re-exports from @modular-react/react.
export {
  createSlotsSignal,
  useNavigation,
  useSlots,
  useReactiveSlots,
  useRecalculateSlots,
  reactiveSlotsKey,
  useModules,
  getModuleMeta,
  ModuleErrorBoundary,
} from "@modular-vue/vue";
export type { SlotsSignal } from "@modular-vue/vue";
