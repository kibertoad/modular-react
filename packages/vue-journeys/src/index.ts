// Public surface of @modular-vue/journeys.
//
// Authors import `defineJourney` (and types) from here; shells import the
// journeys plugin + `<JourneyProvider>` + the instance composables. Modules
// import nothing from this package. The Vue analog of
// `@modular-react/journeys`; the framework-neutral engine pieces are
// re-exported from `@modular-frontend/journeys-engine`, and the Vue-specific
// provider / composables / plugin live in this package.
//
// The journeys-into-runtime wiring + `renderJourney` land in PR-32; this
// package ships the provider, instance composables, and registry plugin (PR-30)
// plus the outlet, module-tab, and `useWaitForExit` (PR-31).

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
// Lower-level subscription composables the outlet builds on.
export { useInstanceSnapshot, useCallChain, useLeafId } from "./instance-hooks.js";

// Vue-specific: the journey outlet — renders the current step of an instance,
// walks the active call chain to the leaf, and drives step callbacks.
export { JourneyOutlet, useJourneyCallStack } from "./outlet.js";
export type {
  JourneyStepErrorPolicy,
  JourneyOutletNotFoundProps,
  JourneyOutletErrorProps,
} from "./outlet.js";

// Vue-specific: host for a single module instance rendered outside a route.
export { ModuleTab } from "./module-tab.js";
export type { ModuleTabExitEvent } from "./module-tab.js";

// Vue-specific: race several async channels and dispatch a journey exit when
// the first one resolves.
export { useWaitForExit } from "./use-wait-for-exit.js";
export type {
  WaitForExitChannels,
  WaitForExitSubscribeChannel,
  WaitForExitPollChannel,
  WaitForExitTimeoutChannel,
} from "./use-wait-for-exit.js";

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
