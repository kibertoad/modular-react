// Public surface of @modular-react/journeys.
//
// Authors import `defineJourney` (and types) from here; shells import the
// runtime factory + `JourneyOutlet`. Modules import nothing from this package.

export { defineJourney } from "./define-journey.js";
export {
  createJourneyRuntime,
  getInternals,
  type JourneyRuntimeOptions,
} from "./runtime.js";
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
  TransitionEvent,
  TransitionMap,
  TransitionResult,
} from "./types.js";
