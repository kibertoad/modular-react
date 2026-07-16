// Public surface of @modular-vue/journeys.
//
// Authors import `defineJourney` (and types) from here; shells import the
// journeys plugin + `<JourneyProvider>` + the instance composables. Modules
// import nothing from this package. The Vue analog of
// `@modular-react/journeys`; the framework-neutral engine pieces are
// re-exported from `@modular-frontend/journeys-engine`, and the Vue-specific
// provider / composables / plugin live in this package.
//
// The journey outlet, module-tab, and `useWaitForExit` land in later PRs
// (PR-31 / PR-32); this package currently ships the provider, the instance
// composables, and the registry plugin (PR-30).

// Vue-specific: provider + context.
export { JourneyProvider, useJourneyContext, journeyKey } from "./provider.js";
export type { JourneyProviderValue } from "./provider.js";

// Vue-specific: instance composables.
export {
  useActiveLeafJourneyInstance,
  useActiveLeafJourneyState,
  useJourneyInstance,
  useJourneyState,
} from "./use-journey-state.js";
// Lower-level subscription composables the outlet (PR-31) builds on.
export { useInstanceSnapshot, useCallChain, useLeafId } from "./instance-hooks.js";

// Vue-specific: plugin — pass `journeysPlugin()` to
// `createRegistry({ plugins: [...] })` to enable journey registration.
export { journeysPlugin } from "./plugin.js";
export type {
  JourneysPluginOptions,
  JourneysPluginExtension,
  JourneyDefaultNavItem,
  JourneyNavItemBuilder,
} from "./plugin.js";

// --- Re-exported authoring surface from the framework-neutral engine ---

export { defineJourney } from "@modular-frontend/journeys-engine";
export {
  defineJourneyPersistence,
  createWebStoragePersistence,
  createMemoryPersistence,
} from "@modular-frontend/journeys-engine";
export type {
  WebStoragePersistenceOptions,
  MemoryPersistenceOptions,
  MemoryPersistence,
  SyncJourneyPersistence,
} from "@modular-frontend/journeys-engine";
export {
  createJourneyRuntime,
  type JourneyRuntimeOptions,
} from "@modular-frontend/journeys-engine";
export {
  JourneyValidationError,
  JourneyHydrationError,
  UnknownJourneyError,
  validateJourneyContracts,
  validateJourneyDefinition,
  validateJourneyGraph,
} from "@modular-frontend/journeys-engine";

// Handles — export a handle from each journey package so modules and shells
// open journeys with typed `input` without importing the journey's runtime.
export { defineJourneyHandle, invoke } from "@modular-frontend/journeys-engine";
export type { JourneyHandle } from "@modular-frontend/journeys-engine";

// Authoring helpers — exhaustive (and fallback) state-driven dispatch.
export { selectModule, selectModuleOrDefault } from "@modular-frontend/journeys-engine";
export type {
  SelectModuleCases,
  SelectModuleCasesPartial,
} from "@modular-frontend/journeys-engine";

// Authoring helpers — annotate a transition handler with the entry points it
// can advance into. Read by the outlet's precise preload (PR-31).
export {
  defineTransition,
  isAnnotatedTransition,
  isTerminalSentinel,
} from "@modular-frontend/journeys-engine";
export type {
  AnnotatedTransitionHandler,
  StepRef,
  TerminalSentinel,
} from "@modular-frontend/journeys-engine";

// Semver + abort helpers, re-exported from the neutral core for back-compat
// with the React journeys surface.
export { satisfies, compareVersions, SemverParseError } from "@modular-frontend/core";
export { isJourneySystemAbort } from "@modular-frontend/core";

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
} from "@modular-frontend/journeys-engine";
