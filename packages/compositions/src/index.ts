// Public surface of @modular-react/compositions.
//
// Authors import `defineComposition` and types; shells import the runtime
// factory + `CompositionOutlet`. Modules contributing panels import
// nothing from this package — their entry points are referenced via the
// composition's zone selectors.
//
// The framework-neutral engine (runtime, scoped stores, validation,
// authoring helpers, types) lives in `@modular-frontend/compositions-engine`
// and is re-exported here so existing React users see no change. The React
// UI layer (outlet, provider, plugin, hooks) stays in this package.

export { defineComposition, defineCompositionHandle } from "@modular-frontend/compositions-engine";

// `getInternals` intentionally omitted from the public surface — it is the
// low-level accessor the outlet drives, exported from
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

export { CompositionOutlet } from "./outlet.js";
export type {
  CompositionOutletProps,
  CompositionOutletNotFoundProps,
  CompositionOutletErrorProps,
} from "./outlet.js";

export { CompositionsProvider, useCompositionsContext } from "./provider.js";
export type { CompositionsProviderProps, CompositionProviderValue } from "./provider.js";

export { compositionsPlugin } from "./plugin.js";
export type { CompositionsPluginExtension, CompositionsPluginOptions } from "./plugin.js";

export {
  useCompositionState,
  useCompositionDispatch,
  useCompositionEmit,
  useCompositionZone,
  useComposition,
  useCompositionOptions,
  createCompositionContext,
  CompositionInstanceContext,
} from "./hooks.js";
export type {
  CompositionContextValue,
  TypedCompositionHooks,
  UseCompositionOptions,
} from "./hooks.js";

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
