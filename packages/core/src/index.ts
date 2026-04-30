// Types
export type {
  ModuleDescriptor,
  AnyModuleDescriptor,
  LazyModuleDescriptor,
  NavigationItem,
  NavigationItemBase,
  ModuleLifecycle,
  ReactiveService,
  SlotMap,
  SlotMapOf,
  ZoneMap,
  ZoneMapOf,
  ModuleEntryPoint,
  ModuleEntryProps,
  ExitPointSchema,
  EntryPointMap,
  ExitPointMap,
  ExitFn,
  InputSchema,
} from "./types.js";

// Entry / exit helpers
export { defineEntry, defineExit, schema, validateModuleEntryExit } from "./entry-exit.js";

// Store
export { createStore } from "./store.js";
export type { Store } from "./store.js";

// Detection helpers
export { isStore, isStoreApi, isReactiveService, separateDeps } from "./detection.js";

// Module definition
export { defineModule } from "./define-module.js";
export { defineSlots } from "./define-slots.js";

// Slots
export { buildSlotsManifest, collectDynamicSlotFactories, evaluateDynamicSlots } from "./slots.js";
export type { DynamicSlotFactory, SlotFilter } from "./slots.js";

// Navigation
export { buildNavigationManifest, resolveNavHref } from "./navigation.js";

// Route data
export { mergeRouteStaticData } from "./route-data.js";

// Lazy-module helpers
export { warnIgnoredLazyFields } from "./lazy-module.js";

// Remote capability manifests (JSON-safe descriptor subset)
export { mergeRemoteManifests } from "./remote-manifest.js";
export type {
  RemoteModuleManifest,
  RemoteNavigationItem,
  MergedRemoteManifests,
} from "./remote-manifest.js";

// Validation
export {
  validateNoDuplicateIds,
  validateDependencies,
  validateEntryExitShape,
} from "./validation.js";

// Runtime types
export type {
  RegistryConfig,
  NavigationGroup,
  NavigationManifest,
  ModuleEntry,
} from "./runtime-types.js";
export { buildDepsSnapshot, runLifecycleHooks } from "./runtime-types.js";

// Plugin API — runtime packages call plugin hooks during registration and
// resolve; plugins live in their own packages (e.g. @modular-react/journeys).
export type {
  RegistryPlugin,
  PluginExtendCtx,
  PluginValidateCtx,
  PluginResolveCtx,
  PluginNavigationCtx,
  PluginProvidersCtx,
  PluginExtensionsOf,
  PluginRuntimesOf,
} from "./plugin.js";

// Journey contracts — type-only surfaces describing a journey runtime. The
// implementation lives in @modular-react/journeys.
export type {
  ModuleTypeMap,
  EntryNamesOf,
  ExitNamesOf,
  EntryInputOf,
  ExitOutputOf,
  StepSpec,
  JourneyStep,
  ExitCtx,
  TransitionResult,
  EntryTransitions,
  TransitionMap,
  TransitionEvent,
  AbandonCtx,
  TerminalCtx,
  InstanceId,
  JourneyStatus,
  JourneyInstance,
  SerializedJourney,
  JourneyDefinitionSummary,
  MaybePromise,
  JourneyPersistence,
  TerminalOutcome,
  JourneyRuntime,
  JourneyHandleRef,
  ChildOutcome,
  InvokeSpec,
  ResumeHandler,
  ResumeMap,
  PendingInvoke,
  ParentLink,
  ResumeBounceCounter,
  JourneySystemAbortReason,
  JourneySystemAbortReasonCode,
} from "./journey-contracts.js";
export { isTerminal, isJourneySystemAbort } from "./journey-contracts.js";
