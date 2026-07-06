// Public surface of @modular-frontend/compositions-engine.
//
// The framework-neutral compositions engine: runtime, scoped stores,
// validation, authoring helpers, and the full type surface. Nothing here
// depends on a UI framework. Framework bindings (@modular-react/compositions,
// a future @modular-vue/compositions) re-export the pieces their users need
// and add the UI layer (outlet, provider, hooks) on top.

export { defineComposition, defineCompositionHandle } from "./define-composition.js";

// `createCompositionRuntime` is the public factory; `getInternals` is the
// low-level accessor the outlet drives. Bindings that render an outlet import
// `getInternals` from here; they do not re-export it.
export {
  createCompositionRuntime,
  getInternals,
  hydrateComposition,
  CompositionHydrationError,
  UnknownCompositionError,
} from "./runtime.js";
export type {
  CompositionRuntimeOptions,
  CompositionRuntimeInternals,
  CompositionInstanceRecord,
  CompositionHydrationHandle,
} from "./runtime.js";

export {
  CompositionValidationError,
  validateCompositionContracts,
  validateCompositionDefinition,
} from "./validation.js";

export type {
  AnyCompositionDefinition,
  CompositionDefinition,
  CompositionDefinitionSummary,
  CompositionHandleRef,
  CompositionInstance,
  CompositionInstanceId,
  CompositionLifecycle,
  CompositionRegisterOptions,
  CompositionRuntime,
  CompositionStatus,
  CompositionZoneEvent,
  CompositionZoneErrorPolicy,
  RegisteredComposition,
  SerializedComposition,
  CompositionZoneDescriptor,
  CompositionZoneMap,
  CompositionZoneResolution,
  CompositionZoneSelector,
  CompositionZoneSelectorCtx,
  CompositionZoneSpec,
  CompositionZoneStores,
} from "./types.js";

// Scoped-store helpers and types used by the binding's outlet to build the
// per-zone store map.
export { createCompositionZoneStores, noopCompositionZoneStores } from "./stores.js";
export type { ReadableStore, WritableStore } from "./types.js";
