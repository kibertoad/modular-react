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

// Remote capability manifests (JSON-safe descriptor subset) — surfaced through
// the Vue binding so consumers never reach into the neutral engine directly.
export { mergeRemoteManifests } from "@modular-frontend/core";
export type {
  RemoteModuleManifest,
  RemoteNavigationItem,
  MergedRemoteManifests,
} from "@modular-frontend/core";

// Component registry & pairing — read-side helpers (framework-neutral) that pair
// a remote manifest's string ids with code-shipped components registered in a
// local slot. A Vue `computed` re-runs them on reactive change with no glue.
export { resolveComponentRegistry, pairById, componentPairingPlugin } from "@modular-frontend/core";
export type {
  ComponentEntry,
  ComponentRegistry,
  OnDuplicateComponentId,
  ComponentPairingPluginOptions,
  ComponentRefSpec,
} from "@modular-frontend/core";

// Subject-keyed panels — render-all, predicate-gated projection over a slot.
// The pure engine surface plus the Vue host, both surfaced here so consumers
// import panels from the Vue binding rather than reaching into the engine.
export { definePanelGroup, resolvePanels } from "@modular-frontend/core";
export type { PanelEntry, PanelGroupHandle } from "@modular-frontend/core";
export { usePanels, PanelsOutlet, usePanelSubject, panelSubjectKey } from "@modular-vue/vue";

// State-keyed overlay host — the pick-one, modal sibling of the render-all
// panels. The pure engine surface plus the Vue managed modal host, both
// surfaced here so consumers import overlays from the Vue binding rather than
// reaching into the engine.
export {
  createOverlayStack,
  defineOverlayHost,
  resolveOverlay,
  resolveOverlayTitle,
} from "@modular-frontend/core";
export type {
  OverlayEntry,
  OverlayHostHandle,
  OverlayStack,
  OverlayStackTicket,
} from "@modular-frontend/core";
export {
  useOverlay,
  OverlayOutlet,
  useOverlaySubject,
  overlaySubjectKey,
  useModalBehavior,
} from "@modular-vue/vue";

// Module definition
export { defineModule } from "./define-module.js";
export { defineSlots } from "./define-slots.js";

// Shared dependencies context + composables (from the Vue binding)
export {
  sharedDependenciesKey,
  provideSharedDependencies,
  createSharedComposables,
} from "@modular-vue/vue";
export type { SharedDependenciesContextValue } from "@modular-vue/vue";

// Scoped stores (from the Vue binding)
export { createScopedStore } from "@modular-vue/vue";
export type { ScopedStore } from "@modular-vue/vue";

// Route `meta` convention for zones and per-route static data
export type { ModuleRouteMeta } from "./route-meta.js";
