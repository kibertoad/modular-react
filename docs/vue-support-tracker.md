# Vue support initiative: plan and tracker

Status: **Phase 0 in progress** (PR-01, PR-02 landed). Last updated: 2026-07-05.
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

| New package                   | Mirrors                                      | Contents                                                                                                                                                                               |
| ----------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@modular-vue/vue`            | `@modular-react/react`                       | Injection keys and providers (modules, navigation, slots), store composables, scoped-store composable, error-capture wrapper, entry resolution via `defineAsyncComponent`, module-exit |
| `@modular-vue/journeys`       | React parts of `@modular-react/journeys`     | Journey provider, instance composables, outlet, module-tab, wait-for-exit                                                                                                              |
| `@modular-vue/compositions`   | React parts of `@modular-react/compositions` | Composition provider, composables, outlet                                                                                                                                              |
| `@modular-vue/testing`        | `@modular-react/testing`                     | `resolveModule`, `createMockStore`, `preloadEntries`                                                                                                                                   |
| `@vue-router-modules/core`    | `@react-router-modules/core`                 | `defineModule` (with `createRoutes(): RouteRecordRaw[]`), `defineSlots`, shared composable context, scoped store, types                                                                |
| `@vue-router-modules/runtime` | `@react-router-modules/runtime`              | Registry, route-builder, app/providers as a Vue plugin, zones, active-zones, route-data                                                                                                |
| `@vue-router-modules/testing` | `@react-router-modules/testing`              | `renderModule`, `renderJourney`, mock store                                                                                                                                            |
| `@vue-router-modules/cli`     | `@react-router-modules/cli`                  | `cli-core` preset + SFC templates                                                                                                                                                      |

Shared engine packages under the `@modular-frontend` scope (decision D2, resolved). `journeys-engine` is extracted; `compositions-engine` is still planned (PR-03):

| New package                             | Extracted from                | Contents                                                                                                                                                                       |
| --------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@modular-frontend/journeys-engine`     | `@modular-react/journeys`     | `runtime.ts`, `validation.ts`, `define-journey.ts`, `define-transition.ts`, `persistence.ts`, `select-module.ts`, `simulate-journey.ts`, `handle.ts`, `types.ts`, `testing.ts` |
| `@modular-frontend/compositions-engine` | `@modular-react/compositions` | `runtime.ts`, `stores.ts`, `validation.ts`, `define-composition.ts`, `types.ts`                                                                                                |

`mount-adapter.ts` stays in `@modular-react/journeys`, not the engine: `createJourneyMountAdapter` supplies `Outlet: JourneyOutlet` (a React component), so it is binding-specific glue over the neutral `RuntimeMountAdapter` seam rather than engine logic.

`@modular-react/journeys` and `@modular-react/compositions` keep their public API by re-exporting the engine, so existing React users see no breaking change.

## Decisions

Record the outcome inline when made. Blockers are marked per PR.

