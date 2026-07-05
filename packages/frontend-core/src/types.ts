import type { CatalogMeta } from "./catalog-meta.js";
import type { UiComponent, UiNode } from "./ui-types.js";

/**
 * A reactive external source that components can subscribe to.
 * Matches React's useSyncExternalStore API — the standard way to
 * subscribe to external state that isn't a React/zustand store.
 *
 * Use for integrations you observe but don't control: call adapters,
 * presence systems, websocket connections, push notifications.
 *
 * @example
 * ```ts
 * const callReactiveService: ReactiveService<CallSnapshot> = {
 *   subscribe: (cb) => callAdapter.onCallEvent(cb),
 *   getSnapshot: () => ({
 *     state: callAdapter.getCallState(),
 *     caller: callAdapter.getCallerInfo(),
 *   }),
 * }
 * ```
 */
export interface ReactiveService<T> {
  /** Subscribe to changes. Returns unsubscribe function. */
  subscribe: (callback: () => void) => () => void;
  /** Get current snapshot. Must return a stable reference when state hasn't changed. */
  getSnapshot: () => T;
}

/**
 * Read-only store interface — `useSyncExternalStore`-compatible. Modules
 * that need to read shared state without coupling to *which* primitive
 * provides it (a composition's per-instance store, a shell-level
 * Zustand/Redux store, a test mock, etc.) declare an `input` field of
 * this type. The host wires in the implementation — typically a
 * composition's selector projection, but any subscribable source works.
 *
 * Alias of {@link ReactiveService} — same shape, named for the
 * store-contract pattern. Use `ReadableStore<T>` when authoring module
 * contracts; use `ReactiveService<T>` when authoring an
 * app-dependencies entry that happens to be subscribable.
 */
export type ReadableStore<T> = ReactiveService<T>;

/**
 * Read-write store interface — extends {@link ReadableStore} with a
 * `set` operation. Used the same way: panel modules declare
 * `WritableStore<T>` on their input when they need to drive a value
 * shared with sibling panels, and the host (typically a composition's
 * selector) supplies the implementation. Panels stay unaware of
 * *whose* state they are mutating.
 */
export interface WritableStore<T> extends ReadableStore<T> {
  /**
   * Replace the current value. Listeners fire when the value differs
   * from the previous snapshot under the store implementation's
   * change-detection rule (typically `Object.is`).
   */
  set: (value: T) => void;
}

/**
 * Default type for slot definitions when no explicit type is provided.
 * Every slot value must be a readonly array — modules contribute items
 * and the registry concatenates them across all registered modules.
 *
 * When defining your own slot types, use a plain interface:
 * ```ts
 * interface AppSlots {
 *   commands: CommandDefinition[]
 *   systems: SystemRegistration[]
 * }
 * ```
 * The generic constraint accepts interfaces directly — no index signature needed.
 * Non-array values (e.g. `commands: string`) produce a compile error.
 */
export type SlotMap = Record<string, readonly unknown[]>;

/**
 * F-bounded constraint that enforces every value in T is a readonly array,
 * without requiring an index signature. Use this as a generic bound:
 *
 * ```ts
 * function foo<T extends SlotMapOf<T>>() {}
 * ```
 *
 * This accepts `interface AppSlots { commands: Cmd[] }` (no index signature)
 * while rejecting `interface Bad { commands: string }` (not an array).
 */
export type SlotMapOf<T> = { [K in keyof T]: readonly unknown[] };

/**
 * Constraint type for zone definitions.
 * Zone values are React component types — the active route declares which
 * components should render in named layout regions of the shell.
 *
 * Unlike SlotMap (arrays concatenated across all modules), ZoneMap values are
 * single components contributed by the currently matched route.
 */
export type ZoneMap = Record<string, UiComponent | undefined>;

