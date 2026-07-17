// Public surface of @modular-vue/journeys.
//
// Authors import `defineJourney` (and types) from here; shells import the
// journeys plugin + `<JourneyProvider>` + the instance composables. Modules
// import nothing from this package. The Vue analog of
// `@modular-react/journeys`; the framework-neutral engine pieces are
// re-exported from `@modular-frontend/journeys-engine`, and the Vue-specific
// provider / composables / plugin live in this package.

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

// Mount adapter — lets other packages (today: `@modular-vue/compositions`)
// embed a journey runtime via the generic `RuntimeMountAdapter` shape without
// depending on this package's Vue surface directly. The Vue analog of
// `@modular-react/journeys`'s `createJourneyMountAdapter`.
export { createJourneyMountAdapter } from "./mount-adapter.js";

// Vue-specific: the journey outlet — renders the current step of an instance,
// walks the active call chain to the leaf, and drives step callbacks.
export { JourneyOutlet, useJourneyCallStack } from "./outlet.js";
export type {
  JourneyStepErrorPolicy,
  JourneyOutletNotFoundProps,
  JourneyOutletErrorProps,
} from "./outlet.js";

// Vue-specific: hosting a journey — owns the instance lifecycle (start on
// mount, end + forget on unmount) so route components stop hand-rolling it.
export { JourneyHost, useJourneyHost } from "./journey-host.js";
export type {
  JourneyHostSlotProps,
  JourneyHostState,
  UseJourneyHostOptions,
} from "./journey-host.js";

// Vue-specific: progress for a running instance — `{ index, total }` derived
// from the transition graph (via `resolveStepSequence`), returned as
// `ComputedRef`s.
export { useJourneyProgress } from "./use-journey-progress.js";
export type { JourneyProgress, UseJourneyProgressOptions } from "./use-journey-progress.js";

// Vue-specific: journey <-> URL sync. The reconciler is framework- and
// router-neutral (it lives in the engine); this composable is the Vue lifetime
// wrapper, and the app supplies a `JourneySyncPort` for vue-router.
export { useJourneySync } from "./use-journey-sync.js";
export type { UseJourneySyncOptions } from "./use-journey-sync.js";

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

// Derive an ordered step list from the transition graph — URL segments,
// "Step X of N". `useJourneyProgress` builds on this.
export { resolveStepSequence } from "@modular-frontend/journeys-engine";
export type {
  ResolvedJourneyStep,
  ResolveStepSequenceOptions,
  StepSequenceRef,
} from "@modular-frontend/journeys-engine";

// Journey <-> location reconciler — the neutral core behind `useJourneySync`,
// plus the in-memory port for tests and headless hosts.
export {
  createJourneySync,
  createMemoryJourneySyncPort,
  defaultStepPath,
  journeyStepPath,
  resolveJourneySyncAction,
} from "@modular-frontend/journeys-engine";
export type {
  JourneySync,
  JourneySyncAction,
  JourneySyncCallbackCtx,
  JourneySyncOptions,
  JourneySyncPort,
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
  JourneyStepMeta,
  JourneyStepMetaMap,
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