| ID  | Decision                                                                                                                                                                     | Recommendation                                                                                                                                                                                  | Status                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| D1  | npm scopes for the Vue family (`@modular-vue`, `@vue-router-modules`) and repo positioning (does the `modular-react` repo host Vue packages, or does it get a neutral name?) | Keep this repo, add the scopes, soften the README tagline. Reserve both scopes on npm before any code PR.                                                                                       | open                                                                              |
| D2  | Scope and name for the extracted engines                                                                                                                                     | A neutral scope shared by both families, e.g. `@modular-frontend`, holding `journeys-engine` and `compositions-engine`. Avoid putting "react" or "vue" in the name.                             | resolved: `@modular-frontend` (core extracted in #54; `journeys-engine` in PR-02) |
| D3  | Store story for Vue templates: core store vs Pinia                                                                                                                           | Scaffold with the core `createStore` (zustand-shaped, already the framework contract) and document Pinia interop in a guide section. Do not take a Pinia dependency in runtime packages.        | open                                                                              |
| D4  | Authoring style inside Vue library packages: SFC vs `defineComponent` + render functions                                                                                     | `defineComponent` + `h()` for library internals (no `@vitejs/plugin-vue` needed in package builds, better generics); SFCs in CLI templates and the example app, since that is what users write. | open                                                                              |
| D5  | Minimum supported versions                                                                                                                                                   | Vue ^3.5, vue-router ^4.5, Node 22+, aligned with the React 19 / Node 22 baseline.                                                                                                              | open                                                                              |
| D6  | Is Nuxt in scope for 1.0?                                                                                                                                                    | No. Ship SPA-first, gauge demand, then decide on PR-52.                                                                                                                                         | open                                                                              |

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

**PR-03 (L, mostly moves): Extract `<engine-scope>/compositions-engine`.** Blocked by D2.
Same treatment for `runtime.ts`, `stores.ts`, `validation.ts`, `define-composition.ts`, `types.ts` and their non-`.tsx` tests. Note `stores.ts` contains `useSyncExternalStore`-motivated referential-stability logic; keep it as-is in the engine (it is still pure), and let the Vue binding ignore the parts it does not need.
Acceptance: same criteria as PR-02.

**PR-04 (M): Make `cli-core` framework-pluggable.**
Today `cli-core/src/templates/*` emit React/JSX source and the store template emits zustand. Move framework-specific template bodies behind the preset interface (`preset.ts`) so a preset supplies `shell`, `module`, `journey`, `store`, `app-shared` bodies, and `cli-core` keeps only the command engine, `naming.ts`, `transform.ts`, `workspace.ts`, and `runtime-versions.ts`. Rehome the React template bodies into the two existing router CLIs (or a shared react-templates module they both import).
Acceptance: both existing CLIs produce byte-identical scaffolds before and after (snapshot the generated tree in a test); `cli-core` no longer contains JSX-emitting strings.

**PR-05 (S): CI, publish, and workspace plumbing for the new scopes.**
Extend `publish.yml` / version-bump automation and `ensure-labels.yml` to cover the new package names; confirm `pnpm-workspace.yaml` globs already match (they do: `packages/*`); reserve the npm scopes (D1) and publish `0.0.0` placeholders if squatting is a concern.
Acceptance: a dry-run publish lists all new packages; CI runs their (empty) test suites.

### Phase 1: Vue binding layer

**PR-10 (M): `@modular-vue/vue` part 1: stores and context.**
Package skeleton (vite build, vitest + happy-dom + `@vue/test-utils`, matching the repo's package.json conventions). Store bridge: composables that wrap the core `Store<T>` via `shallowRef` + `subscribe` (`useStore`, `useStoreSelector`), `createSharedComposables` (analog of `createSharedHooks`), scoped-store composable, typed `InjectionKey`s and providers for modules / navigation / slots contexts. Port the corresponding test intent from `context.test.tsx`, `context-reactivity.test.tsx`, `modules-context.test.tsx`, `navigation-context.tsx` tests, `slots-context.test.tsx`, `scoped-store.test.tsx`.
Acceptance: reactivity tests cover subscribe/unsubscribe on unmount, selector equality, and store replacement, mirroring the React suite case-for-case.

**PR-11 (M): `@modular-vue/vue` part 2: rendering pieces.**
Entry resolution via `defineAsyncComponent` (analog of `resolve-entry.ts` + `React.lazy`), module-route and module-exit components, error-capture wrapper via `onErrorCaptured` (analog of `error-boundary.tsx`). Port test intent from `resolve-entry.test.tsx`, `module-route.test.tsx`, `module-exit.test.tsx`, `error-boundary.test.tsx`.
Acceptance: lazy entries resolve, errors in module components are contained and surfaced through the same callback contract as the React error boundary.

**PR-12 (S): `@modular-vue/testing`.**
Port `resolveModule`, `createMockStore`, `preloadEntries` from `@modular-react/testing` (they are mostly pure; only the preload path touches the binding layer).
Acceptance: test parity with `testing/src/*.test.ts`.

### Phase 2: vue-router family

**PR-20 (M): `@vue-router-modules/core`.**
Mirror `react-router-core/src`: `types.ts` (a `ModuleDescriptor` whose `createRoutes()` returns `RouteRecordRaw[]`), `define-module.ts`, `define-slots.ts`, `is-store-api.ts`, `scoped-store.ts`, shared composable context. Includes the `RouteMeta` augmentation pattern the runtime will rely on.
Acceptance: type-level tests (`.test-d.ts`) for descriptor inference match the React-router core's coverage.

**PR-21 (M): `@vue-router-modules/runtime` part 1: registry.**
Port `registry.ts`: `createRegistry`, module registration, dependency wiring and validation, journey registration hooks (interface only; wired in PR-32). Reuses core validation directly.
Acceptance: port of `registry.test.tsx` and `registry-journeys.test.ts` (registry-level cases; rendering cases deferred to PR-22/PR-32).

**PR-22 (M): `@vue-router-modules/runtime` part 2: route building and app shell.**
`route-builder.ts` using `router.addRoute()` (no frozen-tree or pathless-layout workarounds needed), `providers.ts`/`app.ts` as a Vue plugin (`app.use(createModularApp(...))`) that installs the injection contexts and registers routes, auth guard via `router.beforeEach` driven by module metadata. Port test intent from `route-builder.test.tsx`, `resolve-manifest.test.tsx`, `app.tsx` tests.
Acceptance: an integration test boots a memory-history router with two modules, navigates between them, and exercises lazy module mounting after `createRouter`.

**PR-23 (M): `@vue-router-modules/runtime` part 3: zones and route data.**
`zones.ts`, `active-zones.ts`, `route-data.ts` over `useRoute().matched` and `route.meta`, funneling through core's `mergeRouteStaticData` (deepest-wins) and `createRouteDataOverrideWarner`. Port `zones.test.tsx`, `active-zones.test.tsx`, `route-data.test.tsx`, `slots.test.ts`.
Acceptance: deepest-wins merge behavior matches the React suites, including the override warning cases.

**PR-24 (S): `@vue-router-modules/testing`.**
`renderModule` with `@testing-library/vue`, `mock-store.ts`, `resolveModule` re-export. (`renderJourney` lands with PR-32.)
Acceptance: parity with `react-router-testing/src` minus the journey helper.

### Phase 3: Journeys and Compositions on Vue

**PR-30 (M): `@modular-vue/journeys` part 1: provider and composables.**
Journey provider, `useJourneyState`, instance composables over the engine's store surface (analogs of `provider.tsx`, `instance-hooks.ts`, `use-journey-state.ts`), plugin contribution type (analog of `plugin.tsx`, which is type-only React today and becomes type-only Vue).
Acceptance: port of `provider.test.tsx`, `use-journey-state.test.tsx` intent.

**PR-31 (L): `@modular-vue/journeys` part 2: outlet.**
The largest single rewrite: outlet (analog of `outlet.tsx`, 555 LOC), `module-tab`, `use-wait-for-exit`, mount-kind rendering. Port test intent from `outlet.test.tsx`, `outlet-invoke.test.tsx`, `outlet-preload.test.tsx`, `module-tab.test.tsx`, `mount-kinds-runtime.test.tsx`, `use-wait-for-exit.test.tsx`.
Acceptance: the full journey lifecycle (enter, branch, go-back, go-forward, rewind-to, complete, abort, persistence resume) demonstrated in component tests against the real engine, matching the React outlet suites case-for-case.

**PR-32 (M): Journeys wired into `@vue-router-modules/runtime` + `renderJourney`.**
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
Acceptance: a developer can go from `npx @vue-router-modules/cli init` (after PR-50) or manual setup to a running two-module app following only the docs.

**PR-42 (S): Parity audit.**
Compare exported API surface and test-case inventory between the React-router and vue-router families; file follow-up issues for gaps; add a CI check or checklist that new core features must state their Vue impact.
Acceptance: a parity table appended to this document with no unexplained gaps; Vue packages promoted from 0.x to 1.0 after this PR.

### Phase 5: tooling and stretch

**PR-50 (M): `@vue-router-modules/cli`.**
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
- 1.0 for `@modular-vue/*` and `@vue-router-modules/*` ships together, after the parity audit, example, and docs.

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
| PR-03 | Extract compositions engine                 | L    | D2                  | todo       |
| PR-04 | cli-core framework-pluggable templates      | M    | —                   | todo       |
| PR-05 | CI/publish plumbing, scope reservation      | S    | D1                  | todo       |
| PR-10 | @modular-vue/vue: stores and context        | M    | PR-01               | todo       |
| PR-11 | @modular-vue/vue: rendering pieces          | M    | PR-10               | todo       |
| PR-12 | @modular-vue/testing                        | S    | PR-11               | todo       |
| PR-20 | @vue-router-modules/core                    | M    | PR-10               | todo       |
| PR-21 | runtime: registry                           | M    | PR-20               | todo       |
| PR-22 | runtime: route building, app plugin, guards | M    | PR-21               | todo       |
| PR-23 | runtime: zones and route data               | M    | PR-22               | todo       |
| PR-24 | @vue-router-modules/testing                 | S    | PR-23               | todo       |
| PR-30 | vue journeys: provider and composables      | M    | PR-02, PR-10        | todo       |
| PR-31 | vue journeys: outlet                        | L    | PR-30               | todo       |
| PR-32 | journeys wired into runtime + renderJourney | M    | PR-22, PR-31        | todo       |
| PR-33 | vue compositions: provider and composables  | M    | PR-03, PR-10        | todo       |
| PR-34 | vue compositions: outlet                    | L    | PR-33               | todo       |
| PR-40 | examples/vue-router                         | L    | PR-23, PR-32, PR-34 | todo       |
| PR-41 | Documentation                               | M    | PR-40               | todo       |
| PR-42 | Parity audit, promote to 1.0                | S    | PR-40               | todo       |
| PR-50 | @vue-router-modules/cli                     | M    | PR-04, PR-40        | todo       |
| PR-51 | Catalog Vue support                         | S    | PR-40               | todo       |
| PR-52 | Nuxt module (stretch)                       | L    | D6, 1.0             | todo       |

## Working agreements

- One PR per row above; if a PR grows past its size class, split it and add a row rather than letting it balloon.
- Every PR that adds a Vue analog of a React file names the React source file in its description, so reviewers can diff intent.
- Every PR updates this document (status board, decision outcomes, and any scope changes) in the same commit.
- No Vue package publishes above 0.x before PR-42 is done.