/**
 * F-bounded constraint that accepts interfaces without index signatures.
 * Use this as a generic bound for useZones<T>:
 *
 * ```ts
 * function useZones<T extends ZoneMapOf<T>>(): Partial<T> {}
 * ```
 *
 * This accepts `interface AppZones { contextualPanel?: ComponentType }` directly.
 */
export type ZoneMapOf<T> = { [K in keyof T]: UiComponent | undefined };

/**
 * Describes a module — a self-contained piece of UI that declares
 * its routes, navigation items, slot contributions, shared dependency requirements,
 * and lifecycle hooks.
 *
 * TSharedDependencies is the contract type defined by the host app (e.g. AppDependencies).
 * TSlots is the slot map type defined by the host app (e.g. AppSlots).
 *
 * createRoutes is optional — modules without routes are "headless" and
 * contribute only via slots, navigation, and lifecycle hooks.
 *
 * The createRoutes signature is intentionally generic (`(...args: any[]) => any`)
 * so that router-specific packages can narrow it for their router.
 */
export interface ModuleDescriptor<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
  TNavItem extends NavigationItemBase = NavigationItem,
> {
  /** Unique module identifier, e.g. "billing", "user-profile" */
  readonly id: string;

  /** SemVer version string */
  readonly version: string;

  /**
   * Returns the module's route subtree. The exact signature depends on
   * your router — this is the framework-agnostic base type.
   *
   * Optional — omit for "headless" modules that contribute only
   * via slots, navigation, and lifecycle hooks without owning routes.
   */
  readonly createRoutes?: (...args: any[]) => any;

  /**
   * Navigation items this module contributes to the app shell.
   *
   * Type the `TNavItem` generic on `defineModule` (or use a local alias of
   * `NavigationItem<TLabel, TContext, TMeta>`) to enforce app-specific
   * constraints — typed i18n keys, typed dynamic-href context, or a typed
   * `meta` bag for permissions/badges/analytics.
   */
  readonly navigation?: readonly TNavItem[];

  /**
   * Typed slot contributions this module provides to the shell.
   * Each key maps to an array of items that get concatenated with
   * contributions from other modules at resolve() time.
   */
  readonly slots?: { readonly [K in keyof TSlots]?: TSlots[K] };

  /**
   * Dynamic slot contributions evaluated when `recalculateSlots()` is called.
   * Receives the current shared dependencies snapshot and returns
   * conditional slot entries that are concatenated with static `slots`.
   *
   * Use this for slot contributions that depend on runtime state like
   * user role, permissions, or feature flags. Call `recalculateSlots()`
   * (returned from `registry.resolve()`) after the relevant state changes.
   *
   * @example
   * ```ts
   * dynamicSlots: (deps) => ({
   *   navItems: deps.auth.user?.isAdmin
   *     ? [{ label: "Admin", to: "/admin" }]
   *     : [],
   * })
   * ```
   */
  readonly dynamicSlots?: (deps: TSharedDependencies) => {
    readonly [K in keyof TSlots]?: TSlots[K];
  };

  /**
   * A component the shell can render outside of routes — in a tab, modal,
   * panel, or any other container. Use this for workspace-style apps where
   * modules are rendered by the shell rather than by the router.
   *
   * Route-based modules use createRoutes instead (or both).
   */
  readonly component?: UiComponent;

  /**
   * Zone components this module contributes to the shell when it is active.
   * Used by workspace-style apps where the active module is a tab rather than
   * a route — the shell reads zones from the active module's descriptor via
   * `useActiveZones(activeModuleId)`.
   *
   * Keys match the app's zone names (e.g. "contextualPanel", "headerActions").
   * Values are components rendered by the shell in the corresponding layout
   * region.
   *
   * Route-based modules use route handles/staticData instead.
   */
  readonly zones?: Readonly<Record<string, UiComponent>>;

  /**
   * Catalog metadata — descriptive information the shell uses for discovery
   * UIs like directory pages, search, and command palettes.
   *
   * The framework collects meta from all modules and exposes it via useModules().
   * Values are opaque to the framework — the shell defines what keys matter.
   *
   * Use the TMeta generic on defineModule to get compile-time validation:
   * ```ts
   * interface JourneyMeta { name: string; category: string; icon: string }
   * defineModule<AppDeps, AppSlots, JourneyMeta>({ meta: { name: '...', ... } })
   * ```
   */
  readonly meta?: Readonly<CatalogMeta & TMeta>;

  /** Keys from TSharedDependencies that this module needs. Throws at resolve() if missing. */
  readonly requires?: readonly (keyof TSharedDependencies)[];

  /**
   * Keys from TSharedDependencies that this module can use but doesn't strictly need.
   * Logs a warning at resolve() if missing, but does not throw.
   * Access optional deps via useOptional() which returns null if not registered.
   */
  readonly optionalRequires?: readonly (keyof TSharedDependencies)[];

  /** Lifecycle hooks */
  readonly lifecycle?: ModuleLifecycle<TSharedDependencies>;

  /**
   * Typed entry points. Each entry point is a way to open the module with a
   * specific input payload. Used by `<JourneyOutlet>`, the built-in
   * `<ModuleTab>` host, and test harnesses. Optional — modules that do not
   * participate in workspace hosting or journeys can omit this field.
   */
  readonly entryPoints?: EntryPointMap;

  /**
   * Typed exit points — the module's full outcome vocabulary. A module
   * declares every outcome it can emit here once; transitions in a journey
   * decide which ones map to which next step. Optional — only needed by
   * modules that emit outcomes to a host.
   */
  readonly exitPoints?: ExitPointMap;
}

