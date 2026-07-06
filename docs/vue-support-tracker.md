# Vue support initiative: plan and tracker

Status: **Phase 2 in progress** (Phase 0: PR-01, PR-02, PR-03 landed; Phase 1: PR-10, PR-11, PR-12 landed; Phase 2: PR-20, PR-21, PR-22 landed). Last updated: 2026-07-06.
Background and feasibility reasoning: [vue-port-analysis.md](./vue-port-analysis.md).

This document is the single source of truth for the multi-PR effort to bring the framework to Vue 3, including full Journeys and Compositions support. Update the status board and per-PR checkboxes as PRs land; record decision outcomes in the Decisions section.

## Goal

Ship a Vue 3 + vue-router package family with feature parity to `@react-router-modules/*`:

- Module contract: `defineModule`, dependency declaration and validation, slots/zones, navigation manifest.
- Runtime: registry, route building via `router.addRoute`, auth guards, `useZones`/`useRouteData` over `route.meta`.
- Journeys: the full engine (transitions, branching, persistence, rewind) with a Vue outlet.
- Compositions: multi-module screens with scoped stores and a Vue outlet.
- Catalog harvesting of Vue descriptors.
- Testing helpers, a CLI scaffolder, a runnable example app, and getting-started plus shell-patterns docs.

## Non-goals (for this initiative)

- Nuxt integration. Tracked as a stretch phase (PR-52) but explicitly not required for 1.0. The initial target is plain Vue SPA + vue-router.
- Rebuilding the catalog portal SPA in Vue. It ships as static HTML; the existing React-built portal harvests Vue descriptors fine.
- Vue 2 or Options-API-first ergonomics. Composition API and `<script setup>` only.
- SSR frameworks other than what vue-router itself supports.

## Target package map

| New package                 | Mirrors                                                    | Contents                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@modular-vue/vue`          | `@modular-react/react`                                     | Injection keys and providers (modules, navigation, slots), store composables, scoped-store composable, error-capture wrapper, entry resolution via `defineAsyncComponent`, module-exit |
| `@modular-vue/journeys`     | React parts of `@modular-react/journeys`                   | Journey provider, instance composables, outlet, module-tab, wait-for-exit                                                                                                              |
| `@modular-vue/compositions` | React parts of `@modular-react/compositions`               | Composition provider, composables, outlet                                                                                                                                              |
| `@modular-vue/testing`      | `@modular-react/testing` + `@react-router-modules/testing` | `resolveModule`, `createMockStore`, `preloadEntries`, `renderModule`, `renderJourney`, mock store (Vue folds both React testing packages into one)                                     |
| `@modular-vue/core`         | `@react-router-modules/core`                               | `defineModule` (with `createRoutes(): RouteRecordRaw[]`), `defineSlots`, shared composable context, scoped store, types                                                                |
| `@modular-vue/runtime`      | `@react-router-modules/runtime`                            | Registry, route-builder, app/providers as a Vue plugin, zones, active-zones, route-data                                                                                                |
| `@modular-vue/cli`          | `@react-router-modules/cli`                                | `cli-core` preset + SFC templates                                                                                                                                                      |

Shared engine packages under the `@modular-frontend` scope (decision D2, resolved). `journeys-engine` and `compositions-engine` are both extracted:

| New package                             | Extracted from                | Contents                                                                                                                                                                       |
| --------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@modular-frontend/journeys-engine`     | `@modular-react/journeys`     | `runtime.ts`, `validation.ts`, `define-journey.ts`, `define-transition.ts`, `persistence.ts`, `select-module.ts`, `simulate-journey.ts`, `handle.ts`, `types.ts`, `testing.ts` |
| `@modular-frontend/compositions-engine` | `@modular-react/compositions` | `runtime.ts`, `stores.ts`, `validation.ts`, `define-composition.ts`, `types.ts`                                                                                                |

`mount-adapter.ts` stays in `@modular-react/journeys`, not the engine: `createJourneyMountAdapter` supplies `Outlet: JourneyOutlet` (a React component), so it is binding-specific glue over the neutral `RuntimeMountAdapter` seam rather than engine logic.

`@modular-react/journeys` and `@modular-react/compositions` keep their public API by re-exporting the engine, so existing React users see no breaking change.

## Decisions

Record the outcome inline when made. Blockers are marked per PR.

