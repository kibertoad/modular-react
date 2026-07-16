// Public surface of @modular-frontend/journeys-engine.
//
// The framework-neutral journey engine: runtime, validation, persistence,
// authoring helpers, handles, and the full type surface. Nothing here depends
// on a UI framework. Framework bindings (@modular-react/journeys, a future
// @modular-vue/journeys) re-export the pieces their users need and add the UI
// layer (outlet, provider, hooks) on top.

export { defineJourney } from "./define-journey.js";
export {
  defineJourneyPersistence,
  createWebStoragePersistence,
  createMemoryPersistence,
} from "./persistence.js";
export type {
  WebStoragePersistenceOptions,
  MemoryPersistenceOptions,
  MemoryPersistence,
  SyncJourneyPersistence,
} from "./persistence.js";

// `createJourneyRuntime` is the public factory; `getInternals` is the
// low-level accessor the outlet and the test harness drive. Bindings that
// render an outlet import `getInternals` from here; they do not re-export it.
export { createJourneyRuntime, getInternals, type JourneyRuntimeOptions } from "./runtime.js";
export {
  JourneyValidationError,
  JourneyHydrationError,
  UnknownJourneyError,
  validateJourneyContracts,
  validateJourneyDefinition,
  validateJourneyGraph,
} from "./validation.js";

// Journey <-> location sync. The reconciler and its decision table are
// framework- and router-neutral; bindings wrap `createJourneySync` in a hook
// (`useJourneySync`) and apps fill in the `JourneySyncPort` for their router.
export {
  createJourneySync,
  createMemoryJourneySyncPort,
  defaultStepPath,
  journeyStepPath,
  resolveJourneySyncAction,
} from "./journey-sync.js";
export type {
  JourneySync,
  JourneySyncAction,
  JourneySyncCallbackCtx,
  JourneySyncOptions,
  JourneySyncPort,
} from "./journey-sync.js";

// Authoring helpers — exhaustive (and fallback) state-driven dispatch.
export { selectModule, selectModuleOrDefault } from "./select-module.js";
export type { SelectModuleCases, SelectModuleCasesPartial } from "./select-module.js";

// Authoring helpers — annotate a transition handler with the entry points it
// can advance into.
export {
  defineTransition,
  isAnnotatedTransition,
  isTerminalSentinel,
} from "./define-transition.js";
export type { AnnotatedTransitionHandler, StepRef, TerminalSentinel } from "./define-transition.js";

// Handles — open a journey with typed `input` without importing its runtime.
export { defineJourneyHandle, invoke } from "./handle.js";
export type { JourneyHandle } from "./handle.js";

export type {
  AbandonCtx,
  AnyJourneyDefinition,
  ChildOutcome,
  EntryExitWildcardMap,
  EntryInputOf,
  EntryNamesOf,
  EntryTransitions,
  ExitCtx,
  ExitNamesOf,
  ExitNamesPairedWithEntry,
  ExitOnlyWildcardMap,
  ExitOutputOf,
  InstanceId,
  InvokeSpec,
  JourneyDefinition,
  JourneyDefinitionSummary,
  JourneyInstance,
  JourneyNavContribution,
  JourneyPersistence,
  JourneyRegisterOptions,
  JourneyRuntime,
  JourneyStatus,
  JourneyStep,
  JourneyStepFor,
  JourneySystemAbortReason,
  JourneySystemAbortReasonCode,
  MaybePromise,
  ModuleTypeMap,
  ParentLink,
  PendingInvoke,
  RegisteredJourney,
  ResumeBounceCounter,
  ResumeHandler,
  ResumeMap,
  SerializedJourney,
  StepSpec,
  TerminalCtx,
  TerminalOutcome,
  TransitionEvent,
  TransitionMap,
  TransitionResult,
  WildcardEntryInputOf,
  WildcardEntryNamesOf,
  WildcardExitNamesOf,
  WildcardExitOutputForEntry,
  WildcardExitOutputOf,
  WildcardTransitionMap,
} from "./types.js";