/**
 * Type-only brand for declaring an input or output shape at the type level.
 * The runtime value is an empty object — the framework does no runtime
 * validation of inputs. Apps can wire real runtime checks via the registry's
 * `validateInput` hook.
 */
export interface InputSchema<T> {
  readonly __brand?: T;
}

/**
 * Lazy-importer signature for an entry-point component. Mirrors the shape
 * `React.lazy` accepts (default-exported component) but is normalized at the
 * runtime to also accept a module that exports the component directly.
 */
export type LazyEntryComponent<TInput> = () => Promise<
  | { default: UiComponent<ModuleEntryProps<TInput, any>> }
  | UiComponent<ModuleEntryProps<TInput, any>>
>;

/**
 * Mount surfaces a module entry can be rendered on. Used by hosts that
 * embed modules through different runtimes to reject mismatched mounts
 * at the type level (and at validation time):
 *
 *   - `"journey"` — the entry depends on the journey surface: it
 *     receives the `exit` / `goBack` / `goForward` props and the
 *     component typically calls them. A panel like this rendered in a
 *     composition zone would silently drop those calls.
 *   - `"composition"` — the entry is suitable for a composition zone
 *     (driven by a selector, communicates via `useCompositionDispatch`
 *     / `useCompositionEmit`).
 *
 * Entries that omit {@link ModuleEntryPointBase.mountKinds} default to
 * both surfaces — the conservative choice that keeps existing modules
 * working unchanged. Entries that declare a narrow list are filtered
 * out of incompatible mount surfaces' typed unions; e.g. a composition
 * selector cannot return a `module-entry` resolution targeting an
 * entry declared `mountKinds: ["journey"]`.
 *
 * Future surfaces (federated remotes, modal hosts, …) extend this
 * union without changing existing entries.
 */
export type MountKind = "journey" | "composition";

