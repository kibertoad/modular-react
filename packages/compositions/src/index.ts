// Public surface of @modular-react/compositions.
//
// Authors import `defineComposition` and types; shells import the runtime
// factory + `CompositionOutlet`. Modules contributing panels import
// nothing from this package — their entry points are referenced via the
// composition's zone selectors.

export { defineComposition, defineCompositionHandle } from "./define-composition.js";

export {
  createCompositionRuntime,
  hydrateComposition,
  CompositionHydrationError,
  UnknownCompositionError,
} from "./runtime.js";
export type { CompositionRuntimeOptions, CompositionInstanceRecord } from "./runtime.js";

export {
  CompositionValidationError,
  validateCompositionContracts,
  validateCompositionDefinition,
} from "./validation.js";

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
  ZoneDescriptor,
  ZoneMap,
  ZoneResolution,
  ZoneSelector,
  ZoneSelectorCtx,
} from "./types.js";
