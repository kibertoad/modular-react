// Public surface of @modular-react/journeys.
//
// Authors import `defineJourney` (and types) from here; shells import the
// runtime factory + `JourneyOutlet`. Modules import nothing from this package.

export { defineJourney } from "./define-journey.js";
export { defineJourneyPersistence } from "./persistence.js";
export { createJourneyRuntime, getInternals, type JourneyRuntimeOptions } from "./runtime.js";
export {
  JourneyValidationError,
  JourneyHydrationError,
  validateJourneyContracts,
  validateJourneyDefinition,
} from "./validation.js";
export { JourneyOutlet } from "./outlet.js";
export type { JourneyOutletProps, JourneyStepErrorPolicy } from "./outlet.js";
export { ModuleTab } from "./module-tab.js";
export type { ModuleTabProps, ModuleTabExitEvent } from "./module-tab.js";
export { JourneyProvider, useJourneyContext } from "./provider.js";
export type { JourneyProviderProps, JourneyProviderValue } from "./provider.js";

// Plugin — pass `journeysPlugin()` to `createRegistry({ plugins: [...] })`
// to enable journey registration and outlet rendering.
export { journeysPlugin } from "./plugin.js";
export type { JourneysPluginOptions, JourneysPluginExtension } from "./plugin.js";

// Handles — export a handle from each journey package so modules and shells
// open journeys with typed `input` without importing the journey's runtime.
export { defineJourneyHandle } from "./handle.js";
export type { JourneyHandle } from "./handle.js";

export type {
  AbandonCtx,
  AnyJourneyDefinition,
  EntryInputOf,
  EntryNamesOf,
  EntryTransitions,
  ExitCtx,
  ExitNamesOf,
  ExitOutputOf,
  InstanceId,
  JourneyDefinition,
  JourneyDefinitionSummary,
  JourneyInstance,
  JourneyPersistence,
  JourneyRegisterOptions,
  JourneyRuntime,
  JourneyStatus,
  JourneyStep,
  MaybePromise,
  ModuleTypeMap,
  RegisteredJourney,
  SerializedJourney,
  StepSpec,
  TerminalCtx,
  TerminalOutcome,
  TransitionEvent,
  TransitionMap,
  TransitionResult,
} from "./types.js";