/** Fields shared by both eager and lazy entry-point variants. */
interface ModuleEntryPointBase<TInput> {
  /** Type-level declaration of the input shape. Pure inference aid. */
  readonly input?: InputSchema<TInput>;
  /**
   * Mount surfaces this entry is intended for. See {@link MountKind}.
   * Omit (or pass `undefined`) to allow every surface. Encoded as a
   * tuple literal so per-host typed unions can filter on the literal
   * members; `defineEntry`'s `const` type parameter captures the
   * tuple narrowly.
   */
  readonly mountKinds?: readonly MountKind[];
  /**
   * Opt in to "go back" support.
   *   'preserve-state' — history pops; journey state is untouched.
   *   'rollback'       — history pops AND journey state reverts to the snapshot
   *                      taken before this step was entered.
   *   false (default)  — no `goBack` prop is supplied to the component.
   */
  readonly allowBack?: "preserve-state" | "rollback" | false;
  /**
   * Optional factory that derives this entry's input from the current
   * journey state every time the step is entered (push, pop / `goBack`,
   * invoke return, initial start). When present, the runtime ignores the
   * `input` value a transition handler placed on `next` and replaces it
   * with `buildInput(state)`.
   *
   * Use this for steps that present data accumulated by earlier exits —
   * back-navigating to a previous step then sees the up-to-date values
   * the user already entered, instead of the stale snapshot the step was
   * first pushed with.
   *
   * The `state` parameter is typed `unknown` at the module surface —
   * modules don't know which journey hosts them, so authors annotate
   * explicitly: `buildInput: (state) => { const s = state as MyState; … }`,
   * or narrow via a parameter annotation when TS allows it. Pure,
   * synchronous, called on the hot path; do not allocate work here that
   * should run inside the component instead.
   */
  readonly buildInput?: (state: unknown) => TInput;
}

/**
 * Eager entry — a directly-bound React component. The historic shape; works
 * unchanged for every existing consumer.
 */
export interface EagerModuleEntryPoint<TInput> extends ModuleEntryPointBase<TInput> {
  /** Component to render when this entry is opened. Receives `ModuleEntryProps<TInput, …>`. */
  readonly component: UiComponent<ModuleEntryProps<TInput, any>>;
  readonly lazy?: never;
  readonly fallback?: never;
}

/**
 * Lazy entry — a dynamic-import factory. Hosts wrap the resolved component
 * in `React.lazy` + `<Suspense>` and expose an idempotent `preload()` so
 * speculative prefetching is one call, not a hand-written wrapper component.
 */
export interface LazyModuleEntryPoint<TInput> extends ModuleEntryPointBase<TInput> {
  readonly component?: never;
  /** Dynamic import of the entry's component. Called at most once per descriptor. */
  readonly lazy: LazyEntryComponent<TInput>;
  /**
   * Suspense fallback rendered while the lazy chunk is loading. Hosts wrap
   * the resolved component in `<Suspense fallback={fallback ?? null}>`. Only
   * meaningful for lazy entries — eager entries don't suspend.
   */
  readonly fallback?: UiNode;
}

/**
 * A single typed entry point on a module — either eager (`component`) or
 * lazy (`lazy`). The `?: never` idiom on each branch makes the two forms
 * mutually exclusive at the type level.
 */
export type ModuleEntryPoint<TInput> = EagerModuleEntryPoint<TInput> | LazyModuleEntryPoint<TInput>;

/**
 * Typed declaration of a single exit point — describes the output payload
 * type the exit can emit. Can be omitted for void exits.
 */
export interface ExitPointSchema<TOutput> {
  readonly output?: InputSchema<TOutput>;
}

/**
 * Shared exit contract — an `ExitPointSchema` with a stable identity
 * (`kind`) and an optional `StandardSchemaV1` for runtime payload
 * validation. Modules that emit semantically-equivalent exits across
 * boundaries (e.g. multiple modules each fire `cancelled`) reference the
 * same contract value as their exit's schema; the journey runtime then
 * treats them uniformly:
 *
 *   1. **Wildcard transitions** keyed by exit name (`wildcardTransitions`)
 *      receive a single typed `output` because the contract is the same
 *      across modules — no per-module narrowing.
 *   2. **Runtime validation**: when a contract carries a `schema`, the
 *      runtime validates the payload at every `exit()` emit and aborts
 *      with `exit-payload-invalid` on issues. Async schemas are rejected
 *      at emit time with `exit-payload-invalid-async`.
 *
 * The contract object identity is what makes consistency checks cheap —
 * the registry can verify two modules use the same exit contract by
 * reference equality, not name matching.
 */
