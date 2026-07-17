# Vue support initiative: plan and tracker

Status: **Phase 4 complete + both parity follow-ups closed — `@modular-vue/*` at full React-router parity** (Phase 0: PR-01, PR-02, PR-03 landed; Phase 1: PR-10, PR-11, PR-12 landed; Phase 2: PR-20, PR-21, PR-22, PR-23, PR-24 landed; Phase 3: PR-30, PR-31, PR-32, PR-33, PR-34, PR-35 landed; Phase 4: PR-40 example apps, PR-41 docs, PR-42 parity audit landed). The parity audit's two follow-up gaps are now closed: **PR-44** (Vue `createJourneyMountAdapter`, enabling journey-in-composition-zone) and **PR-43** (`simulateJourney` / `JourneySimulator` re-export from `@modular-vue/testing` + a `@modular-vue/journeys/testing` subpath) — see [Parity audit (PR-42)](#parity-audit-pr-42). Phase 5 tooling underway: **PR-51 (catalog Vue support) and PR-04 (framework-pluggable `cli-core`) landed** — the `@modular-react/catalog` harvester loads `@modular-vue/*` descriptors (incl. `.vue` SFC imports via a forwarded `@vitejs/plugin-vue`) and the demo catalog scans a mixed React + Vue set; `cli-core` now emits every framework-specific body through the preset interface (no JSX-emitting strings left in `cli-core`), with both React CLIs producing byte-identical scaffolds. Next up: PR-50 (`@modular-vue/cli`), a preset over the PR-04 interface. Last updated: 2026-07-17.
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

