// Public surface of @modular-vue/compositions.
//
// Authors import `defineComposition` and types; shells import the compositions
// plugin + `<CompositionsProvider>` + the host `useComposition` composable.
// Modules contributing panels import the panel composables
// (`useCompositionState` / `useCompositionDispatch` / `useCompositionEmit` /
// `useCompositionZone`) — their entry points are referenced via the
// composition's zone selectors.
//
// The Vue analog of `@modular-react/compositions`; the framework-neutral engine
// (runtime, scoped stores, validation, authoring helpers, types) lives in
// `@modular-frontend/compositions-engine` and is re-exported here, and the
// Vue UI layer (provider, composables, plugin) lives in this package.
//
// The composition outlet lands in PR-34; this package (PR-33) ships the
// provider, panel + host composables, and registry plugin.

export { defineComposition, defineCompositionHandle } from "@modular-frontend/compositions-engine";

// `getInternals` intentionally omitted from the public surface — it is the
// low-level accessor the outlet (PR-34) drives, exported from
// `@modular-frontend/compositions-engine` for internal use.
export {
  createCompositionRuntime,
  hydrateComposition,
  CompositionHydrationError,
  UnknownCompositionError,
} from "@modular-frontend/compositions-engine";
export type {
  CompositionRuntimeOptions,
  CompositionInstanceRecord,
  CompositionHydrationHandle,
} from "@modular-frontend/compositions-engine";

export {
  CompositionValidationError,
  validateCompositionContracts,
  validateCompositionDefinition,
} from "@modular-frontend/compositions-engine";

// Vue-specific: provider + context.
export { CompositionsProvider, useCompositionsContext, compositionsKey } from "./provider.js";
export type { CompositionProviderValue } from "./provider.js";

// Vue-specific: plugin — pass `compositionsPlugin()` to
// `createRegistry({ plugins: [...] })` to enable composition registration.
export { compositionsPlugin } from "./plugin.js";
export type { CompositionsPluginExtension, CompositionsPluginOptions } from "./plugin.js";

// Vue-specific: panel composables read from the per-mount context the outlet
// installs; `createCompositionContext` bundles pre-typed variants.
export {
  useCompositionState,
  useCompositionDispatch,
  useCompositionEmit,
  useCompositionZone,
  createCompositionContext,
  compositionInstanceKey,
} from "./hooks.js";
export type { CompositionContextValue, TypedCompositionHooks } from "./hooks.js";

// Vue-specific: host composable — mint an instance the host wants to render.
export { useComposition, useCompositionOptions } from "./use-composition.js";
export type { BrandedCompositionOptions, UseCompositionOptions } from "./use-composition.js";

// --- Re-exported authoring surface from the framework-neutral engine ---

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
} from "@modular-frontend/compositions-engine";
