// Types
export type { CatalogMeta } from "./catalog-meta.js";

export type {
  ModuleDescriptor,
  AnyModuleDescriptor,
  LazyModuleDescriptor,
  NavigationItem,
  NavigationItemBase,
  ModuleLifecycle,
  ReactiveService,
  ReadableStore,
  WritableStore,
  SlotMap,
  SlotMapOf,
  ZoneMap,
  ZoneMapOf,
  ModuleEntryPoint,
  EagerModuleEntryPoint,
  LazyModuleEntryPoint,
  LazyEntryComponent,
  ModuleEntryProps,
  ExitPointSchema,
  ExitContract,
  StandardSchemaLike,
  StandardSchemaResult,
  StandardSchemaIssue,
  EntryPointMap,
  ExitPointMap,
  ExitFn,
  InputSchema,
  MountKind,
} from "./types.js";

// Entry / exit helpers
export {
  buildInputFor,
  defineEntry,
  defineExit,
  defineExitContract,
  isExitContract,
  schema,
  validateModuleEntryExit,
} from "./entry-exit.js";

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
export type { MergeRouteStaticDataOptions, RouteStaticDataOverrideInfo } from "./route-data.js";
export { createRouteDataOverrideWarner } from "./route-data-warn.js";
export type {
  RouteDataRuntimeLabel,
  RouteDataHookName,
  RouteDataFieldLabel,
} from "./route-data-warn.js";

// Environment detection
export { isDevEnv } from "./dev-env.js";

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
  EntryNamesByMountKindOf,
  MountKindsOf,
  ExitNamesOf,
  EntryInputOf,
  ExitOutputOf,
  StepSpec,
  JourneyStep,
  JourneyStepFor,
  ExitCtx,
  TransitionResult,
  EntryTransitions,
  TransitionMap,
  WildcardTransitionMap,
  EntryExitWildcardMap,
  ExitOnlyWildcardMap,
  WildcardEntryNamesOf,
  WildcardExitNamesOf,
  ExitNamesPairedWithEntry,
  WildcardExitOutputOf,
  WildcardExitOutputForEntry,
  WildcardEntryInputOf,
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

// Semver subset — used by both @modular-react/journeys (range checks on
// module-compat declarations) and @modular-react/compositions
// (`moduleCompat` validation). Lives here so neither plugin has to depend
// on the other for a piece of shared, dependency-free logic.
export {
  satisfies,
  satisfiesParsed,
  parseRange,
  parseVersion,
  compareVersions,
  compareTriples,
  SemverParseError,
} from "./semver.js";
export type { ParsedRange, SemverTriple } from "./semver.js";

// Cross-plugin runtime-mount seam — `compositions` reads adapters of
// this shape so it can embed journeys (today) or other runtimes
// (composition-in-zone, federated remotes) without compile-time
// coupling to any of them. Implementers ship a small factory next to
// their runtime (e.g. `createJourneyMountAdapter` in
// `@modular-react/journeys`).
export type { RuntimeMountAdapter } from "./runtime-mount.js";