| ID  | Decision                                                                                                                             | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Status                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| D1  | npm scopes for the Vue family and repo positioning (does the `modular-react` repo host Vue packages, or does it get a neutral name?) | Keep this repo, soften the README tagline. Use a single `@modular-vue` scope for the whole Vue family (framework binding, router integration, testing, cli); do not add a separate `@vue-router-modules` scope, since Vue has only one router and the router name carries no disambiguating information. Package names are unprefixed (`@modular-vue/core`, `@modular-vue/runtime`, `@modular-vue/cli`, `@modular-vue/vue`, `@modular-vue/testing`); the router-integration core and runtime take the plain `core`/`runtime` names because the router-neutral core lives under `@modular-frontend/core`, so there is no `@modular-vue/core` framework-alias to collide with. Reserve the scope on npm before any code PR. | resolved: single `@modular-vue` scope                                                                   |
| D2  | Scope and name for the extracted engines                                                                                             | A neutral scope shared by both families, e.g. `@modular-frontend`, holding `journeys-engine` and `compositions-engine`. Avoid putting "react" or "vue" in the name.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | resolved: `@modular-frontend` (core in #54; `journeys-engine` in PR-02; `compositions-engine` in PR-03) |
| D3  | Store story for Vue templates: core store vs Pinia                                                                                   | Scaffold with the core `createStore` (zustand-shaped, already the framework contract) and document Pinia interop in a guide section. Do not take a Pinia dependency in runtime packages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | open                                                                                                    |
| D4  | Authoring style inside Vue library packages: SFC vs `defineComponent` + render functions                                             | `defineComponent` + `h()` for library internals (no `@vitejs/plugin-vue` needed in package builds, better generics); SFCs in CLI templates and the example app, since that is what users write.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | open                                                                                                    |
| D5  | Minimum supported versions                                                                                                           | Vue ^3.5, vue-router ^4.5, Node 22+, aligned with the React 19 / Node 22 baseline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | open                                                                                                    |
| D6  | Is Nuxt in scope for 1.0?                                                                                                            | No. Ship SPA-first, gauge demand, then decide on PR-52.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | open                                                                                                    |

## Phase plan

Sizes: S (under ~300 LOC changed), M (~300-1000), L (over 1000, mostly mechanical or mostly moves). Every PR includes its own tests, passes `pnpm lint` / `typecheck` / `test`, and updates this tracker.

### Phase 0: shared foundation (React-only releases, no Vue code)

Everything here is useful to the existing React packages on its own and ships as normal releases.

**PR-01 (S): Neutralize renderable types in `@modular-react/core`.** Done in #54.
Landed as a full extraction rather than in-place aliasing: the framework-neutral guts of `@modular-react/core` moved to a new `@modular-frontend/core` package, with the `ComponentType` / `ReactNode` references collapsed to a two-line `UiComponent` / `UiNode` seam in `ui-types.ts` and `@types/react` dropped. `@modular-react/core` is now a thin facade re-exporting the neutral surface, so consumers are unchanged. This also resolves D2 (scope = `@modular-frontend`).
Acceptance: met. Zero React references in `@modular-frontend/core`; all core tests and both router families' type tests pass unchanged.

**PR-02 (L, mostly moves): Extract `@modular-frontend/journeys-engine`.** Done.
Moved the pure files plus their tests (`runtime*.test.ts`, `validation.test.ts`, `define-transition.test*`, `persistence.test*`, `select-module.test*`, `simulate-journey*.test*`, `handle.test*`, `wildcard-transitions.test*`, `register-options.test*`, `invoke*.test.ts`, `build-input.test.ts`, `mount-kinds.test-d.ts`). `@modular-react/journeys` re-exports the engine and keeps the React files (`outlet.tsx`, `module-tab.tsx`, `provider.tsx`, `plugin.tsx`, `mount-adapter.ts`, `instance-hooks.ts`, `use-journey-state.ts`, `use-wait-for-exit.ts`), plus a thin `testing.ts` re-export of the engine's `/testing` entry.
Deviations from the original plan, both forced by the code:

- `mount-adapter.ts` stayed in the binding (see the package-map note): it supplies the React `JourneyOutlet` to the mount adapter.
- `JourneyNavContribution.icon` used the `React.ComponentType` namespace; it moved to the neutral `UiComponent` seam, matching how `NavigationItem.icon` was already neutralized in #54. Source-compatible for authors (a React component still satisfies `UiComponent`).

The engine keeps error-message prefixes as `[@modular-react/journeys]` / `[@modular-react/journeys/testing]` on purpose: they name the package users import and the guidance strings point at real import paths, so the moved tests pass unmodified.
Acceptance: met. The engine has no React peer or dev dependency (deps: `@modular-frontend/core`; `happy-dom` for the storage-backed persistence tests). `@modular-react/journeys` public export surface is unchanged. Test counts preserved: 346 in the engine + 72 in the binding = the pre-split total.

**PR-03 (L, mostly moves): Extract `@modular-frontend/compositions-engine`.** Done.
Moved the pure files (`runtime.ts`, `stores.ts`, `validation.ts`, `define-composition.ts`, `types.ts`) plus their non-`.tsx` tests (`runtime.test.ts`, `stores.test.ts`, `validation.test.ts`, `define-composition.test-d.ts`, `mount-kinds.test-d.ts`). `@modular-react/compositions` re-exports the engine and keeps the React files (`outlet.tsx`, `provider.tsx`, `plugin.tsx`, `hooks.ts`) plus all `.tsx` tests. `stores.ts` kept its `useSyncExternalStore`-motivated referential-stability logic as-is (it is still pure); only the doc comment naming `React.useSyncExternalStore` remains, and it stays descriptive.
One React reference had to be neutralized, matching how #54 handled `NavigationItem.icon` and PR-02 handled `JourneyNavContribution.icon`: `CompositionZoneDescriptor.fallback` used `React.ComponentType`; it moved to the neutral `UiComponent` seam from `@modular-frontend/core`. Source-compatible for authors (a React component still satisfies `UiComponent`) and the outlet still renders it as a JSX element in the binding.
The engine keeps error-message prefixes as `[@modular-react/compositions]` on purpose, matching PR-02: they name the package users import.
Acceptance: met. The engine has no React peer or dev dependency (deps: `@modular-frontend/core`; `happy-dom` for the test environment). `@modular-react/compositions` public export surface is unchanged. Test counts preserved: 52 in the engine + 63 in the binding = the pre-split total of 115.

**PR-04 (M): Make `cli-core` framework-pluggable.**
Today `cli-core/src/templates/*` emit React/JSX source and the store template emits zustand. Move framework-specific template bodies behind the preset interface (`preset.ts`) so a preset supplies `shell`, `module`, `journey`, `store`, `app-shared` bodies, and `cli-core` keeps only the command engine, `naming.ts`, `transform.ts`, `workspace.ts`, and `runtime-versions.ts`. Rehome the React template bodies into the two existing router CLIs (or a shared react-templates module they both import).
Acceptance: both existing CLIs produce byte-identical scaffolds before and after (snapshot the generated tree in a test); `cli-core` no longer contains JSX-emitting strings.

**PR-05 (S): CI, publish, and workspace plumbing for the new scopes.**
Extend `publish.yml` / version-bump automation and `ensure-labels.yml` to cover the new package names; confirm `pnpm-workspace.yaml` globs already match (they do: `packages/*`); reserve the npm scopes (D1) and publish `0.0.0` placeholders if squatting is a concern.
Acceptance: a dry-run publish lists all new packages; CI runs their (empty) test suites.

### Phase 1: Vue binding layer

**PR-10 (M): `@modular-vue/vue` part 1: stores and context.** Done.
New `packages/vue` (`@modular-vue/vue`, `0.1.0`) with the repo's standard package skeleton: `vite build` + `vite-plugin-dts` (rollup types), `vitest` + `happy-dom` + `@vue/test-utils`, `tsc --noEmit` typecheck, mirroring the `@modular-react/react` conventions. Depends on the neutral engine `@modular-frontend/core` (not the React facade) plus a `vue ^3.5` peer.

Store bridge (`store-ref.ts`): `storeRef` / `reactiveServiceRef` wrap a framework-neutral `Store<T>` / `ReactiveService<T>` in a `shallowRef`, pushing snapshots from the source's `subscribe` callback and unsubscribing on `onScopeDispose` — the Vue analog of React's `useSyncExternalStore`. `shallowRef`'s `Object.is` dedupe gives selector equality for free. Ported pieces:

- `createSharedComposables` (analog of `createSharedHooks`): `useStore`, `useService`, `useReactiveService`, `useOptional`. Reactive accessors return a `Ref`; plain `useService` returns the value directly.
- `createScopedStore` with a `useScoped` composable (analog of `scoped-store.ts`).
- Typed `InjectionKey`s + `provide*` helpers + `use*` composables for the modules (`useModules`, `getModuleMeta`), navigation (`useNavigation`), and slots (`useSlots`, `useRecalculateSlots`, `DynamicSlotsProvider`, `createSlotsSignal`) contexts.

Deviations from the plan, both forced by the framework:

- The plan listed a `useStoreSelector`; the React binding folds the selector into an overload of `useStore(key, selector?)`, so the Vue port keeps the single overloaded `useStore` for a faithful surface rather than adding a second name.
- `DynamicSlotsProvider` is authored with `defineComponent` + a render function (per decision D4's recommendation for library internals), not an SFC — no `@vitejs/plugin-vue` in the package build.

The injection contexts that are set once at resolve time (modules, navigation, plain services) return plain values; only genuinely reactive sources (`useStore`, `useReactiveService`, `useOptional`, `useScoped`, `useSlots`) return refs. Error-message prefixes are `[@modular-vue/vue]`.
Acceptance: met. 33 tests across 6 files mirror the React suites case-for-case (`context.test.tsx`, `context-reactivity.test.tsx`, `modules-context.test.tsx`, `navigation-context.tsx`, `slots-context.test.tsx`, `scoped-store.test.tsx`), plus a `.test-d.ts` porting the typed-label / typed-meta navigation assertions. Added reactivity tests cover subscribe/unsubscribe on unmount (via a listener-counting store) and selector equality (a watcher that stays silent on unrelated updates). Full workspace typecheck (113 tasks) and build pass.

**PR-11 (M): `@modular-vue/vue` part 2: rendering pieces.** Done.
Added `resolve-entry.ts`, `error-boundary.ts`, `module-exit.ts`, `module-route.ts` to `packages/vue`, each the Vue analog of the same-named React file. Store/binding conventions match PR-10 (`defineComponent` + render functions for library internals per D4; error-message prefixes `[@modular-vue/vue]`).

- `resolve-entry.ts` — `resolveEntryComponent` / `preloadEntry`, `ResolvedEntry` (`{ Component, preload }`), memoized by entry identity via a `WeakMap`. Lazy entries wrap `defineAsyncComponent` over a shared `cachedImport` closure so an explicit `preload()` warms the same import the async wrapper awaits, the importer fires once across preload + render, `.default` is normalized, and a sync-throwing importer is trapped as a cached rejection.
- `error-boundary.ts` — `ModuleErrorBoundary` via `onErrorCaptured` returning `false` to stop propagation (analog of the React class boundary's `getDerivedStateFromError` + `componentDidCatch`); an `error` ref drives the render swap to the notice / custom fallback.
- `module-exit.ts` — `ModuleExitProvider`, `useModuleExit`, `useModuleExitDispatcher`, `moduleExitKey`, and the `ModuleExitEvent` / `ModuleExitHandler` types. The dispatcher is provided by identity (captured once at setup, matching the modules / navigation contexts) so `useModuleExitDispatcher` returns the exact handler.
- `module-route.ts` — `ModuleRoute` component + `ModuleRouteExitEvent` alias. Entry resolution (single-entry auto-resolve, unknown-entry / multi-entry / no-entry-points notices, legacy `component` fallback) runs once at setup; the render function re-runs for `input` / `goBack` changes.

Deviations from the plan, all forced by the framework:

- `resolve-entry.ts` drops React.lazy's synchronous-thenable "no fallback flash after preload" trick: it is specific to React.lazy's `_init` status flow. Vue's `defineAsyncComponent` resolves through its own async state, so the post-preload cached path is a plain resolved promise. The dedupe / once-only-import / trap-sync-throw guarantees are all preserved; only the microtask-flash optimization is N/A.
- `ModuleRoute` renders the eager `entryPoint.component` directly (mirroring the React source, which does the same) rather than routing through `resolveEntryComponent`; lazy-entry hosting stays with the journey outlet.
- Errors caught by the boundary surface on the re-render the `error` ref queues, so the two error-UI tests `await nextTick()` before asserting (React's synchronous `setState`-from-`getDerivedStateFromError` needs no await).

Acceptance: met. 36 new tests across `resolve-entry.test.ts` (+`.test-d.ts`), `error-boundary.test.ts`, `module-exit.test.ts`, `module-route.test.ts` port the React suites case-for-case (React-only StrictMode / Suspense-fallback-flash cases excepted). Full package suite is 69 tests; workspace typecheck and `vite build` (JS + dts) pass. `@modular-vue/vue` keeps its `@modular-frontend/core` + `vue ^3.5` peer surface.

**PR-12 (S): `@modular-vue/testing`.** Done.
New `packages/vue-testing` (`@modular-vue/testing`, `0.1.0`) with the repo's standard package skeleton (`vite build` + `rolldown-plugin-dts`, `vitest`, `tsc --noEmit`), mirroring `@modular-react/testing`. Depends on `@modular-frontend/core`, `@modular-frontend/testing`, and `@modular-vue/vue` (the binding, for the preload path) plus a `vue ^3.5` peer.

Rather than duplicate the framework-neutral helpers per binding, the port extracted them into a shared package:

- `@modular-frontend/testing` (`0.1.0`, new) holds `createMockStore` and `resolveModule` (+ `ResolveModuleOptions` / `ResolveModuleResult`). Both are pure over `@modular-frontend/core` (slot merging, dynamic-slot evaluation, `onRegister`, `ModuleEntry` assembly) with no UI-framework dependency. `@modular-react/testing` and `@modular-vue/testing` re-export both; `@react-router-modules/testing` and `@tanstack-react-modules/testing` re-export `resolveModule` (their `createMockStore` stays local — it wraps zustand's `createStore`, not the core store). So a fix to slot resolution lands in one place. This mirrors the earlier `journeys-engine` / `compositions-engine` extractions.
- `preload-entries.ts` stays per-binding: `preloadEntries` walks each module's `entryPoints` and calls `preloadEntry` (re-exported from `@modular-vue/vue`) for every `lazy:` entry, `Promise.all`-ing them so a single rejection doesn't leak sibling unhandled rejections. This is the only file that touches the binding layer.

Deviation from the React source, forced by the framework:

- The doc comment and the "resolves synchronously" test drop React.lazy's synchronous-thenable trick, matching the PR-11 `resolve-entry.ts` deviation. Vue's `defineAsyncComponent` resolves through its own async state on mount, so `preloadEntries` warms the resolver's `WeakMap` cache (saving the re-import) but not the extra microtask. The React `preloadEntries` test that asserts synchronous resolution is replaced by one asserting the post-preload cached path replays without re-importing; the `vi.mock` test asserts on the normalized component's `displayName` directly (Vue's `preload()` resolves to the unwrapped `default`, where React's resolved to the `{ default }` module record).

Error-free surface: `createMockStore`, `resolveModule` (+ its option/result types), `preloadEntries`, and a re-exported `preloadEntry` for a single import surface.
Acceptance: met. 15 tests total — `resolve-module.test.ts` (6) now lives in `@modular-frontend/testing`, and each binding's `preload-entries.test.ts` (9) is ported case-for-case bar the React-only synchronous-thenable case. Typecheck and `vite build` (JS + dts) pass for all three packages.

### Phase 2: vue-router family

**PR-20 (M): `@modular-vue/core`.** Done.
New `packages/vue-router-core` (`@modular-vue/core`, `0.1.0`) with the repo's standard skeleton (`vite build` + `rolldown-plugin-dts`, `vitest`, `tsc --noEmit`). Depends on `@modular-frontend/core`, `@modular-vue/vue`, a `vue ^3.5` peer, and a `vue-router ^4.5` peer (D5).

- `types.ts` — vue-router `ModuleDescriptor` whose `createRoutes()` returns `RouteRecordRaw | RouteRecordRaw[]` (the React source returns `RouteObject`), plus `LazyModuleDescriptor` and the `AnyModuleDescriptor` shorthand, mirroring `react-router-core/types.ts` field-for-field. `LazyModuleDescriptor` follows the React Router shape (`{ id, basePath, load }` yielding a full `createRoutes()` subtree), not the frozen-tree TanStack shape: vue-router's `router.addRoute()` lets the runtime graft the loaded subtree in on first visit.
- `define-module.ts` / `define-slots.ts` — the same identity functions as `react-router-core`, typed over the vue-router descriptor.
- `route-meta.ts` — the `RouteMeta` convention the runtime (PR-23) reads. vue-router's `meta` is the analog of React Router's arbitrary `handle` channel, so zones and per-route static data ride on `meta`; a route merges deepest-wins across `useRoute().matched`. Exports a `ModuleRouteMeta<TZones>` helper (named zone keys typed and optional, arbitrary route data allowed) and documents the app-level `declare module "vue-router" { interface RouteMeta … }` augmentation.

Deviations from the plan, both structural, none behavioral:

- The plan listed `is-store-api.ts` and `scoped-store.ts` as new files to mirror. In the React family those are zustand-specific reimplementations (`react-router-core` reimplements `createSharedHooks` / `createScopedStore` against zustand and does not depend on `@modular-react/react`). Vue has no zustand split: `@modular-vue/vue` already provides `createSharedComposables`, `createScopedStore`, and the `provide*` helpers over the neutral `Store<T>`, and the detection helpers (`isStoreApi` / `isReactiveService` / `separateDeps`) already live in `@modular-frontend/core`. So `@modular-vue/core` re-exports those rather than duplicating them (PR-20 depends on PR-10 for exactly this reason). The public surface still matches `react-router-core`'s index name-for-name (composable names are the Vue analogs: `createSharedComposables` for `createSharedHooks`, `sharedDependenciesKey` / `provideSharedDependencies` for `SharedDependenciesContext`).
- `define-module.ts` mirrors `react-router-core`'s four-generic signature (no `TDescriptor` literal-preservation generic); if journey entry/exit inference needs the literal form later it will surface in PR-30, and this keeps parity with the React router core it mirrors.

Acceptance: met. 15 tests — `define-slots.test.ts` (2, ported from the React source), `index.test.ts` (3, asserting the re-export barrel resolves at runtime), plus `.test-d.ts` descriptor-inference coverage (`define-module.test-d.ts`: 6, covering `createRoutes` narrowing to `RouteRecordRaw`, generic preservation, typed nav label / meta pass-through, `AnyModuleDescriptor` bivariance, and `LazyModuleDescriptor.load` resolution; `route-meta.test-d.ts`: 3). Full workspace typecheck (118 tasks) and `vite build` (JS + dts) pass; externals (`vue`, `vue-router`, `@modular-frontend/core`, `@modular-vue/vue`) stay unbundled.

**PR-21 (M): `@modular-vue/runtime` part 1: registry.** Done.
New `packages/vue-router-runtime` (`@modular-vue/runtime`, `0.1.0`) with the repo's standard skeleton (`vite build` + `rolldown-plugin-dts`, `vitest`, `tsc --noEmit`). Depends on `@modular-frontend/core`, `@modular-vue/vue`, `@modular-vue/core`, plus `vue ^3.5` / `vue-router ^4.5` peers. Ports `registry.ts` (React source: `react-router-runtime/src/registry.ts`): `createRegistry` with `register`, `registerLazy`, `use` (plugin machinery), and `resolveManifest`. Validation reuses the neutral core validators directly (`validateNoDuplicateIds`, `validateDependencies`, `validateEntryExitShape`); the deps snapshot uses `buildDepsSnapshot` rather than a local reimplementation. `resolveManifest()` keeps the React idempotency contract (first call captures options and caches; later calls return the cache and reject options) and the `onRegister`-once / flip-before-throw guard.

Deviations from the plan, forced by the PR boundary and the Vue design:

- The router-owning `resolve()` entry, the `Providers` context component, the `router.addRoute()` route-builder, and the auth guard are deferred to PR-22 (as the `@modular-vue/vue` `context.ts` note already anticipates: "the runtime plugin (PR-22) provides it at the app root"). PR-21's `resolveManifest()` therefore returns the resolved data surface (`navigation`, `slots`, `modules`, `moduleDescriptors`, `extensions` + the `journeys` alias, `onModuleExit`, `recalculateSlots`) but not `Providers` / `routes`. The registry-level `registry.test.tsx` cases port to `resolveManifest()` (idempotent) rather than `resolve()` (single-use); the rendering assertions are deferred with the router.
- The Vue journeys plugin (`@modular-vue/journeys`) does not exist until PR-30, so `registry-journeys.test.ts` is ported as `registry-plugins.test.ts`: a synthetic journeys-shaped plugin exercises the registry's plugin machinery (extend / validate / contributeNavigation / onResolve, the `.extensions` bag, the `.journeys` alias, duplicate-name and method-collision guards, launcher nav contribution). Wiring the real journeys plugin end-to-end stays with PR-32. `plugin.providers()` (provider-stack contribution) is deferred to PR-22 with the provider stack.
- `RegistryConfig` is re-exported from `@modular-frontend/core` (its `Store<T>` bucket already covers zustand and the core store), so the runtime does not redeclare a zustand-typed copy the way the React runtime does. `buildAssembly` carries `slotsSignal` / `dynamicSlotFactories` / `slotFilter` so PR-22 threads the same signal instance the `recalculateSlots` closure notifies. Error-message prefixes are `[@modular-vue/runtime]`.

Acceptance: met for the registry scope. 30 tests across `registry.test.ts` (17: assembly, validation, onRegister-once, idempotency, `recalculateSlots` no-op vs live, `onModuleExit` forwarding, `moduleDescriptors`), `registry-plugins.test.ts` (9), and `registry.test-d.ts` (4: plugin-extend intersection, base-surface exclusion, `extensions` typing, `journeys`-alias-`never`). Full workspace typecheck (120 tasks) and `vite build` (JS + dts) pass; externals (`vue`, `vue-router`, `@modular-frontend/core`, `@modular-vue/vue`, `@modular-vue/core`) stay unbundled.

**PR-22 (M): `@modular-vue/runtime` part 2: route building and app shell.** Done.
Added `route-builder.ts`, `providers.ts`, `app.ts` to `packages/vue-router-runtime`, plus a router-owning `resolve()` entry and the framework-mode `Providers` component on `resolveManifest()`. React sources: `react-router-runtime/route-builder.tsx`, `providers.tsx`, `app.tsx`, and the `resolve()`/`resolveManifest()` machinery in `registry.ts`.

- `route-builder.ts` — `graftModuleRoutes(router, modules, lazyModules, options?)` adds each eager module's `createRoutes()` output onto a live router via `router.addRoute()` (or `router.addRoute(parentName, route)` when a `parentRouteName` boundary is set); headless modules are skipped and a falsy `createRoutes()` throws with the module id. `createLazyModuleRoute` registers a `basePath/:pathMatch(.*)*` catch-all whose `beforeEnter` loads the descriptor, grafts its subtree, removes the placeholder, and redirects to the same location so vue-router re-resolves into the real routes. An in-flight-load promise guards against double-loading under concurrent navigation.
- `providers.ts` — the provider layer in two shapes over one `ModularProvidersConfig`: `createModularProvidersPlugin` (app-level `app.provide` for the router-owning path, where the app root is the user's own component rendering `<router-view>`) and `createModularProvidersComponent` (a `Providers` component wrapping its default slot for framework mode). Dynamic slots route through the shared `DynamicSlotsProvider` in the component form and a `shallowRef` + `slotsSignal` subscription in the plugin form.
- `app.ts` — `createModularApp(registry, options)`, a thin convenience over `registry.resolve(options)` returning the installable manifest so `app.use(createModularApp(registry, { router }))` is one line.
- `registry.ts` — `resolve(options)` (router-owning, single-use) grafts routes, installs the `authGuard` via `router.beforeEach`, and returns an `ApplicationManifest` that is itself a Vue plugin (`install`) carrying `router` + the resolved data. `resolveManifest()` now also returns a `Providers` component and the eager module `routes`. `resolve()` / `resolveManifest()` are mutually exclusive (mode machinery ported from the React registry).

Deviations from the plan, all forced by the framework:

- vue-router registers routes at runtime, so there is no route-_tree_ to compose: the React `buildRouteTree` (which returns a nested `RouteObject[]` for `createRouter`) becomes `graftModuleRoutes`, which mutates a router the app already created. The acceptance test therefore boots the router first and grafts onto it, matching "exercises lazy module mounting after `createRouter`". The auth boundary is a named parent route + `parentRouteName` (a real `addRoute` parent), not React Router's pathless-layout trick.
- The React `resolve()` returns an `App` component that renders `<Providers><RouterProvider/></Providers>`. Vue has no library-owned root — the user's component renders `<router-view>` — so the Vue manifest is an installable **plugin** that `app.provide`s the contexts app-wide, and the auth guard is a plain `router.beforeEach`. "Driven by module metadata" means the guard reads `to.meta` (the vue-router `RouteMeta` channel from PR-20); the runtime just forwards the guard.
- Framework-mode lazy modules stay unwired (grafting a lazy subtree needs a router reference, which only `resolve()` has), so `resolveManifest().routes` carries eager routes only and the lazy-not-wired dev warning was reworded for framework mode rather than removed. `resolve()` wires lazy modules end-to-end.
- Plugin-contributed providers (`plugin.providers()` returns `UiComponent[]`) are not threaded in PR-22: the only consumer is the journeys plugin, which lands in PR-30. User-supplied `providers` are Vue plugins on `resolve()` and Vue components on `resolveManifest()`, matching each path's wrapping model.

Error-message prefixes are `[@modular-vue/runtime]`. Acceptance: met. The integration suite (`app.test.ts`) boots a memory-history router with two modules, navigates between them (asserting both routing and injected navigation/modules/slots), exercises lazy mounting after `createRouter`, and covers the `beforeEach` auth guard, extra-plugin install, and mode exclusivity. 28 new tests across `route-builder.test.ts` (9), `app.test.ts` (11), and `resolve-manifest.test.ts` (8); package total 58. Full workspace typecheck (120 tasks) and `vite build` (JS + dts) pass; externals (`vue`, `vue-router`, `@modular-frontend/core`, `@modular-vue/vue`, `@modular-vue/core`) stay unbundled.

**PR-23 (M): `@modular-vue/runtime` part 3: zones and route data.**
`zones.ts`, `active-zones.ts`, `route-data.ts` over `useRoute().matched` and `route.meta`, funneling through core's `mergeRouteStaticData` (deepest-wins) and `createRouteDataOverrideWarner`. Port `zones.test.tsx`, `active-zones.test.tsx`, `route-data.test.tsx`, `slots.test.ts`.
Acceptance: deepest-wins merge behavior matches the React suites, including the override warning cases.

**PR-24 (S): `@modular-vue/testing`.**
`renderModule` with `@testing-library/vue`, `mock-store.ts`, `resolveModule` re-export. (`renderJourney` lands with PR-32.)
Acceptance: parity with `react-router-testing/src` minus the journey helper.

### Phase 3: Journeys and Compositions on Vue

**PR-30 (M): `@modular-vue/journeys` part 1: provider and composables.**
Journey provider, `useJourneyState`, instance composables over the engine's store surface (analogs of `provider.tsx`, `instance-hooks.ts`, `use-journey-state.ts`), plugin contribution type (analog of `plugin.tsx`, which is type-only React today and becomes type-only Vue).
Acceptance: port of `provider.test.tsx`, `use-journey-state.test.tsx` intent.

**PR-31 (L): `@modular-vue/journeys` part 2: outlet.**
The largest single rewrite: outlet (analog of `outlet.tsx`, 555 LOC), `module-tab`, `use-wait-for-exit`, mount-kind rendering. Port test intent from `outlet.test.tsx`, `outlet-invoke.test.tsx`, `outlet-preload.test.tsx`, `module-tab.test.tsx`, `mount-kinds-runtime.test.tsx`, `use-wait-for-exit.test.tsx`.
Acceptance: the full journey lifecycle (enter, branch, go-back, go-forward, rewind-to, complete, abort, persistence resume) demonstrated in component tests against the real engine, matching the React outlet suites case-for-case.

**PR-32 (M): Journeys wired into `@modular-vue/runtime` + `renderJourney`.**
Registry journey registration end-to-end, route integration for journey mounts, `renderJourney` testing helper. Port `registry-journeys` rendering cases and `render-journey.test.tsx`.
Acceptance: the example-app journey scenario (multi-module sequence with a branch) passes as an integration test.

**PR-33 (M): `@modular-vue/compositions` part 1: provider, composables, store glue.**
Analogs of `provider.tsx`, `hooks.ts`, `use-composition`, `plugin.tsx` over the compositions engine. Port `use-composition.test.tsx`, `selector-dispatch.test.tsx` intent.

**PR-34 (L): `@modular-vue/compositions` part 2: outlet.**
Analog of the 1,070-LOC `outlet.tsx`. Port `outlet.test.tsx`, `outlet.behaviors.test.tsx`, `outlet.advanced-behaviors.test.tsx`, `mount-kinds-runtime.test.tsx`, and the runtime lifecycle rendering suites.
Acceptance: zone mount/unmount lifecycle, disposal, and validation behaviors match the React suites.

### Phase 4: example, docs, parity audit

**PR-40 (L): `examples/vue-router` example app.**
Mirror `examples/react-router`: app-shared, shell, two or three modules, one journey, one composition, wired with SFCs and the patterns the docs will teach. Registered in `pnpm-workspace.yaml` (globs already cover it) and CI.
Acceptance: `pnpm dev` runs it; a smoke test boots it headlessly.

**PR-41 (M, docs only): Documentation.**
`getting-started-vue-router.md`, `shell-patterns-vue-router.md` (route shape, zones via `meta`, `useRouteData`, `beforeEach` auth), Vue sections in `docs/navigation.md`, journeys and compositions README updates, README package-map and quickstart updates, tagline adjustment per D1.
Acceptance: a developer can go from `npx @modular-vue/cli init` (after PR-50) or manual setup to a running two-module app following only the docs.

**PR-42 (S): Parity audit.**
Compare exported API surface and test-case inventory between the React-router and vue-router families; file follow-up issues for gaps; add a CI check or checklist that new core features must state their Vue impact.
Acceptance: a parity table appended to this document with no unexplained gaps; Vue packages promoted from 0.x to 1.0 after this PR.

### Phase 5: tooling and stretch

**PR-50 (M): `@modular-vue/cli`.**
Preset over the PR-04 `cli-core` interface with SFC template bodies: shell, module, journey, store (core store per D3), app-shared, workspace. Snapshot test of the generated tree; generated app passes its own `lint`/`typecheck`/`test`.

**PR-51 (S): Catalog Vue support.**
Teach `detect.ts`/`resolve.ts` the Vue package names, verify the harvester loads Vue descriptor files through the Vite SSR path (descriptors are plain objects, so this is mostly configuration plus a fixture), add a Vue example to the catalog example.
Acceptance: catalog build over `examples/vue-router` produces a correct model including the journey cross-reference graph.

**PR-52 (stretch, L): Nuxt module.** Blocked by D6 and demand signal.
A Nuxt module that registers the family at app setup, plus a `framework-mode-nuxt.md` doc. Deliberately unscoped until the SPA story has users.

## Dependency graph

```
D1, D2 ──► PR-05, PR-02, PR-03
PR-01 ──► PR-10
PR-02 ──► PR-30
PR-03 ──► PR-33
PR-04 ──► PR-50
PR-10 ──► PR-11 ──► PR-12
PR-10/11 ──► PR-20 ──► PR-21 ──► PR-22 ──► PR-23 ──► PR-24
PR-22 + PR-31 ──► PR-32
PR-30 ──► PR-31
PR-33 ──► PR-34
PR-23 + PR-32 + PR-34 ──► PR-40 ──► PR-41, PR-42
PR-42 ──► 1.0 release
```

Parallelizable tracks once Phase 0 lands: (a) PR-10..12 binding layer, (b) PR-30/31 journeys UI and PR-33/34 compositions UI depend only on the engines plus PR-10, (c) PR-20..24 router family depends on the binding layer. Two people can run tracks b and c concurrently.

## Versioning and release

- All Vue packages start at `0.1.0` and stay 0.x until PR-42.
- Engine packages (PR-02/03) start at the version of the package they were extracted from, since their API is already stable.
- `@modular-react/journeys` and `@modular-react/compositions` releases after extraction are patch/minor (re-export shim, no API change).
- 1.0 for `@modular-vue/*` and `@modular-vue/*` ships together, after the parity audit, example, and docs.

## Risks

- **Reactivity semantics drift.** `useSyncExternalStore` has synchronous-snapshot semantics; Vue batches effects. Journey/composition outlets must not observe stale store state during route transitions. Mitigation: the engine suites are timing-agnostic already; add explicit ordering tests in PR-31/PR-34 (this is the most likely source of subtle behavior differences).
- **Test porting dominates the schedule.** ~1054 existing test cases; the UI-facing ones need rewriting, not copying. Mitigation: port test intent per PR (listed above) rather than as a big-bang phase, and let the parity audit (PR-42) catch omissions.
- **Maintenance drift after 1.0.** Every core change now has three integration surfaces. Mitigation: the PR-42 CI/checklist item; keeping engines extracted means most feature work lands framework-neutral by construction.
- **Docs are half the product.** The React docs are extensive; PR-41 is one PR but the largest writing task. Keep it scoped to getting-started + shell-patterns and grow the rest on demand.
- **Windows CI quirk.** `@tanstack-react-modules/cli` tests already hit EPERM on `.test-output` cleanup on Windows; the Vue CLI (PR-50) will likely inherit the same pattern. Reuse whatever mitigation the existing CLIs use.
- **Scope squatting.** Reserve npm scopes (PR-05) before announcing anything.

## Status board

Update the Status column as PRs move: `todo` → `in progress` → `in review` → `done` (link the PR).

| PR    | Title                                       | Size | Depends on          | Status     |
| ----- | ------------------------------------------- | ---- | ------------------- | ---------- |
| PR-01 | Neutralize renderable types in core         | S    | —                   | done (#54) |
| PR-02 | Extract journeys engine                     | L    | D2                  | done (#55) |
| PR-03 | Extract compositions engine                 | L    | D2                  | done (#56) |
| PR-04 | cli-core framework-pluggable templates      | M    | —                   | todo       |
| PR-05 | CI/publish plumbing, scope reservation      | S    | D1                  | todo       |
| PR-10 | @modular-vue/vue: stores and context        | M    | PR-01               | done       |
| PR-11 | @modular-vue/vue: rendering pieces          | M    | PR-10               | done       |
| PR-12 | @modular-vue/testing                        | S    | PR-11               | done       |
| PR-20 | @modular-vue/core                           | M    | PR-10               | done       |
| PR-21 | runtime: registry                           | M    | PR-20               | done       |
| PR-22 | runtime: route building, app plugin, guards | M    | PR-21               | done       |
| PR-23 | runtime: zones and route data               | M    | PR-22               | todo       |
| PR-24 | @modular-vue/testing                        | S    | PR-23               | todo       |
| PR-30 | vue journeys: provider and composables      | M    | PR-02, PR-10        | todo       |
| PR-31 | vue journeys: outlet                        | L    | PR-30               | todo       |
| PR-32 | journeys wired into runtime + renderJourney | M    | PR-22, PR-31        | todo       |
| PR-33 | vue compositions: provider and composables  | M    | PR-03, PR-10        | todo       |
| PR-34 | vue compositions: outlet                    | L    | PR-33               | todo       |
| PR-40 | examples/vue-router                         | L    | PR-23, PR-32, PR-34 | todo       |
| PR-41 | Documentation                               | M    | PR-40               | todo       |
| PR-42 | Parity audit, promote to 1.0                | S    | PR-40               | todo       |
| PR-50 | @modular-vue/cli                            | M    | PR-04, PR-40        | todo       |
| PR-51 | Catalog Vue support                         | S    | PR-40               | todo       |
| PR-52 | Nuxt module (stretch)                       | L    | D6, 1.0             | todo       |

## Working agreements

- One PR per row above; if a PR grows past its size class, split it and add a row rather than letting it balloon.
- Every PR that adds a Vue analog of a React file names the React source file in its description, so reviewers can diff intent.
- Every PR updates this document (status board, decision outcomes, and any scope changes) in the same commit.
- No Vue package publishes above 0.x before PR-42 is done.
