// Public surface of @modular-react/journeys.
//
// Authors import `defineJourney` (and types) from here; shells import the
// runtime factory + `JourneyOutlet`. Modules import nothing from this package.

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
// `getInternals` intentionally omitted from the public surface — test code
// that used to reach through it should migrate to `createTestHarness` in
// `@modular-react/journeys/testing`. The symbol is still exported from
// `@modular-frontend/journeys-engine` for internal use (the outlet, the test
// harness itself).
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
// Public semver surface. The implementation now lives in
// `@modular-react/core` so both journeys and compositions can share it
// without one depending on the other; the journeys package re-exports
// the minimal "match" + "order" + error class for back-compat. New
// callers should import these from `@modular-react/core` directly.
export { satisfies, compareVersions, SemverParseError } from "@modular-react/core";

// Mount adapter — lets other packages (today: `@modular-react/compositions`)
// embed a journey runtime via the generic `RuntimeMountAdapter` shape
// without depending on this package's React surface directly.
export { createJourneyMountAdapter } from "./mount-adapter.js";
export { JourneyOutlet, useJourneyCallStack } from "./outlet.js";
export type {
  JourneyOutletProps,
  JourneyStepErrorPolicy,
  JourneyOutletNotFoundProps,
  JourneyOutletErrorProps,
} from "./outlet.js";

// Hosting a journey — owns the instance lifecycle (start on mount, end +
// forget on unmount) so route components stop hand-rolling it.
export { JourneyHost, useJourneyHost } from "./journey-host.js";
export type {
  JourneyHostProps,
  JourneyHostRenderProps,
  JourneyHostState,
  UseJourneyHostOptions,
} from "./journey-host.js";

// Journey <-> URL sync. The reconciler is framework- and router-neutral (it
// lives in the engine); this hook is the React lifetime wrapper, and the app
// supplies a `JourneySyncPort` for its router.
export { useJourneySync } from "./use-journey-sync.js";
export type { UseJourneySyncOptions } from "./use-journey-sync.js";
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
export { ModuleTab } from "./module-tab.js";
export type { ModuleTabProps, ModuleTabExitEvent } from "./module-tab.js";
export { JourneyProvider, useJourneyContext } from "./provider.js";
export type { JourneyProviderProps, JourneyProviderValue } from "./provider.js";
export {
  useActiveLeafJourneyInstance,
  useActiveLeafJourneyState,
  useJourneyInstance,
  useJourneyState,
} from "./use-journey-state.js";

// Authoring helper for step components that wait on an async backend event
// (websocket / SSE / push notification) before firing an exit. Encapsulates
// the subscribe + poll + timeout + first-wins-latch pattern that loading
// entries would otherwise hand-roll in `useEffect`.
export { useWaitForExit } from "./use-wait-for-exit.js";
export type {
  WaitForExitChannels,
  WaitForExitPollChannel,
  WaitForExitSubscribeChannel,
  WaitForExitTimeoutChannel,
} from "./use-wait-for-exit.js";

// Plugin — pass `journeysPlugin()` to `createRegistry({ plugins: [...] })`
// to enable journey registration and outlet rendering.
export { journeysPlugin } from "./plugin.js";
export type {
  JourneysPluginOptions,
  JourneysPluginExtension,
  JourneyDefaultNavItem,
  JourneyNavItemBuilder,
} from "./plugin.js";

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
// can advance into. Read by `<JourneyOutlet preload="precise">` (the default)
// to warm exactly those chunks during idle time.
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

export { isJourneySystemAbort } from "@modular-react/core";