export interface ExitContract<TOutput> extends ExitPointSchema<TOutput> {
  /**
   * Stable identity, e.g. `"cancelled"`. Required (and absent on plain
   * `ExitPointSchema`), so `kind` doubles as the structural
   * discriminator `isExitContract` checks for.
   */
  readonly kind: string;
  /**
   * Optional Standard Schema (`StandardSchemaV1`-compatible — works with
   * Zod, Valibot, ArkType, ...). When present, the runtime validates
   * exit payloads at emit time. Synchronous validators only; async
   * schemas abort the journey with reason `exit-payload-invalid-async`.
   */
  readonly schema?: StandardSchemaLike<TOutput>;
}

/**
 * Structural-typed re-declaration of `StandardSchemaV1`'s `~standard`
 * shape, narrowed to the slice the journey runtime actually calls. Lets
 * us avoid a hard import of `@standard-schema/spec` at the type position
 * (the spec package is a dep, but core re-exports `ExitContract` to
 * runtime packages that may have stricter type-resolution settings).
 */
export interface StandardSchemaLike<TOutput> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardSchemaResult<TOutput> | Promise<StandardSchemaResult<TOutput>>;
    readonly types?: { readonly input: unknown; readonly output: TOutput };
  };
}

export type StandardSchemaResult<TOutput> =
  | { readonly value: TOutput; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> };

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
}

/** Mapping of entry name → {@link ModuleEntryPoint}. */
export type EntryPointMap = Readonly<Record<string, ModuleEntryPoint<any>>>;

/** Mapping of exit name → {@link ExitPointSchema}. */
export type ExitPointMap = Readonly<Record<string, ExitPointSchema<any>>>;

/**
 * Props passed to a module's entry component by the host (JourneyOutlet,
 * ModuleTab, a test harness). `exit` is typed against the module's own exit
 * vocabulary, so passing the exits const from the module is authoritative.
 */
export interface ModuleEntryProps<TInput, TExits extends ExitPointMap = {}> {
  readonly input: TInput;
  /** Emit an exit. Name + payload are cross-checked against `TExits`. */
  readonly exit: ExitFn<TExits>;
  /**
   * Host-provided "go back" callback. Present only when both the current
   * entry declared `allowBack` and the host has a prior step in history.
   */
  readonly goBack?: () => void;
  /**
   * Host-provided "redo" callback — inverse of `goBack`. Present
   * only when the future stack has a redo target. Most shells wire
   * Forward at the shell level (browser button); this is for steps
   * that surface an in-page redo control.
   */
  readonly goForward?: () => void;
}

/**
 * Typed exit callback. The payload argument is required when the schema
 * declares a non-void output, and absent when the schema is void.
 */
export type ExitFn<TExits extends ExitPointMap> = <K extends keyof TExits & string>(
  name: K,
  ...args: ExitOutputArg<TExits[K]>
) => void;

type ExitOutputArg<S> =
  S extends ExitPointSchema<infer T> ? ([T] extends [void] ? [] : [output: T]) : [];