| ID  | Decision                                                                                                                             | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Status                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| D1  | npm scopes for the Vue family and repo positioning (does the `modular-react` repo host Vue packages, or does it get a neutral name?) | Keep this repo, soften the README tagline. Use a single `@modular-vue` scope for the whole Vue family (framework binding, router integration, testing, cli); do not add a separate `@vue-router-modules` scope, since Vue has only one router and the router name carries no disambiguating information. Package names are unprefixed (`@modular-vue/core`, `@modular-vue/runtime`, `@modular-vue/cli`, `@modular-vue/vue`, `@modular-vue/testing`); the router-integration core and runtime take the plain `core`/`runtime` names because the router-neutral core lives under `@modular-frontend/core`, so there is no `@modular-vue/core` framework-alias to collide with. Reserve the scope on npm before any code PR. | resolved: single `@modular-vue` scope; README tagline softened in PR-41                                                       |
| D2  | Scope and name for the extracted engines                                                                                             | A neutral scope shared by both families, e.g. `@modular-frontend`, holding `journeys-engine` and `compositions-engine`. Avoid putting "react" or "vue" in the name.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | resolved: `@modular-frontend` (core in #54; `journeys-engine` in PR-02; `compositions-engine` in PR-03)                       |
| D3  | Store story for Vue templates: core store vs Pinia                                                                                   | Scaffold with the core `createStore` (zustand-shaped, already the framework contract) and document Pinia interop in a guide section. Do not take a Pinia dependency in runtime packages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | partially resolved: core `createStore` shipped and documented (PR-41); the Pinia-interop guide section is still todo          |
| D4  | Authoring style inside Vue library packages: SFC vs `defineComponent` + render functions                                             | `defineComponent` + `h()` for library internals (no `@vitejs/plugin-vue` needed in package builds, better generics); SFCs in CLI templates and the example app, since that is what users write.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | open                                                                                                                          |
| D5  | Minimum supported versions                                                                                                           | Vue ^3.5, vue-router ^4.5, Node 22+, aligned with the React 19 / Node 22 baseline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | resolved: Vue ^3.5 + vue-router ^4.5 published as the supported baseline (README, getting-started guide, package peer ranges) |
| D6  | Is Nuxt in scope for 1.0?                                                                                                            | No. Ship SPA-first, gauge demand, then decide on PR-52.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | open                                                                                                                          |

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

**PR-04 (M): Make `cli-core` framework-pluggable.** Done.
The preset seam (`preset.ts` + the `shell`/`module`/`app-shared` JSX bodies moved into each router CLI) was already in place; this PR closed the remaining gap — the framework-specific **source** bodies still living in `cli-core/src/templates/*`. Added preset template methods `shellViteConfig`, `shellIndexHtml`, `shellAuthStore`, `shellConfigStore`, `shellHome`, `storeFile`, `journeyDefinition`, and `journeyPersistence`, and dropped the `shellViteDedupe` field (each preset's `shellViteConfig` now inlines its own dedupe list — the only per-CLI difference in that body). Added a `packages.journeys` coordinate to the preset so `cli-core`'s framework-neutral `journeyPackageJson` reads the journeys binding name from the preset instead of hardcoding `@modular-react/journeys`. The React bodies were rehomed into both `react-router-cli` and `tanstack-router-cli` (`templates/shell.ts` + new `templates/store.ts` and `templates/journey.ts`), and `create-store` / `create-journey` (which previously ignored their `preset` arg) now emit through `preset.templates.*`.

After the move `cli-core` contains no JSX-emitting strings. What stays in `cli-core` is the command engine (`cli.ts`, `commands/*`), `naming.ts`, `transform.ts`, `workspace.ts`, `runtime-versions.ts`, and the framework-**neutral** scaffolding templates (`workspace`, `catalog`, and the `package.json` / `tsconfig` / `types` / `http-client` / journey `package.json`+`index`+`tsconfig` helpers).

Deviations from the plan, all consistent with the earlier partial split:

- The plan line said `cli-core` keeps "only" the command engine + those four helpers. In practice the framework-neutral **scaffolding** templates stay too. They carry no JSX and no framework source — only React-family `package.json` constants (`react` / `zustand` / `@vitejs/plugin-react` version pins), exactly as the already-shipped `appSharedPackageJson` / `shellPackageJson` do. The hard acceptance criterion ("no JSX-emitting strings") is met; parameterizing those `package.json` constants for a non-React family is a `package.json`-layer concern PR-50 addresses.
- `transform.ts` stays in `cli-core` (per the keep-list) and still wires `@modular-react/journeys` and the `main.tsx` entry into the generated shell. That is React-flavored; PR-50 parameterizes the entry filename and journeys binding for the Vue preset.
- The shell entry filenames (`main.tsx`, `Home.tsx`, `.tsx` pages, `vite.config.ts`) are still passed as literals by `init.ts`; mapping them to `.vue` / `main.ts` is PR-50's job (it changes no React output).
- Chose per-CLI duplication over a shared react-templates module (the plan allowed either). The `journeyDefinition` / `journeyPersistence` / `storeFile` bodies are byte-identical across the two React CLIs, but duplicating matches the existing `module` / `shell` / `app-shared` per-CLI convention and keeps each preset self-contained.

**Vue impact (working agreement).** This is the enabling refactor for PR-50: `@modular-vue/cli` becomes a preset that supplies SFC `shellHome` / layout bodies, a core-`createStore` `storeFile` (D3), and `@modular-vue/journeys` journey bodies through this same interface — plus the `main.ts` / `.vue` entry-filename parameterization noted above.

Acceptance: met. Both CLIs produce byte-identical scaffolds before/after (verified by diffing full generated trees, and locked in by a new full-tree snapshot test added to each CLI's `cli.test.ts` — react 16 tests, tanstack 11); `cli-core` no longer contains JSX-emitting strings. Full workspace typecheck (145 tasks) passes.

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
New `packages/vue-core` (`@modular-vue/core`, `0.1.0`) with the repo's standard skeleton (`vite build` + `rolldown-plugin-dts`, `vitest`, `tsc --noEmit`). Depends on `@modular-frontend/core`, `@modular-vue/vue`, a `vue ^3.5` peer, and a `vue-router ^4.5` peer (D5).

- `types.ts` — vue-router `ModuleDescriptor` whose `createRoutes()` returns `RouteRecordRaw | RouteRecordRaw[]` (the React source returns `RouteObject`), plus `LazyModuleDescriptor` and the `AnyModuleDescriptor` shorthand, mirroring `react-router-core/types.ts` field-for-field. `LazyModuleDescriptor` follows the React Router shape (`{ id, basePath, load }` yielding a full `createRoutes()` subtree), not the frozen-tree TanStack shape: vue-router's `router.addRoute()` lets the runtime graft the loaded subtree in on first visit.
- `define-module.ts` / `define-slots.ts` — the same identity functions as `react-router-core`, typed over the vue-router descriptor.
- `route-meta.ts` — the `RouteMeta` convention the runtime (PR-23) reads. vue-router's `meta` is the analog of React Router's arbitrary `handle` channel, so zones and per-route static data ride on `meta`; a route merges deepest-wins across `useRoute().matched`. Exports a `ModuleRouteMeta<TZones>` helper (named zone keys typed and optional, arbitrary route data allowed) and documents the app-level `declare module "vue-router" { interface RouteMeta … }` augmentation.

Deviations from the plan, both structural, none behavioral:

- The plan listed `is-store-api.ts` and `scoped-store.ts` as new files to mirror. In the React family those are zustand-specific reimplementations (`react-router-core` reimplements `createSharedHooks` / `createScopedStore` against zustand and does not depend on `@modular-react/react`). Vue has no zustand split: `@modular-vue/vue` already provides `createSharedComposables`, `createScopedStore`, and the `provide*` helpers over the neutral `Store<T>`, and the detection helpers (`isStoreApi` / `isReactiveService` / `separateDeps`) already live in `@modular-frontend/core`. So `@modular-vue/core` re-exports those rather than duplicating them (PR-20 depends on PR-10 for exactly this reason). The public surface still matches `react-router-core`'s index name-for-name (composable names are the Vue analogs: `createSharedComposables` for `createSharedHooks`, `sharedDependenciesKey` / `provideSharedDependencies` for `SharedDependenciesContext`).
- `define-module.ts` mirrors `react-router-core`'s four-generic signature (no `TDescriptor` literal-preservation generic); if journey entry/exit inference needs the literal form later it will surface in PR-30, and this keeps parity with the React router core it mirrors.

Acceptance: met. 15 tests — `define-slots.test.ts` (2, ported from the React source), `index.test.ts` (3, asserting the re-export barrel resolves at runtime), plus `.test-d.ts` descriptor-inference coverage (`define-module.test-d.ts`: 6, covering `createRoutes` narrowing to `RouteRecordRaw`, generic preservation, typed nav label / meta pass-through, `AnyModuleDescriptor` bivariance, and `LazyModuleDescriptor.load` resolution; `route-meta.test-d.ts`: 3). Full workspace typecheck (118 tasks) and `vite build` (JS + dts) pass; externals (`vue`, `vue-router`, `@modular-frontend/core`, `@modular-vue/vue`) stay unbundled.

**PR-21 (M): `@modular-vue/runtime` part 1: registry.** Done.
New `packages/vue-runtime` (`@modular-vue/runtime`, `0.1.0`) with the repo's standard skeleton (`vite build` + `rolldown-plugin-dts`, `vitest`, `tsc --noEmit`). Depends on `@modular-frontend/core`, `@modular-vue/vue`, `@modular-vue/core`, plus `vue ^3.5` / `vue-router ^4.5` peers. Ports `registry.ts` (React source: `react-router-runtime/src/registry.ts`): `createRegistry` with `register`, `registerLazy`, `use` (plugin machinery), and `resolveManifest`. Validation reuses the neutral core validators directly (`validateNoDuplicateIds`, `validateDependencies`, `validateEntryExitShape`); the deps snapshot uses `buildDepsSnapshot` rather than a local reimplementation. `resolveManifest()` keeps the React idempotency contract (first call captures options and caches; later calls return the cache and reject options) and the `onRegister`-once / flip-before-throw guard.

Deviations from the plan, forced by the PR boundary and the Vue design:

- The router-owning `resolve()` entry, the `Providers` context component, the `router.addRoute()` route-builder, and the auth guard are deferred to PR-22 (as the `@modular-vue/vue` `context.ts` note already anticipates: "the runtime plugin (PR-22) provides it at the app root"). PR-21's `resolveManifest()` therefore returns the resolved data surface (`navigation`, `slots`, `modules`, `moduleDescriptors`, `extensions` + the `journeys` alias, `onModuleExit`, `recalculateSlots`) but not `Providers` / `routes`. The registry-level `registry.test.tsx` cases port to `resolveManifest()` (idempotent) rather than `resolve()` (single-use); the rendering assertions are deferred with the router.
- The Vue journeys plugin (`@modular-vue/journeys`) does not exist until PR-30, so `registry-journeys.test.ts` is ported as `registry-plugins.test.ts`: a synthetic journeys-shaped plugin exercises the registry's plugin machinery (extend / validate / contributeNavigation / onResolve, the `.extensions` bag, the `.journeys` alias, duplicate-name and method-collision guards, launcher nav contribution). Wiring the real journeys plugin end-to-end stays with PR-32. `plugin.providers()` (provider-stack contribution) is deferred to PR-22 with the provider stack.
- `RegistryConfig` is re-exported from `@modular-frontend/core` (its `Store<T>` bucket already covers zustand and the core store), so the runtime does not redeclare a zustand-typed copy the way the React runtime does. `buildAssembly` carries `slotsSignal` / `dynamicSlotFactories` / `slotFilter` so PR-22 threads the same signal instance the `recalculateSlots` closure notifies. Error-message prefixes are `[@modular-vue/runtime]`.

Acceptance: met for the registry scope. 30 tests across `registry.test.ts` (17: assembly, validation, onRegister-once, idempotency, `recalculateSlots` no-op vs live, `onModuleExit` forwarding, `moduleDescriptors`), `registry-plugins.test.ts` (9), and `registry.test-d.ts` (4: plugin-extend intersection, base-surface exclusion, `extensions` typing, `journeys`-alias-`never`). Full workspace typecheck (120 tasks) and `vite build` (JS + dts) pass; externals (`vue`, `vue-router`, `@modular-frontend/core`, `@modular-vue/vue`, `@modular-vue/core`) stay unbundled.

**PR-22 (M): `@modular-vue/runtime` part 2: route building and app shell.** Done.
Added `route-builder.ts`, `providers.ts`, `app.ts` to `packages/vue-runtime`, plus a router-owning `resolve()` entry and the framework-mode `Providers` component on `resolveManifest()`. React sources: `react-router-runtime/route-builder.tsx`, `providers.tsx`, `app.tsx`, and the `resolve()`/`resolveManifest()` machinery in `registry.ts`.

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

**PR-23 (M): `@modular-vue/runtime` part 3: zones and route data.** Done.
Added `zones.ts`, `active-zones.ts`, `route-data.ts` to `packages/vue-runtime`, each the Vue analog of the same-named React file (`react-router-runtime/src/zones.ts`, `active-zones.ts`, `route-data.ts`). All three read `useRoute().matched`, pull each matched record's `meta` (vue-router's analog of React Router's `handle`), and funnel through core's `mergeRouteStaticData` (deepest-wins) with the dev-only `createRouteDataOverrideWarner`. Error-message prefixes / warner label are `[@modular-vue/runtime]`.

- `zones.ts` — `useZones<TZones>()` returns a `ComputedRef<Partial<TZones>>` of merged zone components off `route.matched[i].meta`.
- `route-data.ts` — `useRouteData<TRouteData>()`, the relaxed-typing counterpart (same merge, no component constraint on values), also a `ComputedRef`.
- `active-zones.ts` — `useActiveZones<TZones>(activeModuleId?)` unifies route zones with the active tab-based module's `zones` descriptor field; module zones win per key.

One framework-neutral change was needed in `@modular-frontend/core` (`route-data-warn.ts`), matching how earlier PRs extended neutral seams: `RouteDataRuntimeLabel` gained `"@modular-vue/runtime"` and `RouteDataFieldLabel` gained `"meta"` (the closed literal unions that pin the warner to first-party runtimes). `readMatchId` also gained `name` (string names only — vue-router allows symbol names) and `path` fallbacks, since vue-router's matched records expose neither `id` nor `routeId`; without them every Vue override warning would dedup on `<unknown>`. The `route-data-warn` suite gains three cases for the new fallbacks — string `name`, `path`, and a symbol-valued `name` that must fall through to `path` rather than be used as a route ID — while preserving the existing `id`/`routeId`/empty coverage.

Deviations from the plan, all forced by the framework:

- **Composables return `ComputedRef`, not a plain object.** The React hooks recompute per render off `useMatches()`; the Vue analog derives from the reactive `useRoute()`, so returning a `ComputedRef` (recomputing on navigation) is the faithful reactive-source port, matching how `@modular-vue/vue`'s `useSlots` returns a `Ref` (PR-10 convention). The ported tests read `.value`.
- **`useActiveZones` accepts a `MaybeRefOrGetter<string | null | undefined>`** (resolved via `toValue`) rather than the React `string | null`, so a reactive "active tab" selection stays reactive through the composable. A plain string still works.
- The React `zones.test.tsx` / `active-zones.test.tsx` / `route-data.test.tsx` mock `react-router`'s `useMatches`; the Vue ports mock `vue-router`'s `useRoute` to return a `{ matched }` stub and `@modular-vue/vue`'s `useModules`. `slots.test.ts` is framework-neutral and ports verbatim against `@modular-frontend/core` + `@modular-vue/vue`'s `createSlotsSignal` (no new source file — the runtime already re-exports the slot helpers).

Acceptance: met. 48 new tests across `zones.test.ts` (7, incl. a navigation-recompute case), `active-zones.test.ts` (7, incl. a ref-reactivity case), `route-data.test.ts` (10, incl. a navigation-recompute case), and `slots.test.ts` (24, with separate null- and undefined-returning factory cases) port the React suites case-for-case; deepest-wins merge, undefined-skip, and module-over-route precedence all match, and the ComputedRef recomputes on navigation. Package total 110. Full workspace typecheck and `vite build` (JS + dts) pass; externals (`vue`, `vue-router`, `@modular-frontend/core`, `@modular-vue/vue`, `@modular-vue/core`) stay unbundled.

**PR-24 (S): `@modular-vue/testing` `renderModule`.** Done.
Added `render-module.ts` to `packages/vue-testing`, the Vue analog of `react-router-testing/src/render-module.tsx`. `renderModule(module, options)` renders a module in isolation across the same three shapes as the React source — entry-point modules (`entry` + `input`, exits forwarded to an `exit` spy), route-based modules (`createRoutes`, navigated to `route`), and legacy component-only modules (`component` + `props`) — providing the three modular injection contexts (shared dependencies, slots, module list) the runtime installs at the app root. `createMockStore` and `resolveModule` were already re-exported (PR-12); this PR completes the package's parity with `react-router-testing/src` minus the journey helper.

Deviations from the React source, both forced by the framework:

- **Returns a `@vue/test-utils` `VueWrapper`, not a `@testing-library/react` `RenderResult`.** `@vue/test-utils` `mount` is the repo-wide Vue test primitive (used by every `@modular-vue/*` suite since PR-10); `@testing-library/vue` is not a repo dependency. `mount` is the faithful analog of `render`. The three React context-provider JSX wrappers (`<SharedDependenciesContext><SlotsContext><ModulesContext>`) become one `defineComponent` wrapper whose `setup()` calls the `provide*` helper analogs (`provideSharedDependencies`, `provideSlots`, `provideModules`) — the injection-key equivalents (D4: `defineComponent` + render function for library internals).
- **The `createRoutes` path is genuinely async.** It boots a memory-history router, installs it as a plugin, renders `<RouterView>`, and awaits `router.isReady()` + `flushPromises()` before returning — vue-router resolves navigation asynchronously, where React's `createMemoryRouter` + `RouterProvider` resolves without an explicit await. The signature was already `Promise`-returning in the React source, so callers are unaffected.

Dynamic slots are evaluated eagerly (as in the React source) and provided as a static object, reusing core's `buildDepsSnapshot` for the flat-deps snapshot rather than reimplementing the store/reactive-service/service fold. Error-message prefixes are `[@modular-vue/testing]`. New peers: `@modular-vue/core`, `@vue/test-utils`, `vue-router` (alongside the existing `@modular-frontend/core`, `@modular-frontend/testing`, `@modular-vue/vue`, `vue`).
Acceptance: met. 9 tests in `render-module.test.ts` cover all three render modes, the `route` option, dynamic-slot evaluation from deps, dep/module/slot injection into a routed component, reactive-service injection (auto-detected into the reactiveServices bucket), the default no-op `exit` when no spy is passed, the unknown-entry error, and the neither-createRoutes-nor-component error. The public `deps` type accepts `ReactiveService<T>` alongside `Store<T>` and the plain value, matching the runtime's auto-detection. Package total 18 (`preload-entries.test.ts` unchanged at 9). Typecheck and `vite build` (JS + dts) pass; externals (`vue`, `vue-router`, `@vue/test-utils`, the modular packages) stay unbundled.

### Phase 3: Journeys and Compositions on Vue

**PR-30 (M): `@modular-vue/journeys` part 1: provider and composables.** Done.
New `packages/vue-journeys` (`@modular-vue/journeys`, `0.1.0`) with the repo's standard skeleton (`vite build` + `rolldown-plugin-dts`, `vitest` + `happy-dom` + `@vue/test-utils`, `tsc --noEmit`). Depends on `@modular-frontend/journeys-engine`, with `@modular-frontend/core`, `@modular-vue/vue`, and a `vue ^3.5` peer. Ports `provider.tsx`, `instance-hooks.ts`, `use-journey-state.ts`, and `plugin.tsx`, and re-exports the engine authoring surface (mirroring the React `@modular-react/journeys` index).

- `provider.ts` — `JourneyProvider` (`defineComponent` + render fn per D4) provides the `JourneyProviderValue` (`{ runtime, onModuleExit }`) by identity at setup and composes over `<ModuleExitProvider>` from `@modular-vue/vue`, forwarding the live `onModuleExit` prop into it each render. `useJourneyContext()` / `journeyKey` mirror the React `useJourneyContext` / context.
- `instance-hooks.ts` — the reactive subscription core. `useInstanceSnapshot` bridges one instance into a `shallowRef` via a `watchEffect` (the Vue analog of React's `useSyncExternalStore`), re-subscribing when the (ref/getter) id changes; `useCallChain` walks `activeChildId`, managing the per-instance subscription set by hand (rewires on runtime events, not tracked deps) and publishing an identity-stable `ShallowRef<InstanceId[]>`; `useLeafId` is the `ComputedRef` last-of-chain.
- `use-journey-state.ts` — `useJourneyState` / `useJourneyInstance` and the leaf-walking `useActiveLeafJourneyState` / `useActiveLeafJourneyInstance`.
- `plugin.ts` — `journeysPlugin()` (the real plugin object, not a type-only stub), field-for-field with the React `plugin.tsx` except `providers()` returns a Vue `<JourneyProvider>` bound component instead of a React one. This satisfies the PR-21 / PR-22 deferrals that named PR-30 as the home of the journeys plugin object; end-to-end registry wiring + outlet rendering stay with PR-32.

Deviations from the plan / React source, all forced by the framework:

- **The plugin is the real object, not "type-only".** The tracker's PR-30 line called `plugin.tsx` "type-only React today"; it is not — it carries `extend` / `validate` / `onResolve` / `contributeNavigation` / `providers`. PR-21 (`registry-plugins.test.ts` synthetic plugin) and PR-22 ("the only consumer is the journeys plugin, which lands in PR-30") both deferred the concrete journeys plugin here, so it ships in this PR.
- **Composables return Vue refs, not plain values.** `useJourneyState` → `ComputedRef<TState | null>`, `useJourneyInstance` → `ShallowRef<JourneyInstance | null>` (and the leaf variants likewise), matching the PR-23 reactive-source convention (`useZones`/`useSlots`). Single-instance snapshots update synchronously on runtime events; leaf-walk re-subscription lands on the next tick, so the chain-walk tests `await flushPromises()` before asserting (the accepted PR-11/PR-23 nextTick pattern).
- **Ids accept `MaybeRefOrGetter`.** So a reactive id (or the internal `ComputedRef` leaf id) stays reactive through the composable; plain strings still work (React's `InstanceId | null`).

Acceptance: met. 17 tests across `provider.test.ts` (4: context exposure, local-then-global exit forwarding through `<ModuleExitProvider>`, no-provider-handler forwarding, null context), `use-journey-state.test.ts` (4: state subscription, null without a provider, leaf-state chain grow/shrink, leaf-instance step/journeyId), and `plugin.test.ts` (9: name, definition validation, contract validate pass/fail, `onResolve` runtime, default + skipped + adapter nav items, provider runtime injection + exit forwarding). Full workspace typecheck (122 tasks) and `vite build` (JS + dts) pass; externals (`vue`, `@modular-frontend/core`, `@modular-frontend/journeys-engine`, `@modular-vue/vue`) stay unbundled. The provider-test-#2 note: `@modular-vue/vue`'s `useModuleExit` `localOnExit` is a `MaybeRefOrGetter` slot, so a handler is supplied as `() => handler`.

**PR-31 (L): `@modular-vue/journeys` part 2: outlet.** Done.
Added `outlet.ts`, `module-tab.ts`, `use-wait-for-exit.ts` to `packages/vue-journeys`, each the Vue analog of the same-named React file (`journeys/src/outlet.tsx`, `module-tab.tsx`, `use-wait-for-exit.ts`). Authored with `defineComponent` + render functions per D4; error-message prefixes are `[@modular-vue/journeys]`.

- `outlet.ts` — `JourneyOutlet` (renders the current step, walks the active call chain to the leaf, binds `exit`/`goBack`/`goForward`, fires `onFinished` once on the root's terminal, abandons on unmount with the listener-count handoff guard, speculative precise/aggressive preload) plus `useJourneyCallStack`. Reuses the reactive `useInstanceSnapshot` / `useLeafId` composables from PR-30. The React class `StepErrorBoundary` becomes an internal `defineComponent` using `onErrorCaptured` (returning `false` to contain the error); the outlet keys it by `${stepToken}:${retryKey}` so a retry remounts a fresh boundary and re-renders the step — the Vue analog of the React `key`-driven reset. `collectPreloadTargets` and the `entryAllowsJourneyMount` runtime guard port verbatim.
- `module-tab.ts` — `ModuleTab` + `ModuleTabExitEvent`. Entry resolution (lone-entry auto-pick, multi-entry disambiguation, unknown-entry / no-entry notices, legacy `component` fallback) matches the React source. `inheritAttrs: false` + reading `input` from `attrs` distinguishes "no `input` prop" from an explicit `input={undefined}` (Vue collapses both to `undefined` for a _declared_ prop, since an explicit `undefined` triggers the prop default), the analog of the React `"input" in props`.
- `use-wait-for-exit.ts` — `useWaitForExit` + channel types. First-wins latch, immediate loser-teardown, and the poll/timeout/subscribe race port directly. Because Vue `setup` runs once, `exit` and `channels` accept `MaybeRefOrGetter`: a `watchEffect` keeps the latest callbacks live (identity churn does not restart) and a `watch` on a folded scalar-shape key re-arms only when `poll.intervalMs` / `timeout.ms` / the timeout's named-exit form change — the Vue equivalent of the React ref-hoisting + dep-array.

One Vue-specific correctness fix, applied to both `outlet.ts` (the `modules` prop and the `runtime` prop) and `module-tab.ts` (the `module` prop): Vue deeply proxies prop objects, which would change the entry-object identity that keys `resolveEntryComponent`'s per-entry `WeakMap` cache (breaking preload→render chunk sharing and the memoized async wrapper) and would hand `getInternals` a proxied runtime its store doesn't recognize. `toRaw` restores the raw descriptors/runtime the engine and preload paths hold. `internals.__moduleMap` is already raw, so `toRaw` is a no-op there.

Deviations from the React source, all forced by the framework:

- **The step error surfaces on the next render.** `onErrorCaptured` queues the error ref, so the error-UI tests `await nextTick()` before asserting (React's synchronous `getDerivedStateFromError` needs no await), matching the accepted PR-11 pattern.
- **Snapshot updates are batched.** Runtime events push into `shallowRef`s synchronously but Vue schedules the re-render, so component-interaction tests `await` the trigger / `flushPromises()` (React's `act()` flushes inline). Leaf re-subscription on an id change lands next tick (PR-30 convention), so invoke/resume tests `await flushPromises()`.
- **`useJourneyCallStack` returns a `ShallowRef<readonly InstanceId[]>`**, not a plain array — the reactive-source convention (`useZones`/`useSlots`); callers read `.value`.
- **`preloadEntries`' synchronous-thenable replay is N/A** (`defineAsyncComponent` resolves async on mount), so the `ModuleTab` "no fallback flash after preload" case asserts the post-preload cached path replays without re-importing (importer called once across preload + render), matching the PR-11/PR-12 `resolve-entry` deviation. The React StrictMode double-mount case is React-only and omitted.

Acceptance: met. 67 new tests across `use-wait-for-exit.test.ts` (21), `module-tab.test.ts` (9), `outlet.test.ts` (13), `outlet-invoke.test.ts` (6), `outlet-preload.test.ts` (9), and `mount-kinds-runtime.test.ts` (4) port the React suites case-for-case (StrictMode-only cases excepted): start render, transition re-render, go-back, `onFinished`-once, abandon-on-unmount + the sibling/keyed-handoff listener guard, loading fallback, retry-cap → abort, not-found / custom-error / ignore-card, the full invoke → child → resume lifecycle with `leafOnly` both ways, `useJourneyCallStack` grow/shrink, precise/aggressive/off preload with sentinel + scoped-id + destination-only coverage, lazy step fallback, and the render-time `mountKinds` guard. Package total 84 (17 from PR-30). Full workspace typecheck (122 tasks) and `vite build` (JS + dts) pass; externals (`vue`, `@modular-frontend/core`, `@modular-frontend/journeys-engine`, `@modular-vue/vue`) stay unbundled. The registry wiring + outlet rendering end-to-end and `renderJourney` stay with PR-32.

**PR-32 (M): Journeys wired into `@modular-vue/runtime` + `renderJourney`.** Done.
Wired the real `@modular-vue/journeys` plugin end-to-end into the runtime and added the `renderJourney` testing helper, closing the PR-21 / PR-22 deferrals that named PR-32 as the home of concrete journeys-in-runtime.

- **Plugin providers threaded (`registry.ts`).** `buildAssembly` now collects each plugin's wrapping provider components (`plugin.providers({ runtime })`) into `pluginProviders`, and `resolveManifest()` threads them after the user-supplied providers into `createModularProvidersComponent` — the Vue analog of the React runtime's `combinedProviders = [...options.providers, ...pluginProviders]`. So a `<JourneyOutlet>` mounted inside `<router-view>` reads the journey runtime from the plugin's `<JourneyProvider>` context without the shell wiring it by hand. Error-message prefixes stay `[@modular-vue/runtime]`.
- **`registry-journeys.test.ts` (new).** Ports `react-router-runtime/src/registry-journeys.test.ts` case-for-case against the real `journeysPlugin()` + `defineJourney` (11 tests): `manifest.journeys` exposure, the `extensions.journeys` alias, the no-plugin `@ts-expect-error` guard, no-op runtime with no journeys, `validateJourneyContracts` aggregation at `resolveManifest()`, structural `registerJourney` validation, `onModuleExit` forwarding, and the five journey-contributed navigation cases (nav item shape, no-nav-no-item, module/journey nav coexistence + sort, `buildNavItem` adapter, hidden launchers). `registry-plugins.test.ts` keeps the framework-neutral plugin-machinery edge cases (name collision, `Object.prototype`-named method, method overwrite) the concrete plugin doesn't exercise.
- **`journeys-integration.test.ts` (new).** The acceptance scenario as an integration test (3 tests): a branching, multi-module journey (`chooser` → `finishA` | `finishB`) mounted through a route, driven to each terminal, asserting the `onFinished` payload. Two cases go through `resolveManifest()` + the threaded `Providers` (context-wired outlet); one goes through the router-owning `resolve()` with the shell wrapping its own `<router-view>` in `<JourneyProvider :runtime="manifest.journeys">`.
- **`renderJourney` (`@modular-vue/testing`).** Ports `react-router-testing/src/render-journey.tsx` — boots a `createJourneyRuntime`, starts the instance, provides the three modular contexts via the `provide*` helpers, and mounts `<JourneyOutlet>` with the runtime handed in by prop. Ported `render-journey.test.tsx` (2 tests: drive-to-terminal + `onFinished` payload).

Deviations from the plan / React source, all forced by the framework:

- **The router-owning `resolve()` path does not auto-thread wrapping-component plugin providers.** It returns an installable Vue plugin (`app.provide` app-wide) with no library-owned root to wrap, so — matching the PR-22 split (`resolve()` = plugin model, `resolveManifest()` = component model) — a shell that wants the journey context in this mode wraps its own `<router-view>` in `<JourneyProvider>` (or passes `runtime` straight to `<JourneyOutlet>`). The framework-mode `resolveManifest()` path owns a `Providers` component and threads them automatically; that is the recommended journeys path and the integration test covers both.
- **`renderJourney` returns `{ wrapper, runtime, instanceId }`** where `wrapper` is a `@vue/test-utils` `VueWrapper` (the repo-wide Vue test primitive), not a `@testing-library/react` `RenderResult` merged with the extras. The three React context-provider JSX wrappers collapse into one `defineComponent` wrapper calling the `provide*` helpers (decision D4).
- **Entry components in the runtime-level tests are Vue functional components** (plain functions with a declared `.props`), satisfying the registry's `validateEntryExitShape` function-component check while still rendering real buttons to drive exits. Component-interaction assertions `await flushPromises()` after each trigger (Vue batches; React's `act()` flushes inline — the accepted PR-31 pattern).

Acceptance: met. The branching multi-module journey scenario passes as an integration test through both resolve paths. Package totals: `@modular-vue/runtime` 124 tests (110 + 11 `registry-journeys` + 3 integration), `@modular-vue/testing` 20 (18 + 2 `render-journey`). Full workspace typecheck (123 tasks) and `vite build` (JS + dts) pass; the runtime source takes no journeys dependency (dev-only, tests) and the testing build externalizes `@modular-vue/journeys`.

**PR-35 (M): `<JourneyHost>` + `useJourneySync` on both bindings.** Done.
Not in the original plan — added from `docs/consumer-feedback-production-app.md` items 1 and 2, and shipped on React and Vue together so the Vue family does not inherit a gap PR-42 would have to file.

The interesting part is where the code landed. The journey↔location reconciler is a state machine over `{ status, step, history, future }` and a path string, with no UI framework in it, so it went into `@modular-frontend/journeys-engine` (`journey-sync.ts`) behind a narrow `JourneySyncPort` seam (`read` / `push` / `replace` / optional `go` / `subscribe`) that an app fills in for its router. React and Vue then share one implementation and one 33-case test suite; each binding is a lifetime wrapper (~110 LOC) and nothing router-specific ships in either.

- **`journeys-engine`:** `createJourneySync` plus the pure decision table `resolveJourneySyncAction`, `journeyStepPath`, `defaultStepPath`, and `createMemoryJourneySyncPort` (a browser-shaped in-memory port for tests and headless hosts).
- **`@modular-react/journeys`:** `useJourneySync`, `<JourneyHost>`, `useJourneyHost`.
- **`@modular-vue/journeys`:** the same three, as a composable + a `defineComponent`.

Deviations from the React source, forced by the framework:

- **`<JourneyHost>` (Vue) takes outlet props as attrs**, not re-declared props: `inheritAttrs: false` + an attrs spread onto the inner `<JourneyOutlet>`. The React version can write `Omit<JourneyOutletProps, "instanceId" | "runtime">` and spread; a `defineComponent` prop list has no equivalent, and re-declaring ~10 outlet props would drift. The cost is that outlet props are unchecked on the Vue host — `useJourneyHost` in `<script setup>` is the typed path.
- **`JourneyHostProps.input` is `any` on Vue.** The React props type makes `input` required exactly when the handle's `TInput` is not `void`; a `defineComponent` prop list cannot carry the handle's generic through. `useJourneyHost` is generic on both bindings and does check it.
- **The journey starts from `onMounted`, not `setup`.** Vue's `setup` is not speculative the way a React render is, so starting there would work — but `onMounted` guarantees the start is paired with an `onUnmounted` that ends it (a component whose `setup` ran but whose mount never completed would otherwise leak a live instance), and it keeps the observable contract identical to React's: `instanceId` is `null` for the first render.
- **`useJourneySync` resolves its runtime once at setup** (`toRaw(options.runtime ?? ctx?.runtime)`), matching how the other composables in the package resolve theirs, rather than reactively.

Acceptance: met. Package totals: `journeys-engine` 378 (+33), `@modular-react/journeys` 93 (+21), `@modular-vue/journeys` 101 (+17). The React StrictMode case is a real regression test — removing the host's start latch makes it fail with two instances, which is the bug in the hand-rolled `useState(() => runtime.start(…))` the feedback doc describes.

Follow-up left open: `stepCount`. Both hosts expose `stepIndex` (`history.length`) and deliberately no total — a journey's next step is computed by a transition handler from live state, so the total needs the transition-graph derivation in feedback item 4 (`resolveStepSequence`). Not guessed, not hand-passed.

**PR-33 (M): `@modular-vue/compositions` part 1: provider, composables, store glue.** Done.
New `packages/vue-compositions` (`@modular-vue/compositions`, `0.1.0`) with the repo's standard skeleton (`vite build` + `rolldown-plugin-dts`, `vitest` + `happy-dom` + `@vue/test-utils`, `tsc --noEmit`). Depends on `@modular-frontend/compositions-engine`, with `@modular-frontend/core`, `@modular-vue/vue`, and a `vue ^3.5` peer. Ports `provider.tsx`, `hooks.ts`, and `plugin.tsx`, and re-exports the engine authoring surface (mirroring the React `@modular-react/compositions` index). The composition outlet stays with PR-34.

- `provider.ts` — `CompositionsProvider` (`defineComponent` + render fn per D4), `useCompositionsContext`, `compositionsKey`. Provides `{ runtime }` by identity at setup — like the modules / navigation / journey contexts, the runtime is resolved once from the manifest and does not swap on the same mount, and is left un-proxied so identity checks against `manifest.extensions.compositions` hold. This also gives the React binding's memo-on-`runtime` fanout guarantee for free (the value object is captured once). Unlike `<JourneyProvider>`, it does not compose over `<ModuleExitProvider>` — composition panels emit via `useCompositionEmit`, not the global module-exit dispatcher (parity with the React provider's explicit note).
- `hooks.ts` — the panel-side composables read from a per-mount `compositionInstanceKey` injection the outlet (PR-34) installs above each zone panel: `useCompositionState` (reactive), `useCompositionDispatch`, `useCompositionEmit`, `useCompositionZone`, plus the pre-typed `createCompositionContext` bundle and the `CompositionContextValue` interface. `useRequiredContext` throws `[@modular-vue/compositions] … inside a <CompositionOutlet> zone panel` when used outside one.
- `use-composition.ts` — the host-side `useComposition` (mint an instance for the calling component) + `useCompositionOptions` + `UseCompositionOptions`, ported field-for-field including the `Symbol.for` options brand that disambiguates `options` from an `input` of shape `{ runtime: … }`.
- `plugin.ts` — `compositionsPlugin()` (real plugin object) field-for-field with the React `plugin.tsx`: `extend` (`registerComposition`, structural validation + resolved-guard), `validate` (contract validation), `onResolve` (produces the `CompositionRuntime`, resolved-twice guard), and `providers()` returning a Vue `<CompositionsProvider>` bound component instead of a React one. No `contributeNavigation` (compositions contribute no nav, matching React).

Deviations from the React source, all forced by the framework:

- **`useCompositionState` returns a `ShallowRef`, not the selected value.** The React hook returns the value directly (React re-renders on store change); the Vue port returns a `ShallowRef<TState | U>` so it stays reactive in templates / `watch`, matching the PR-10 (`useStore`) / PR-23 (`useZones`) convention. Callers read `.value`.
- **No bespoke selector-result cache.** The React `useCompositionState` caches the selector result keyed on the state reference to dodge React's "getSnapshot should be cached" warning (React invokes `getSnapshot` every render). Vue's `setup` runs once and the store push is event-driven, so a small `shallowRef` + `store.subscribe` bridge (the same shape as `@modular-vue/vue`'s internal `store-ref.ts`, reimplemented locally as journeys' `instance-hooks.ts` did rather than exporting it from the binding) is the faithful analog: `Object.is` dedupe gives selector equality, and a fresh-object selection simply re-publishes when state actually changes. The React "derived-object doesn't tear" test becomes a "fresh-object selection updates on state change" test.
- **`useComposition` mints once in `setup` with an `onScopeDispose` unsubscribe** instead of React's `useRef` lazy-init + `useEffect`. Vue's single `setup` invocation removes the StrictMode double-invoke hazard the React `useRef` dance defends against; the no-op subscription still participates in the runtime's disposal gate, so an id held without an outlet disposes on unmount (the disposal test mounts `useComposition` with no outlet and asserts teardown after the microtask gate).
- **`selector-dispatch.test.tsx` intent** is ported against a manually-provided `compositionInstanceKey` context (the outlet lands in PR-34): a panel-invoked `useCompositionDispatch` callback updates state that `useCompositionState` reflects, and `useCompositionDispatch` returns an identity-stable reference across accesses. **`use-composition.test.tsx` intent** (the binding-level parts) is ported as `use-composition.test.ts` + `plugin.test.ts`; the engine-only cases (disposed/unknown no-ops, adapter-overwrite warning, direct-construction contract validation, journey-zone cache rollover, hashInput stability, module-entry selectionKey remount) already live in the engine suite and outlet-dependent cases stay with PR-34.

Error-message prefixes are `[@modular-vue/compositions]`. Acceptance: met. 32 tests across `provider.test.ts` (3: runtime exposure through context, null without a provider, value identity stable across re-renders), `hooks.test.ts` (9: reactive state + dispatch round-trip, selector equality short-circuit, full-state form, fresh-object selection, dispatch identity stability, emit routing, zone identity, outside-panel throw, typed bundle), `use-composition.test.ts` (7: mint-once, disposal on unmount, no re-mint across re-renders, runtime-from-options, no-runtime throw, options-brand disambiguation both ways), `plugin.test.ts` (8: name, definition validation, contract validate pass/fail, `onResolve` runtime, resolved-twice guard, register-after-resolve guard, provider runtime injection), and `hooks.test-d.ts` (5: `ShallowRef` return types + typed-bundle inference). Full workspace typecheck (124 tasks) and `vite build` (JS + dts) pass; externals (`vue`, `@modular-frontend/core`, `@modular-frontend/compositions-engine`, `@modular-vue/vue`) stay unbundled.

**PR-34 (L): `@modular-vue/compositions` part 2: outlet.** Done.
Added `outlet.ts` to `packages/vue-compositions`, the Vue analog of the 1,070-LOC React `compositions/src/outlet.tsx`. Authored with `defineComponent` + render functions per D4; error-message prefixes are `[@modular-vue/compositions]`. Ships `CompositionOutlet`, its `CompositionOutletNotFoundProps` / `CompositionOutletErrorProps` types, and the test-only `__resetNoopExitWarned` latch reset. The package's parity with `@modular-react/compositions/src` is now complete.

- `CompositionOutlet` — resolves the runtime from the `runtime` prop or `<CompositionsProvider>` context (`toRaw`'d so `getInternals` finds its store), subscribes to the instance snapshot via a `shallowRef` + `runtime.subscribe` bridge (the Vue `useSyncExternalStore` analog, which also holds the record's disposal-gate listener), `__attach`/`__detach`es across mount/unmount, and renders each zone through a **scoped default slot** — the Vue analog of the React render-prop `children(zones)`. The host reads `{ [zoneName]: VNode }` and owns layout; the framework owns each zone's content.
- Cycle guards ported verbatim over a provide/inject `compositionAncestryKey` (the analog of the React `CompositionAncestryContext`): the same-instance guard and the `DEFAULT_DEFINITION_DEPTH_CAP` (8) cross-instance depth cap both render the error fallback in place of the offending outlet rather than stack-overflowing. `hashInput` / `serializeStable` / `computeSelectionKey` / `entryAllowsCompositionMount` / `NOOP_EXIT` are copied over unchanged (framework-neutral).
- `ZoneRenderer` (internal) — subscribes to the composition store for state, derives the resolution + selection key from a `computed` on state, provides the per-mount `CompositionContextValue` by identity at setup (so foreign panels reading `useCompositionState`/`useCompositionDispatch`/`useCompositionEmit` never churn), and handles the three resolution kinds: `empty` (zone `fallback`), `module-entry` (mountKinds render-time guard → `resolveEntryComponent` under `<Suspense>` with `NOOP_EXIT`), and `journey` (mount-adapter lookup with the per-`(handle, hash(input))` instance cache + roll-over end-queue drained in `onUpdated` / `onUnmounted`, keeping `adapter.end` out of render).
- `ZoneErrorBoundary` (internal) — `onErrorCaptured` returning `false` plays `getDerivedStateFromError` + `componentDidCatch`; the renderer keys it by `${selectionKey}:${retryKey}` so a selector change or a retry remounts a fresh boundary, and the `renderNullOnError` prop drives the `"ignore"` policy's null render.

Deviations from the React source, all forced by the framework:

- **The render-prop `children(zones)` becomes a scoped default slot.** `slots.default?.(zoneElements)` where each zone is a keyed `h(ZoneRenderer, …)` VNode — the same "host owns layout, framework owns content" split, expressed the Vue way.
- **State/resolution recompute reactively rather than per-render.** The zone store feeds a `shallowRef`; the selection is a `computed` on it; the retry-counter/`ignore`-flag reset moves from a commit-time `useEffect` to a `watch` on the selection key. React's render-path ref juggling (`previousSelectionKeyRef`, `selectionKeyForErrorRef`, the concurrent-render caveats) is unnecessary because Vue's `setup` runs once and effects are event-driven.
- **Errors surface on the next render.** `onErrorCaptured` queues the error ref, so the error-UI tests `await flushPromises()` / `nextTick()` before asserting (React's synchronous `getDerivedStateFromError` needs no await) — the accepted PR-11/PR-31 pattern. Snapshot updates are batched, so component-interaction tests `await` the trigger.
- **`toRaw` on the `runtime`, `modules`, and `descriptor` props** (in both `CompositionOutlet` and `ZoneRenderer`): Vue deeply proxies prop objects, which would miss `getInternals`' raw-runtime-keyed store and break `resolveEntryComponent`'s per-entry `WeakMap` cache (preload→render chunk sharing). Matches the PR-31 journeys-outlet fix.
- **The journey-zone `end`-queue drains in `onUpdated`** (React drained it in a no-deps `useEffect` after every commit) and on `onUnmounted`.

Deviations in the ported tests, all forced by the framework:

- Tests use `@vue/test-utils` `mount` with a scoped `default` slot (the repo-wide Vue test primitive), not `@testing-library/react` `render`, and wrap through `<CompositionsProvider>` so the context path is exercised. Panels are `defineComponent`s reading the panel composables.
- The React-only StrictMode cases (`StrictMode survival`, `useComposition under StrictMode`) are omitted — Vue's `setup` runs once, so there is no simulated mount/unmount/mount dance. The framework-neutral engine cases embedded in the React `.tsx` files (direct `hashInput`, `notify` listener-iteration safety, `useComposition` brand disambiguation, `hydrate` mismatch / round-trip, the `subscribe`/dispatch disposal gates, listener-throw `onError` routing, indexed contract validation) are covered by `@modular-frontend/compositions-engine`'s own suite (and PR-33's `use-composition.test.ts`) and are not re-tested through the Vue outlet; the outlet-dependent cases are ported case-for-case.
- The `NOOP_EXIT` re-fire-after-reset case calls `exit` from the panel's render function (reading a reactive slice) rather than React's every-render function body, so a real dispatch re-triggers it.

Acceptance: met. 30 new tests across `outlet.test.ts` (6: scoped-slot zone layout, state-driven zone swap, foreign-panel dispatch into a sibling zone, `emit` → `onZoneEvent`, empty-zone fallback, same-module entry swap), `outlet.behaviors.test.ts` (4: contextValue identity stability across state changes, retry-budget recovery on resolution change, `ignore` → null, journey-instance caching across dispatches), `outlet.advanced-behaviors.test.ts` (7: DAG-safe/`<cycle>`-safe journey cache, throwing `adapter.start` contained in the zone fallback, `retry-exhausted` phase + fallback, `ignore` reset on resolution rotation, no-eager selector-call gating, state read through provider context), `mount-kinds-runtime.test.ts` (4: journey-only guard + the composition/default/both allowances), and `runtime.rendering.test.ts` (9: selector-throw recovery, custom `notFoundComponent`, journey-without-adapter error, two-outlets propagation + disposal, non-journey no-adapter render, same-instance cycle, definition-depth cap, `NOOP_EXIT` dev-warn once-per-name + reset, hydration-hold survives outlet unmount). Package total 62 (32 from PR-33 + 30 new). Full workspace typecheck (124 tasks) and `vite build` (JS + dts) pass; externals (`vue`, `@modular-frontend/core`, `@modular-frontend/compositions-engine`, `@modular-vue/vue`) stay unbundled.

### Phase 4: example, docs, parity audit

**PR-40 (L): `examples/vue` example apps.** Done.
Mirrors the `examples/react-router` / `examples/tanstack-router` layout (a family of focused example workspaces, matching how tanstack-router mirrored react-router) rather than one combined app — three example workspaces under `examples/vue/`, each self-contained, SFC-authored (decision D4), and wired with the patterns the docs will teach:

- **`integration-manager`** — sibling modules sharing a screen. Three route modules (contentful/strapi/github) render the same `IntegrationManager.vue`; the shell owns the router and grafts module routes via `createModularApp(registry, { router, parentRouteName })`, reads the active integration through `useRouteData<AppRouteData>()` off vue-router `meta` (typed via a `RouteMeta` augmentation in `app-shared`).
- **`customer-onboarding-journey`** — the `profile → plan → billing` journey via `@modular-vue/journeys`. Journey steps are module-entry SFCs (`defineProps<ModuleEntryProps<…>>()`), one lazy step (`billing/collect`), workspace-tab persistence via a `reactive` store + `createWebStoragePersistence`, and tab rehydration with `UnknownJourneyError` discrimination. Uses `resolveManifest()` so the plugin's `<JourneyProvider>` is threaded into `Providers`. Scoped to the single onboarding journey (PR-40's "one journey") — the React example's extra plan-switch / quick-bill / launcher surfaces are out of scope here.
- **`editor-composition`** — the editor screen via `@modular-vue/compositions`. `CompositionOutlet`'s render-prop becomes a scoped default slot (`<component :is="zones.x" />`); the cross-team `WritableStore` projection is read with a small `useReactiveStore` bridge (Vue's `useSyncExternalStore` analog), and the inspector uses the in-team `useCompositionState`.

Enabling changes (forced by the framework, applied outside the example dirs):

- **SFC tooling.** Added `@vitejs/plugin-vue` + `vue-tsc` as example devDeps; packages containing or importing `.vue` typecheck with `vue-tsc --noEmit` (pure-TS packages keep `tsc --noEmit`).
- **Neutral entry validator accepts object components.** `@modular-frontend/core`'s `validateModuleEntryExit` previously required `component` to be a _function_ (React-centric). Vue SFCs / `defineComponent` compile to objects, so real SFC journey/composition entry modules failed `resolveManifest()` validation (the PR-30..34 tests sidestepped this with functional components). Relaxed the check to accept a function **or** a non-null object (also covers React `memo`/`forwardRef`), and made the message framework-neutral. One `entry-exit.test.ts` assertion updated to match; all 277 frontend-core tests pass.

CI: registered the three e2e shells in the `examples-e2e` matrix (`@example-vue-integration-manager/shell`, `@example-vue-onboarding/shell`, `@example-vue-editor/shell`) and extended the changed-files trigger to the vue binding / journeys / compositions / engine / frontend-core paths. The always-on `examples` job already typechecks + builds every example.
Acceptance: met. `pnpm --filter "@example-vue-*/shell" dev` runs each app; each ships a headless Playwright smoke suite (3 + 6 + 6 specs) that boots the shell on Vite and drives the core flow (navigation + route-data adaptation; start → advance → reload-resume → terminal → close; zone swap + cross-panel state write-through). All pass locally.

**PR-41 (M, docs only): Documentation.** Done.
Added `getting-started-vue-router.md` (a **manual-setup** walkthrough — the `@modular-vue/cli` scaffolder is PR-50, still todo, so the guide builds the workspace by hand: contract → module → shell → second module → zones via `meta` → store → `beforeEach` auth) and `shell-patterns-vue-router.md` (router-owning vs framework mode, module route shape, zones and route data via `meta`, the `RouteMeta` augmentation, `useRouteData`, and the `authGuard` → `router.beforeEach` boundary). Added a "Reading navigation in a Vue shell" section + Vue "See also" links to `docs/navigation.md`; a "Using this with Vue" section to the journeys and compositions READMEs (pointing at `@modular-vue/journeys` / `@modular-vue/compositions`, the shared engine, and the ref-returning composables); and to the root README: the D1 tagline softening (React Router / TanStack / Vue Router, with a "the name is historical" note), a Vue quickstart entry, Vue getting-started / shell-patterns guide rows, a compact Vue `defineModule` + shell snippet, the three `examples/vue/*` entries, and package tables for the Vue Router integration and the framework-neutral `@modular-frontend/*` engine.
Deviation from the plan, forced by sequencing: the acceptance line named `npx @modular-vue/cli init` "after PR-50"; since PR-50 hasn't landed, the getting-started guide is the manual-setup path and flags the CLI as roadmap. All doc code is grounded in the shipped `examples/vue/*` apps and the real package exports.
Acceptance: met via the manual-setup path — a developer can go from an empty directory to a running two-module Vue app following only `getting-started-vue-router.md`.

**PR-42 (S): Parity audit.** Done.
Compared the exported API surface and the test-case inventory of every `@modular-vue/*` package against its React-router counterpart (and the shared `@modular-frontend/*` engine). Results are in the [Parity audit (PR-42)](#parity-audit-pr-42) section below: functional parity holds across all six packages, with two follow-up gaps filed (PR-44: no Vue `createJourneyMountAdapter`, so journey-in-composition-zone is not yet wireable in the Vue family; PR-43: `simulateJourney` / `JourneySimulator` is not re-exported by any Vue package). **Both follow-ups have since landed — see PR-44 and PR-43 in [Gaps](#gaps-tracked-follow-ups) — so the Vue family is now at full parity.** Added a "new core features must state their Vue impact" line to Working agreements and a repo PR-template checklist enforcing it. Promoted all six `@modular-vue/*` packages from `0.1.0` to `1.0.0` and bumped their inter-package peer ranges to `^1.0.0`.
Acceptance: met — parity table appended below with every gap explained and tracked; Vue packages promoted to 1.0.

### Phase 5: tooling and stretch

**PR-50 (M): `@modular-vue/cli`.**
Preset over the PR-04 `cli-core` interface with SFC template bodies: shell, module, journey, store (core store per D3), app-shared, workspace. Snapshot test of the generated tree; generated app passes its own `lint`/`typecheck`/`test`.

**PR-51 (S): Catalog Vue support.** Done.
Enabled the `@modular-react/catalog` harvester to load `@modular-vue/*` descriptors and wired a Vue example into the demo catalog.

- **Descriptor detection was already Vue-ready.** `detect.ts` (`isModuleDescriptor` / `isJourneyDefinition`), `resolve.ts` (resolver styles), and `ast-destinations.ts` (transition-destination recovery) are all **duck-typed / structural** — they key on descriptor shape and AST node shape, never on a package name. Vue module descriptors carry the same `createRoutes` / `navigation` / `requires` fields and Vue journeys use the same `@modular-frontend/journeys-engine` shape (`transitions` / `start` / `initialState`), so they were detected and cross-referenced without change. The plan line "teach detect.ts/resolve.ts the Vue package names" turned out to be a no-op: there are no package-name checks to teach. The only type-level touch point is a type-only `import type { AnyModuleDescriptor } from "@modular-react/core"`, structurally identical to the Vue descriptor.
- **The real gap was the SSR loader.** Vue descriptors eagerly `import Page from "./Page.vue"`, and the harvester's SSR server runs `configFile: false` with `plugins: []`, so Vite had no transform for `.vue` and every Vue descriptor failed to load. Added a `plugins?: PluginOption[]` field to `CatalogConfig`, threaded through `harvest` → `createCatalogSsrServer` → `buildSsrServerConfig` (mirroring the existing `resolve` passthrough). A Vue catalog config now passes `plugins: [vue()]`; the plugin is inert for React/TSX files, so a mixed React + Vue scan lists it unconditionally.
- **Fixture + tests.** Added a `.vue`-importing module fixture (`test/fixtures/vue-modules/`) and two `harvest` tests — it loads with `plugins: [vue()]` and errors non-fatally without (proving the plugin is what closes the gap) — plus an `ssr-server.test.ts` case asserting plugin forwarding. `@vitejs/plugin-vue` + `vue` added as catalog devDeps.
- **Demo catalog now spans two frameworks.** `examples/catalog/catalog.config.ts` adds a `vue-integrations` root over the `@modular-vue` `integration-manager` example (modules `contentful` / `github` / `strapi`, chosen because the Vue `customer-onboarding-journey` shares module/journey ids with the tanstack onboarding root already scanned — `buildModel` rejects duplicate ids across roots). The demo emits 9 modules + 3 journeys; the Playwright e2e spec was updated to match (9-module counts, Vue modules at `0.0.0` with no owner team via a `versionFor` helper) and passes 12/12.

Acceptance: met. Verified end-to-end by running the real `modular-react-catalog build` CLI over the Vue examples: (a) the mixed demo build emits a correct model and all 12 e2e specs pass; (b) a build over `examples/vue/customer-onboarding-journey` produces `modulesUsed: [billing, plan, profile]` + `moduleCompat` for the `customer-onboarding` journey, and the AST analyzer recovers declared transition destinations from the Vue journey source (`profile.review.profileComplete → { module: plan, entry: choose }`, `targetsDeclared: true`) exactly as for React journeys. Note: transition-destination recovery reads the single harvested `sourcePath`, so a journey that splits its definition behind a re-exporting `index.ts` (as the Vue example does) yields the cross-reference graph but empty AST destinations from the index — pre-existing, framework-neutral behavior, not a Vue gap.

**PR-52 (stretch, L): Nuxt module.** Blocked by D6 and demand signal.
A Nuxt module that registers the family at app setup, plus a `framework-mode-nuxt.md` doc. Deliberately unscoped until the SPA story has users.

## Parity audit (PR-42)

Compares every `@modular-vue/*` package against its React-router counterpart —
exported API surface and test-case inventory — and records each difference as
either an **idiomatic difference** (same capability, framework-appropriate shape)
or a **gap** (missing capability, tracked as a follow-up). Test counts are from a
full `pnpm --filter … test` run; the React-router family is the reference
because the Vue family mirrors it package-for-package (decision D1).

### Package parity

| `@modular-vue/*`            | React counterpart               | Shared engine/core                      | Surface parity                                                                    |
| --------------------------- | ------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| `@modular-vue/vue`          | `@modular-react/react`          | `@modular-frontend/core`                | Full — composables for hooks, injection keys for contexts                         |
| `@modular-vue/core`         | `@react-router-modules/core`    | `@modular-frontend/core`                | Full + `ModuleRouteMeta` (typed `meta`, no RR analog)                             |
| `@modular-vue/runtime`      | `@react-router-modules/runtime` | `@modular-frontend/core`                | Full — route-builder/provider factories replace RR's route-tree + context objects |
| `@modular-vue/testing`      | `@react-router-modules/testing` | `@modular-frontend/testing`             | Full (incl. `simulateJourney`, PR-43); adds `preloadEntries`                      |
| `@modular-vue/journeys`     | `@modular-react/journeys`       | `@modular-frontend/journeys-engine`     | Full (incl. `createJourneyMountAdapter`, PR-44)                                   |
| `@modular-vue/compositions` | `@modular-react/compositions`   | `@modular-frontend/compositions-engine` | Full — render-prop becomes a scoped default slot                                  |

### Idiomatic differences (same capability, different shape)

These are deliberate and expected; they are not gaps.

- **Hooks → composables; context objects → injection keys.** React exports
  context objects (`NavigationContext`, `SlotsContext`, `ModulesContext`,
  `RecalculateSlotsContext`, `DynamicSlotsProvider`); Vue exports the equivalent
  injection keys + `provide*`/`use*` helpers (`navigationKey`/`provideNavigation`,
  `slotsKey`, `modulesKey`, `moduleExitKey`, …). `createSharedHooks` →
  `createSharedComposables`.
- **Reactive composables return refs.** `useZones`/`useRouteData`/`useActiveZones`
  return a `ComputedRef`; `useSlots`/`useStore`/`useReactiveService` return a
  `Ref`; the journeys/compositions state composables return `ComputedRef`/
  `ShallowRef`. The set-once contexts (`useNavigation`, `useModules`,
  `useService`) return plain values, matching React's plain returns.
- **Route-tree builder → runtime graft.** vue-router registers routes at runtime,
  so React's `buildRouteTree` (returns a nested tree for `createRouter`) becomes
  `graftModuleRoutes` + `createLazyModuleRoute` (mutate a live router via
  `router.addRoute()`). The Vue runtime therefore also exports
  `createModularProvidersPlugin` / `createModularProvidersComponent` and
  `createModularApp`, which have no RR analog because RR owns the app root.
- **Component prop-type exports are React-only.** RR exports `ModuleRouteProps`,
  `ModuleTabProps`, `JourneyProviderProps`, `CompositionsProviderProps`,
  `ModuleExitProviderProps`. Vue `defineComponent`s declare props internally and
  infer them, so there are no prop-type exports to mirror. No capability lost.
- **Typed `meta` beats untyped `handle`.** `@modular-vue/core` adds
  `ModuleRouteMeta` and the app augments vue-router's global `RouteMeta`, so route
  data is type-checked at the source — stronger than RR7's `unknown` `handle` +
  per-call-site `satisfies`, on par with TanStack's `StaticDataRouteOption`.
- **`createMockStore` is shared.** Both families re-export it from
  `@modular-frontend/testing` (the router-specific React CLIs keep a local
  zustand `createMockStore`; that split is React-internal and irrelevant to Vue).

### Gaps (tracked follow-ups)

Both gaps identified by the audit are now closed; the Vue family is at full
parity with the React-router family.

- **PR-44 — `@modular-vue/journeys` `createJourneyMountAdapter` (journey-in-zone). Done.**
  React ships `createJourneyMountAdapter` so a composition zone can mount a
  journey (`registerMountAdapter("journey", createJourneyMountAdapter(runtime))`).
  The Vue `CompositionOutlet` already _supported_ `kind: "journey"` resolutions and
  its own error message instructed the user to register exactly such an adapter —
  but no Vue `createJourneyMountAdapter` existed to pass. Now added
  (`packages/vue-journeys/src/mount-adapter.ts`, the Vue analog of
  `@modular-react/journeys`'s `mount-adapter.ts`), exported from the package index.
  With it, journey-in-composition-zone — the one advanced cross-feature
  integration previously not wireable on Vue — is at parity; every other surface
  already was.
  **One deviation from the React source, and why:** React returns the bare
  `JourneyOutlet` as `Outlet` and lets it read the runtime from the ambient
  `<JourneyProvider>` the journeys plugin threads app-wide. The Vue
  `<CompositionOutlet>` renders `adapter.Outlet` with only
  `{ instanceId, loadingFallback }` (no `runtime`), so the Vue adapter binds the
  runtime it was handed into a thin wrapper component. This makes the adapter
  self-contained — it mounts instances against exactly the runtime passed to
  `createJourneyMountAdapter`, with or without a `<JourneyProvider>` above the
  composition outlet — rather than depending on an ambient context that must
  happen to hold the same runtime. Tests (`mount-adapter.test.ts`, 4) exercise the
  adapter the way the composition outlet uses it: `start()` forwards to the
  runtime and returns a live id, `Outlet` renders and drives the instance to its
  terminal with no provider mounted, and `end()` forwards with the
  `{ reason: "adapter-end" }` cascade reason.
- **PR-43 — `simulateJourney` / `JourneySimulator` re-export. Done.** The headless
  journey simulator is framework-neutral and lives in the engine
  (`@modular-frontend/journeys-engine/testing`); React re-exports it from
  `@react-router-modules/testing`. It is now re-exported from `@modular-vue/testing`
  as well, through a new `@modular-vue/journeys/testing` subpath (added to the
  package `exports` map + the vite multi-entry build, mirroring React's
  `@modular-react/journeys/testing`). Vue test code now has the same single import
  surface React has, and can also import the simulator (plus `createTestHarness`)
  from `@modular-vue/journeys/testing` directly. Test (`simulate-journey.test.ts`, 2) drives a journey headlessly through the re-exported surface to its terminal.

### Test inventory

| Package             | Vue tests (files) | React counterpart tests (files) | Notes                                                                                          |
| ------------------- | ----------------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `vue` / `react`     | 75 (11)           | 68 (11)                         | +reactivity (subscribe/unsubscribe, selector eq.)                                              |
| `core`              | 15 (4)            | 14 (2)                          | +`route-meta` / `index` barrel `.test-d`                                                       |
| `runtime`           | 124 (12)          | 109 (9)                         | +`journeys-integration`, split registry suites                                                 |
| `testing`           | 22 (4)            | 9 (2) + 6 shared                | +`simulate-journey` re-export (PR-43); `resolve-module` (6) now in `@modular-frontend/testing` |
| `journeys`          | 88 (11)           | 72 (8)                          | +`mount-adapter` (PR-44); engine (346) shared via `@modular-frontend/journeys-engine`          |
| `compositions`      | 62 (10)           | 63 (8)                          | engine (52) shared via `@modular-frontend/compositions-engine`                                 |
| **Total (binding)** | **386 (52)**      | **335 (40)**                    | React-only StrictMode / sync-thenable cases excepted throughout                                |

Every Vue suite ports its React counterpart case-for-case except the React-only
cases the per-PR notes above enumerate (StrictMode double-mount, `React.lazy`
synchronous-thenable fallback-flash). The higher Vue counts come from added
reactivity/navigation-recompute cases and from splitting some React suites
(e.g. registry plugins vs. registry journeys) rather than from new behavior.

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

- All Vue packages start at `0.1.0` and stay 0.x until PR-42. **(Done — PR-42 promoted all six `@modular-vue/*` packages from `0.1.0` to `1.0.0` and bumped their inter-package peer ranges to `^1.0.0`. Peers on `@modular-frontend/*`, `vue`, `vue-router`, and `@vue/test-utils` are unchanged.)**
- Engine packages (PR-02/03) start at the version of the package they were extracted from, since their API is already stable.
- **Engine peer-range policy.** The 1.0 binding families (`@modular-vue/*`, and the React families) peer-depend on `@modular-frontend/*` with tight ranges (`^0.1.0` while `core`/`testing`/`compositions-engine` are 0.x — under semver, `^0.1.0` excludes 0.2.x). This is deliberate: the engines are internal shared infrastructure, and any `@modular-frontend/*` version bump ships with coordinated peer-range bumps and releases of every dependent binding package in the same batch, so a published binding release is never left peering on an unavailable engine range. Promoting the 0.x engines to 1.0 is open until their surface stops moving; nothing about the bindings' 1.0 status depends on it.
- `@modular-react/journeys` and `@modular-react/compositions` releases after extraction are patch/minor (re-export shim, no API change).
- 1.0 for the whole `@modular-vue/*` family ships together, after the parity audit, example, and docs. **(Shipped in PR-42.)**

## Risks

- **Reactivity semantics drift.** `useSyncExternalStore` has synchronous-snapshot semantics; Vue batches effects. Journey/composition outlets must not observe stale store state during route transitions. Mitigation: the engine suites are timing-agnostic already; add explicit ordering tests in PR-31/PR-34 (this is the most likely source of subtle behavior differences).
- **Test porting dominates the schedule.** ~1054 existing test cases; the UI-facing ones need rewriting, not copying. Mitigation: port test intent per PR (listed above) rather than as a big-bang phase, and let the parity audit (PR-42) catch omissions.
- **Maintenance drift after 1.0.** Every core change now has three integration surfaces. Mitigation: the PR-42 CI/checklist item; keeping engines extracted means most feature work lands framework-neutral by construction.
- **Docs are half the product.** The React docs are extensive; PR-41 is one PR but the largest writing task. Keep it scoped to getting-started + shell-patterns and grow the rest on demand.
- **Windows CI quirk.** `@tanstack-react-modules/cli` tests already hit EPERM on `.test-output` cleanup on Windows; the Vue CLI (PR-50) will likely inherit the same pattern. Reuse whatever mitigation the existing CLIs use.
- **Scope squatting.** Reserve npm scopes (PR-05) before announcing anything.

## Status board

Update the Status column as PRs move: `todo` → `in progress` → `in review` → `done` (link the PR).

| PR    | Title                                                             | Size | Depends on          | Status                        |
| ----- | ----------------------------------------------------------------- | ---- | ------------------- | ----------------------------- |
| PR-01 | Neutralize renderable types in core                               | S    | —                   | done (#54)                    |
| PR-02 | Extract journeys engine                                           | L    | D2                  | done (#55)                    |
| PR-03 | Extract compositions engine                                       | L    | D2                  | done (#56)                    |
| PR-04 | cli-core framework-pluggable templates                            | M    | —                   | done                          |
| PR-05 | CI/publish plumbing, scope reservation                            | S    | D1                  | todo                          |
| PR-10 | @modular-vue/vue: stores and context                              | M    | PR-01               | done                          |
| PR-11 | @modular-vue/vue: rendering pieces                                | M    | PR-10               | done                          |
| PR-12 | @modular-vue/testing                                              | S    | PR-11               | done                          |
| PR-20 | @modular-vue/core                                                 | M    | PR-10               | done                          |
| PR-21 | runtime: registry                                                 | M    | PR-20               | done                          |
| PR-22 | runtime: route building, app plugin, guards                       | M    | PR-21               | done                          |
| PR-23 | runtime: zones and route data                                     | M    | PR-22               | done                          |
| PR-24 | @modular-vue/testing renderModule                                 | S    | PR-23               | done                          |
| PR-30 | vue journeys: provider and composables                            | M    | PR-02, PR-10        | done (#69)                    |
| PR-31 | vue journeys: outlet                                              | L    | PR-30               | done                          |
| PR-32 | journeys wired into runtime + renderJourney                       | M    | PR-22, PR-31        | done                          |
| PR-33 | vue compositions: provider and composables                        | M    | PR-03, PR-10        | done (#72)                    |
| PR-34 | vue compositions: outlet                                          | L    | PR-33               | done                          |
| PR-35 | JourneyHost + useJourneySync (React + Vue)                        | M    | PR-31               | done                          |
| PR-40 | examples/vue                                                      | L    | PR-23, PR-32, PR-34 | done                          |
| PR-41 | Documentation                                                     | M    | PR-40               | done                          |
| PR-42 | Parity audit, promote to 1.0                                      | S    | PR-40               | done                          |
| PR-43 | @modular-vue/testing simulateJourney re-export                    | S    | PR-42               | done (parity-audit follow-up) |
| PR-44 | @modular-vue/journeys createJourneyMountAdapter (journey-in-zone) | S    | PR-31, PR-34        | done (parity-audit follow-up) |
| PR-50 | @modular-vue/cli                                                  | M    | PR-04, PR-40        | todo                          |
| PR-51 | Catalog Vue support                                               | S    | PR-40               | done                          |
| PR-52 | Nuxt module (stretch)                                             | L    | D6, 1.0             | todo                          |

## Working agreements

- One PR per row above; if a PR grows past its size class, split it and add a row rather than letting it balloon.
- Every PR that adds a Vue analog of a React file names the React source file in its description, so reviewers can diff intent.
- Every PR updates this document (status board, decision outcomes, and any scope changes) in the same commit.
- No Vue package publishes above 0.x before PR-42 is done. **(Satisfied — PR-42 promoted all `@modular-vue/*` to 1.0.)**
- **Every core feature change states its Vue impact.** Now that `@modular-vue/*` is 1.0, a change to `@modular-frontend/*` (core, engines, testing) or a new capability in a React binding must say, in the PR description, whether the Vue family needs the same change — and either make it or file a follow-up row here. The repo PR template (`.github/PULL_REQUEST_TEMPLATE.md`) carries a checklist item enforcing this. Keeping the engines extracted means most feature work lands framework-neutral by construction, so the common answer is "covered by the shared engine."