/**
 * A single navigation item contributed by a module.
 *
 * Four generics let the host opt into stricter typing:
 *
 * - `TLabel extends string = string` — tighten `label` to an i18n key union
 *   so typos fail at compile time. Widens to `string` by default for
 *   apps that don't use typed translation keys.
 *
 * - `TContext = void` — type of the context object passed to dynamic `to`
 *   resolvers. Defaults to `void`, meaning `to` must be a plain string;
 *   set `TContext` to an object (e.g. `{ workspaceId: string }`) to enable
 *   `to: (ctx) => string` and resolve hrefs at render time via
 *   {@link resolveNavHref}.
 *
 * - `TMeta = unknown` — bag of app-owned metadata. Use this for
 *   framework-neutral fields the library shouldn't opinionate on
 *   (permission actions, badges, analytics ids, feature flags). Cast through
 *   `unknown` / intersect with your own shape, or alias
 *   `NavigationItem<…, …, MyMeta>` once and use that throughout.
 *
 * - `TAction = never` — app-owned dispatchable action shape. Nav items that
 *   should fire a non-navigation intent (start a journey, open a module as a
 *   tab, raise a modal) carry the intent here. The library treats `action`
 *   as opaque, exactly like `meta` — the shell's navbar renderer switches on
 *   `action.kind` and dispatches. Defaults to `never`, which removes the
 *   field from the surface.
 *
 * Typical local alias in a host app:
 *
 * ```ts
 * import type { NavigationItem } from "@modular-react/core"
 * import type { ParseKeys } from "i18next"
 *
 * interface NavCtx { workspaceId: string }
 * interface NavMeta { badge?: "beta" | "new" }
 * type NavAction =
 *   | { kind: "open-module"; moduleId: string; entry: string }
 *   | { kind: "journey-start"; journeyId: string; buildInput?: (ctx: NavCtx) => unknown }
 *
 * export type AppNavItem = NavigationItem<ParseKeys, NavCtx, NavMeta, NavAction>
 * ```
 */
export interface NavigationItem<
  TLabel extends string = string,
  TContext = void,
  TMeta = unknown,
  TAction = never,
> {
  /** Display label — narrow `TLabel` to an i18n key union for compile-time validation. */
  readonly label: TLabel;

  /**
   * Route path to navigate to.
   *
   * - A plain string is used as-is (e.g. `"/settings"`).
   * - A function receives the render-time context (`TContext`) and returns
   *   the final href — use this for workspace-scoped paths, feature-flagged
   *   URLs, or anything the module can't know statically. Call
   *   {@link resolveNavHref} from the shell (or do it inline) to compute
   *   the string.
   */
  readonly to: TContext extends void ? string : string | ((ctx: TContext) => string);

  /** Icon — either a string identifier or a component */
  readonly icon?: string | UiComponent<{ className?: string }>;

  /** Grouping key for organizing nav items (e.g. "finance", "admin") */
  readonly group?: string;

  /** Sort order within group (lower = higher priority) */
  readonly order?: number;

  /** If true, item is registered but hidden from default nav rendering */
  readonly hidden?: boolean;

  /**
   * App-owned metadata. The library treats this as opaque — use it for
   * permission actions, feature flags, badges, analytics ids, or anything
   * else that's app- rather than library-shaped. Type via the `TMeta`
   * generic (aliasing `NavigationItem<…, …, MyMeta>` once is the typical
   * pattern).
   */
  readonly meta?: TMeta;

  /**
   * App-owned dispatchable action. Use this instead of overloading `meta`
   * when a nav entry should fire an intent at click time (e.g. start a
   * journey, open a module as a tab). The library treats `action` as
   * opaque — the shell's navbar renderer switches on `action.kind` and
   * dispatches. Defaulted to `never`, so the field is absent from the
   * surface until an app opts in via `TAction`.
   */
  readonly action?: TAction;
}

/**
 * Structural upper bound used by every `TNavItem extends …` constraint in
 * this library — NOT `NavigationItem`, which resolves to
 * `NavigationItem<string, void, unknown>` and narrows `to` to `string`.
 *
 * `(ctx: never) => string` accepts any concrete `(ctx: TContext) => string`
 * via function-parameter contravariance (`never` is a subtype of every type).
 * That lets consumers pass `NavigationItem<Keys, Ctx, Meta>` as `TNavItem`
 * without casts, while plain `to: string` still satisfies the bound.
 */
export interface NavigationItemBase {
  readonly label: unknown;
  readonly to: string | ((ctx: never) => string);
  readonly icon?: unknown;
  readonly group?: string;
  readonly order?: number;
  readonly hidden?: boolean;
  readonly meta?: unknown;
  readonly action?: unknown;
}

export interface ModuleLifecycle<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
> {
  /** Called once when the module is registered in the registry */
  onRegister?(deps: TSharedDependencies): void | Promise<void>;

  /** Called when the module's route subtree is first mounted */
  onMount?(deps: TSharedDependencies): void | Promise<void>;

  /** Called when the module's route subtree is unmounted */
  onUnmount?(): void | Promise<void>;
}

/**
 * Descriptor for a lazily-loaded module.
 * The full module descriptor is loaded on demand when the route is first visited.
 *
 * ## What a lazy module can and cannot contribute
 *
 * Lazy modules are loaded by the router on first navigation to their
 * `basePath`. By the time they load, the registry has already produced the
 * navigation manifest, the resolved slots, and the module entries — so only
 * the loaded descriptor's `createRoutes()` is honored.
 *
 * Anything else you put on the loaded descriptor is silently ignored. The
 * runtime logs a warning at load time if it detects one of these fields:
 *
 * - `navigation` — not collected; would never appear in `useNavigation()`.
 * - `slots` / `dynamicSlots` — not merged into the resolved slots.
 * - `lifecycle.onRegister` — not run; registration already happened.
 * - `zones` / `component` — only meaningful for workspace-style
 *   (non-routed) modules, which must be registered eagerly.
 * - `requires` / `optionalRequires` — not validated post-hoc against shared
 *   deps.
 *
 * For anything that needs to land in the manifest, register the module
 * eagerly (`registry.register(module)`). Use `registerLazy` only for the
 * pure route-code-splitting case where the module contributes **routes
 * only** and everything else lives in an eagerly-registered shell.
 */
export interface LazyModuleDescriptor<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
  TNavItem extends NavigationItemBase = NavigationItem,
> {
  /** Unique module identifier */
  readonly id: string;

  /** Base path prefix — used to create a catch-all route that triggers loading */
  readonly basePath: string;

  /** Dynamic import that returns the full module descriptor */
  readonly load: () => Promise<{
    default: ModuleDescriptor<TSharedDependencies, TSlots, TMeta, TNavItem>;
  }>;
}

/**
 * {@link ModuleDescriptor} with every generic defaulted except `TNavItem`.
 *
 * Shorthand for the `ModuleDescriptor<any, any, any, TNavItem>` pattern
 * that shows up in generic plumbing (manifest builders, registry
 * signatures, test helpers) where only the nav item shape matters and
 * the other parameters would be filler.
 *
 * Prefer the fully-typed `ModuleDescriptor<TDeps, TSlots, TMeta, TNavItem>`
 * at user-facing boundaries — this alias is intended for internal framework
 * code and type-utility sites.
 *
 * @example
 * ```ts
 * // Accept modules that share a nav item shape but may differ on deps/slots.
 * function collectNav<TNavItem extends NavigationItemBase>(
 *   modules: readonly AnyModuleDescriptor<TNavItem>[],
 * ) {
 *   return modules.flatMap((m) => m.navigation ?? [])
 * }
 * ```
 */
// Uses `any` (not `Record<string, any>` / `SlotMap` / `Record<string, unknown>`)
// for the filled-in generics on purpose: `any` is bivariant, so
// `AnyModuleDescriptor<TNavItem>` accepts `ModuleDescriptor<TDeps, TSlots, …,
// TNavItem>` for arbitrary concrete `TDeps` / `TSlots`. With the stricter
// constraint defaults, TS refuses the assignment at generic boundaries —
// which defeats the whole point of the alias.
export type AnyModuleDescriptor<TNavItem extends NavigationItemBase = NavigationItem> =
  ModuleDescriptor<any, any, any, TNavItem>;
