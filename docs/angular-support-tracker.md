# Angular support initiative: plan and tracker

Status: **Proposed, not started.** Last updated: 2026-07-06.
Background and feasibility reasoning: [angular-port-analysis.md](./angular-port-analysis.md).

Per that analysis, this initiative is gated on a demand signal (issues asking for it, a design partner, or an internal consumer) and ranked behind finishing the Vue family ([vue-support-tracker.md](./vue-support-tracker.md)). The tracker exists so the plan is ready when the gate opens, and so the two spike PRs (PR-A02, PR-A03) can run early and cheaply if someone wants to de-risk the estimate before committing.

This document is the single source of truth for the multi-PR effort to bring the framework to Angular, including full Journeys and Compositions support. Update the status board and per-PR checkboxes as PRs land; record decision outcomes in the Decisions section.

## Goal

Ship an Angular + Angular Router package family with feature parity to `@react-router-modules/*`, minus one documented exception (error isolation, see AD6):

- Module contract: `defineModule`, dependency declaration and validation, slots/zones, navigation manifest.
- Runtime: registry, route building via `router.resetConfig`, auth via functional guards, `injectZones`/`injectRouteData` over route `data`.
- Journeys: the full engine (transitions, branching, persistence, rewind) with an Angular outlet.
- Compositions: multi-module screens with scoped stores and an Angular outlet.
- Catalog harvesting of Angular descriptors.
- Testing helpers, a CLI scaffolder, a runnable example app, and getting-started plus shell-patterns docs.

## Non-goals (for this initiative)

- Angular majors below the AD2 floor (v20 as of this writing). Nothing older than the lowest in-support major.
- NgModule-based ergonomics. Standalone components, `inject()`, and signals only.
- Real `ng` schematics / `ng add` for 1.0. The CLI ships `cli-core` templates first (AD8); schematics are a stretch phase.
- SSR work beyond what Angular's built-in SSR gives for free. No hydration-specific features for 1.0.
- Replicating React/Vue error-boundary semantics. Angular has no per-subtree error primitive; the initiative ships best-effort capture plus documentation, not parity (AD6).

## Target package map

| New package                       | Mirrors                                      | Contents                                                                                                                                                                     |
| --------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@modular-angular/angular`        | `@modular-react/react`, `@modular-vue/vue`   | Injection tokens and providers (modules, navigation, slots), `storeSignal`/`reactiveServiceSignal` bridges, `inject*` accessors, scoped store, entry resolution, module-exit |
| `@modular-angular/components`     | (no analog; forced by AD3)                   | The few real components: error-capture host, module-route host, shared outlet plumbing. The only ng-packagr-built package in the binding layer                               |
| `@modular-angular/journeys`       | React parts of `@modular-react/journeys`     | Journey provider, instance injectors, outlet, module-tab, wait-for-exit                                                                                                      |
| `@modular-angular/compositions`   | React parts of `@modular-react/compositions` | Composition provider, injectors, outlet                                                                                                                                      |
| `@modular-angular/testing`        | `@modular-react/testing`                     | `resolveModule`, `createMockStore`, `preloadEntries`, TestBed render harness glue                                                                                            |
| `@angular-router-modules/core`    | `@react-router-modules/core`                 | `defineModule` (with `createRoutes(): Route[]`), `defineSlots`, shared injector context, scoped store, typed route-data channel, types                                       |
| `@angular-router-modules/runtime` | `@react-router-modules/runtime`              | Registry, route-builder over `resetConfig`, `provideModularApp(...)` providers, functional auth guards, zones, active-zones, route-data                                      |
| `@angular-router-modules/testing` | `@react-router-modules/testing`              | `renderModule`, `renderJourney`, mock store                                                                                                                                  |
| `@angular-router-modules/cli`     | `@react-router-modules/cli`                  | `cli-core` preset + standalone-component templates                                                                                                                           |

The engines are already extracted and shared (`@modular-frontend/core`, `journeys-engine`, `compositions-engine`, `testing`); no further extraction is needed. Whether `@modular-angular/components` stays a separate package or folds into `@modular-angular/angular` as an ng-packagr-built secondary entry point is part of AD3; the split shape above is the recommendation because it keeps the main binding on the repo's rolldown pipeline.

Angular Router is the only router, so there is one family where React needed two, the same advantage the Vue plan has.

## Decisions

Record the outcome inline when made. Blockers are marked per PR. IDs are prefixed `AD` to avoid collision with the Vue tracker's `D` series.

| ID  | Decision                                                                        | Recommendation                                                                                                                                                                                                                                                                                                       | Status |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AD1 | npm scopes (`@modular-angular`, `@angular-router-modules`) and repo positioning | Keep this repo, add the scopes, reserve them before any code PR. Community precedent for "angular" in scope names exists (`@angular-architects`, `@angular-eslint`); avoid anything that reads as official (`@angular/*` is Google's).                                                                               | open   |
| AD2 | Minimum supported Angular version and CI matrix                                 | Floor = lowest in-support major at first code PR (v20 today: signal inputs v19, `effect`/`toSignal` v20, zoneless v20.2, `setInput` v14.1 are all inside it). CI matrix across all in-support majors; drop majors as they leave LTS.                                                                                 | open   |
| AD3 | Which packages carry `@Component` code and get the ng-packagr/APF build         | Quarantine components (`@modular-angular/components`, the two outlets, testing harness hosts) into ng-packagr builds; everything else (tokens, bridges, registry, route builder) stays plain TS on rolldown. Validated by PR-A02.                                                                                    | open   |
| AD4 | Component authoring style inside library packages                               | Standalone components, inline templates only (no external `.html`/styles), signal inputs, `OnPush`, no host bindings that need zone.js. SFC-analog of the Vue D4 decision.                                                                                                                                           | open   |
| AD5 | Entry-component typing contract (the `UiComponent` narrowing)                   | Narrow to `Type<unknown>` at the binding boundary; entry components declare signal inputs matching `ModuleEntryProps` fields, checked by a `moduleEntry<TInput>(cmp)` authoring helper. Document the contract in `ui-types.ts` (PR-A01).                                                                             | open   |
| AD6 | Error-isolation stance                                                          | Ship best-effort capture (instantiation + first render + lazy-load failures) and `provideModularErrorHandler` tagging; document plainly that steady-state CD errors escape to the global handler. Adopt subtree error handling if Angular ships it (angular#18509 is open, "under consideration"). Scoped by PR-A03. | open   |
| AD7 | Store story for Angular templates: core store vs NgRx SignalStore               | Scaffold with the core `createStore` (already the framework contract) exposed through `storeSignal`; document NgRx SignalStore interop in a guide section. No NgRx dependency in runtime packages.                                                                                                                   | open   |
| AD8 | CLI: `cli-core` templates vs real ng schematics                                 | Templates for 1.0 (cheap, reuses PR-04 plumbing); `ng add` + schematics as stretch (PR-A52) once there are users to justify the schematics toolchain.                                                                                                                                                                | open   |
| AD9 | zone.js posture                                                                 | Signal-first design, no `NgZone` calls anywhere in library code; works identically in zoneful and zoneless apps (zoneless is the Angular default since v21). Test suites run zoneless.                                                                                                                               | open   |

## Prerequisites from the Vue tracker

Two Phase 0 items in [vue-support-tracker.md](./vue-support-tracker.md) are shared foundation and are prerequisites here, not duplicated:

- **PR-04 (cli-core framework-pluggable templates)**: blocks PR-A50.
- **PR-05 (CI/publish plumbing, scope reservation)**: extended by AD1 to cover the Angular scopes; blocks first publish.

## Phase plan

Sizes: S (under ~300 LOC changed), M (~300-1000), L (over 1000). Every PR includes its own tests, passes `pnpm lint` / `typecheck` / `test`, and updates this tracker. Every PR that adds an Angular analog of an existing file names both the React source file and, where one exists, the Vue analog in its description, so reviewers can diff intent against two reference implementations.

### Phase A0: seam documentation and de-risking spikes

These are cheap, useful regardless of whether the initiative proceeds, and PR-A02/PR-A03 are the two risks the feasibility analysis says to prototype before trusting the estimate.

**PR-A01 (S): Document the `UiComponent` narrowing contract for class-component frameworks.**
Extend the doc comments in `frontend-core/src/ui-types.ts`: state that the construct arm admits zero-argument-constructor classes with the props type unchecked (verified against the repo's strict tsconfig), and that a class-component binding narrows to its framework's component type (`Type<unknown>` for Angular) plus an input-shape contract enforced by an authoring helper. No behavior change.
Acceptance: doc-only; the existing `entry-exit.test-d.ts` assertions still pass; a new `.test-d.ts` case pins the zero-arg-class admission so a future seam change cannot silently break it.

**PR-A02 (M, spike): Two-pipeline packaging proof.**
A throwaway-quality but CI-wired proof: one plain-TS package built with the repo's rolldown pipeline (a `storeSignal` sketch importing only `@angular/core` types) and one minimal ng-packagr package with a single inline-template component, both consumed by a scratch AOT application build across the AD2 version matrix. Answers: does the plain-TS package need ngtsc at all (expected: no); does APF partial-Ivy output coexist with the workspace's turbo/pnpm layout; what does the CI matrix cost.
Acceptance: scratch app builds AOT against both packages on every matrix major; findings recorded here; AD3 resolved.

**PR-A03 (M, spike): Outlet error-capture proof.**
Prototype the capture strategy against deliberately broken components: throw in constructor, throw in first render, throw in a later CD cycle, lazy import rejection. Measure exactly what try/catch around `createComponent` + initial `detectChanges()` catches, what escapes to `ErrorHandler`, and whether the app is left in a broken-CD state in the escape cases.
Acceptance: a written matrix of failure mode vs capture outcome recorded in this tracker under AD6; AD6 resolved with the documented guarantee wording that PR-A41 will publish.

### Phase A1: binding layer

**PR-A10 (M): `@modular-angular/angular` part 1: store bridge and DI.**
New `packages/angular`, plain TS, standard rolldown skeleton (per AD3 nothing here carries `@Component`). Depends on `@modular-frontend/core` plus `@angular/core` as a peer. Contents, each the analog of the same-named React/Vue file:

- `store-signal.ts` (analog of `vue/src/store-ref.ts`): `storeSignal` / `reactiveServiceSignal` seed a `signal()` from `getState`/`getSnapshot`, push snapshots from `subscribe`, tear down via `DestroyRef.onDestroy`. Selector variants wrap in `computed()`. Must run in an injection context or take an explicit `Injector` option; use `assertInInjectionContext` for the NG0203-style early error.
- `context.ts` (analog of `createSharedHooks`/`createSharedComposables`): `createSharedInjectors` giving `injectStore`, `injectService`, `injectReactiveService`, `injectOptional`. Reactive accessors return `Signal`s; plain `injectService` returns the value.
- `scoped-store.ts`, `modules-context.ts`, `navigation-context.ts`, `slots-context.ts`: typed `InjectionToken`s + `provide*` helper provider factories + `inject*` accessors. Contexts set once at resolve time return plain values; only genuinely reactive sources return signals, matching the PR-10 Vue rule.

Error-message prefixes: `[@modular-angular/angular]`.
Acceptance: port the PR-10 Vue test inventory case-for-case (context, context-reactivity, modules/navigation/slots contexts, scoped store) on TestBed with zoneless providers, plus a `.test-d.ts` for the typed-label/typed-meta navigation assertions and the injection-context error case. Subscribe/unsubscribe-on-destroy and selector-equality tests mirror the Vue reactivity additions.

**PR-A11 (M): `@modular-angular/angular` part 2 + `@modular-angular/components`: rendering pieces.**
Analogs of `resolve-entry.ts`, `error-boundary`, `module-exit.ts`, `module-route`:

- `resolve-entry.ts` stays in the plain-TS package: `resolveEntryComponent` / `preloadEntry` memoized by entry identity via `WeakMap`, dynamic import normalized (`.default`, sync-throw trapped as cached rejection), identical dedupe guarantees to the Vue PR-11 version. No `@defer` anywhere: it is compile-time syntax and cannot host runtime-registered modules.
- `@modular-angular/components` (ng-packagr, per AD3): the error-capture host implementing the AD6 strategy around `ViewContainerRef.createComponent` + `setInput`, and the `ModuleRoute` host (single-entry auto-resolve, unknown/multi/no-entry notices, legacy `component` fallback, matching the React source and Vue PR-11 semantics).
- `module-exit.ts`: `provideModuleExit`, `injectModuleExit`, `injectModuleExitDispatcher`; dispatcher provided by identity, matching the Vue port.

Acceptance: port the PR-11 Vue test inventory (resolve-entry incl. type tests, error host against the PR-A03 failure matrix, module-exit, module-route) case-for-case, with the documented-escape cases asserted as escaping (not silently skipped). Both packages build; the scratch-app AOT check from PR-A02 is promoted into these packages' CI.

**PR-A12 (S): `@modular-angular/testing`.**
Mirror `@modular-vue/testing` (PR-12): re-export `createMockStore` / `resolveModule` from `@modular-frontend/testing`; binding-specific `preload-entries.ts` walking `entryPoints` and warming `preloadEntry`'s cache with `Promise.all` rejection containment.
Acceptance: port the PR-12 test inventory; typecheck and build pass for the package trio.

### Phase A2: angular-router family

**PR-A20 (M): `@angular-router-modules/core`.**
Mirror `react-router-core/src`: `types.ts` (a `ModuleDescriptor` whose `createRoutes()` returns Angular `Route[]`), `define-module.ts`, `define-slots.ts`, `is-store-api.ts`, `scoped-store.ts`, shared injector context. Includes the typed route-data channel: Angular's `Data` is `{[key: string | symbol]: any}`, so the helper pattern from the React `handle` channel carries over.
Acceptance: `.test-d.ts` descriptor-inference coverage matches the React-router core's.

**PR-A21 (M): `@angular-router-modules/runtime` part 1: registry.**
Port `registry.ts`: `createRegistry`, module registration, dependency wiring and validation, journey registration hooks (interface only; wired in PR-A32). Reuses core validation directly.
Acceptance: port of `registry.test.tsx` and `registry-journeys.test.ts` registry-level cases.

**PR-A22 (M): `@angular-router-modules/runtime` part 2: route building and app providers.**
`route-builder.ts` rebuilding the full config and applying it via `router.resetConfig()` (the sanctioned runtime-registration API; wildcard `**` routes forced last on every rebuild); `provideModularApp(...)` returning `ApplicationConfig`-composable providers that install the injection contexts, register initial modules, and (for pre-v22 majors) set `withRouterConfig({paramsInheritanceStrategy: 'always'})`, which v22 makes the default; auth via functional `CanActivateFn` guards driven by module metadata. Lazy entries via `loadComponent`.
Acceptance: an integration test boots a router harness with two modules, navigates between them, registers a third module after bootstrap via `resetConfig`, and asserts no in-flight-navigation breakage (see Risks).

**PR-A23 (M): `@angular-router-modules/runtime` part 3: zones and route data.**
`zones.ts`, `active-zones.ts`, `route-data.ts` over the activated-route chain (`ActivatedRoute.pathFromRoot` / router events), funneling through core's `mergeRouteStaticData` (deepest-wins) and `createRouteDataOverrideWarner`. With `paramsInheritanceStrategy: 'always'` the router's own child-wins inheritance approximates the merge; the explicit funnel keeps warning behavior identical across families.
Acceptance: deepest-wins merge behavior matches the React suites, including the override warning cases.

**PR-A24 (S): `@angular-router-modules/testing`.**
`renderModule` over TestBed (or `@testing-library/angular`, decide in-PR by which keeps the harness closer to the React/Vue `renderModule` shape), `mock-store.ts`, `resolveModule` re-export. (`renderJourney` lands with PR-A32.)
Acceptance: parity with `react-router-testing/src` minus the journey helper.

### Phase A3: Journeys and Compositions on Angular

**PR-A30 (M): `@modular-angular/journeys` part 1: provider and injectors.**
Journey provider (per-journey `createEnvironmentInjector` carrying the instance providers), `injectJourneyState`, instance injectors over the engine's store surface (analogs of `provider.tsx`, `instance-hooks.ts`, `use-journey-state.ts`), plugin contribution type. Note the plugin seam: `ModularPlugin.providers` returns wrapper components in React/Vue; the Angular shape is provider arrays contributed to the environment injector, and this PR defines that shape.
Acceptance: port of `provider.test.tsx`, `use-journey-state.test.tsx` intent, zoneless TestBed.

**PR-A31 (L): `@modular-angular/journeys` part 2: outlet.**
The largest single rewrite (React source `outlet.tsx`, ~555 LOC, plus `module-tab`, `use-wait-for-exit`, mount-kind rendering), as an ng-packagr component driving `ViewContainerRef.createComponent` with per-instance injectors, `setInput` prop delivery, and the AD6 error capture. `mount-adapter` glue stays binding-side, supplying the Angular outlet to the neutral `RuntimeMountAdapter` seam exactly as the React and Vue bindings do.
Acceptance: the full journey lifecycle (enter, branch, go-back, go-forward, rewind-to, complete, abort, persistence resume) in component tests against the real engine, matching the React outlet suites case-for-case; plus explicit store-update-ordering tests during transitions (signal-timing analog of the Vue reactivity-drift risk).

**PR-A32 (M): Journeys wired into `@angular-router-modules/runtime` + `renderJourney`.**
Registry journey registration end-to-end, route integration for journey mounts, `renderJourney` testing helper. Port `registry-journeys` rendering cases and `render-journey.test.tsx`.
Acceptance: the example-app journey scenario (multi-module sequence with a branch) passes as an integration test.

**PR-A33 (M): `@modular-angular/compositions` part 1: provider, injectors, store glue.**
Analogs of `provider.tsx`, `hooks.ts`, `use-composition`, `plugin.tsx` over the compositions engine. The `useSyncExternalStore`-tuned referential-stability logic in the engine's `stores.ts` stays as-is (it is pure); the Angular side reads through `storeSignal` and drops nothing.
Acceptance: port `use-composition.test.tsx`, `selector-dispatch.test.tsx` intent.

**PR-A34 (L): `@modular-angular/compositions` part 2: outlet.**
Analog of the 1,070-LOC React `outlet.tsx`, same machinery as PR-A31 (per-zone injectors, `setInput`, error capture). Port `outlet.test.tsx`, `outlet.behaviors.test.tsx`, `outlet.advanced-behaviors.test.tsx`, `mount-kinds-runtime.test.tsx`, and the runtime lifecycle rendering suites.
Acceptance: zone mount/unmount lifecycle, disposal, and validation behaviors match the React suites.

### Phase A4: example, docs, parity audit

**PR-A40 (L): `examples/angular` example app.**
Mirror `examples/react-router`: app-shared, shell, two or three modules, one journey, one composition, standalone components and the patterns the docs will teach, zoneless bootstrap. Registered in workspace globs and CI.
Acceptance: `pnpm dev` runs it; a smoke test boots it headlessly.

**PR-A41 (M, docs only): Documentation.**
`getting-started-angular.md`, `shell-patterns-angular.md` (route shape, zones via route `data`, `injectRouteData`, functional-guard auth, `provideModularApp` bootstrap), the injection-context authoring rules for every `inject*` API, and the error-isolation caveat section using the exact guarantee wording resolved in AD6/PR-A03. Angular sections in `docs/navigation.md`; README package map and tagline updates per AD1.
Acceptance: a developer can go from scaffold or manual setup to a running two-module app following only the docs, and the error-isolation difference from React/Vue is discoverable, not buried.

**PR-A42 (S): Parity audit.**
Compare exported API surface and test-case inventory against both the React-router and vue-router families; file follow-ups for gaps; extend the "new core features state their framework impact" checklist to Angular. The error-isolation gap is recorded as the one accepted, documented exception rather than a parity failure.
Acceptance: a parity table appended to this document with no unexplained gaps; Angular packages promoted from 0.x to 1.0 after this PR.

### Phase A5: tooling and stretch

**PR-A50 (M): `@angular-router-modules/cli`.**
Preset over the PR-04 `cli-core` interface with standalone-component template bodies: shell, module, journey, store (core store per AD7), app-shared, workspace. Snapshot test of the generated tree; generated app passes its own `lint`/`typecheck`/`test`.

**PR-A51 (S): Catalog Angular support.**
Teach `detect.ts`/`resolve.ts` the Angular package names. Descriptor detection is duck-typed and unaffected; verify the harvester's Vite SSR pass evaluates descriptor files that import `@Component`-decorated classes (it never renders them, so no compiler is needed) and add a fixture proving it.
Acceptance: catalog build over `examples/angular` produces a correct model including the journey cross-reference graph.

**PR-A52 (stretch, M): `ng add` schematic.** Blocked by AD8 and demand.
An `ng add @angular-router-modules/cli`-style schematic wrapping the PR-A50 templates for CLI-native workspaces. Deliberately unscoped until the template CLI has users.

## Dependency graph

```
AD1 ──► PR-05 (Vue tracker) ──► first publish
PR-A01 ──► PR-A10
PR-A02 ──► AD3 ──► PR-A11
PR-A03 ──► AD6 ──► PR-A11
PR-A10 ──► PR-A11 ──► PR-A12
PR-A10/A11 ──► PR-A20 ──► PR-A21 ──► PR-A22 ──► PR-A23 ──► PR-A24
PR-A22 + PR-A31 ──► PR-A32
PR-A10 + engines ──► PR-A30 ──► PR-A31
PR-A10 + engines ──► PR-A33 ──► PR-A34
PR-A23 + PR-A32 + PR-A34 ──► PR-A40 ──► PR-A41, PR-A42
PR-04 (Vue tracker) ──► PR-A50
PR-A42 ──► 1.0 release
```

Parallelizable tracks once Phase A0 lands: (a) PR-A10..A12 binding layer, (b) PR-A30/A31 journeys UI and PR-A33/A34 compositions UI depend only on the engines plus PR-A10, (c) PR-A20..A24 router family depends on the binding layer. Two people can run tracks b and c concurrently. PR-A02 and PR-A03 can run today, before the demand gate, as standalone de-risking.

## Versioning and release

- All Angular packages start at `0.1.0` and stay 0.x until PR-A42.
- `@angular/*` packages are peerDependencies with a range spanning the AD2 support matrix; the range's floor rises as majors leave LTS (a normal minor release, announced in the changelog). Component packages compile against the floor major, per APF partial-compilation portability.
- Expect one matrix update every 6 months (Angular's major cadence). This is a standing maintenance line item, not a one-off.
- 1.0 for `@modular-angular/*` and `@angular-router-modules/*` ships together, after the parity audit, example, and docs.

## Risks

- **Error isolation is a real gap, not a porting difficulty.** Instantiation and first-render failures are catchable; later change-detection errors escape to the global `ErrorHandler` and can leave the app in a degraded state. Mitigation: PR-A03 pins the exact behavior before any outlet code exists; AD6 wording ships in the docs; the outlet is the single adoption point if Angular ships subtree error handling (angular#18509).
- **Second build toolchain.** ng-packagr/APF packages live beside the rolldown pipeline permanently. Mitigation: AD3 quarantines the component surface to as few packages as possible; PR-A02 proves the setup before the estimate is trusted.
- **Injection-context authoring rules.** Every `inject*` API only works in constructors/field initializers or with an explicit `Injector`; users coming from hooks/composables will hit NG0203-style errors. Mitigation: `assertInInjectionContext` for clear failures, an `{injector}` escape hatch on every accessor, and PR-A41 documents the rules as a first-class section.
- **`resetConfig` semantics.** Whole-config replacement can interact with in-flight navigations and route-order sensitivity (wildcards). Mitigation: the route builder owns config assembly end-to-end, forces `**` last, and PR-A22's acceptance includes a register-during-navigation test.
- **Version treadmill.** A new Angular major every 6 months, ~18 months of support each; the CI matrix and peer ranges need touching twice a year. Mitigation: encode the matrix in one CI variable; treat floor-raises as routine minors.
- **Test porting dominates the schedule.** ~1138 existing test cases and the UI-facing ones need rewriting on TestBed, which is heavier than the React/Vue harnesses. Mitigation: port test intent per PR (inventories listed above), zoneless-by-default suites, and let PR-A42 catch omissions.
- **"You can do that with DI" adoption headwind.** Angular architects already hand-roll registries with DI multi-providers. The registry and slots must be visibly better than the recipe, and the docs should compare against it directly rather than ignore it. This is a product risk more than an engineering one.
- **Maintenance drift after 1.0.** Every core change then has four integration surfaces (two React routers, Vue, Angular). Mitigation: engines stay extracted so feature work lands framework-neutral by construction; the PR-A42 checklist extension.
- **Windows CI quirk.** `@tanstack-react-modules/cli` tests already hit EPERM on `.test-output` cleanup on Windows; PR-A50 will likely inherit the pattern. Reuse the existing CLIs' mitigation.

## Status board

Update the Status column as PRs move: `todo` → `in progress` → `in review` → `done` (link the PR). The whole board is gated on the demand signal except PR-A01..A03, which may run early.

| PR     | Title                                         | Size | Depends on             | Status |
| ------ | --------------------------------------------- | ---- | ---------------------- | ------ |
| PR-A01 | Document UiComponent narrowing contract       | S    | none                   | todo   |
| PR-A02 | Two-pipeline packaging spike                  | M    | none                   | todo   |
| PR-A03 | Outlet error-capture spike                    | M    | none                   | todo   |
| PR-A10 | @modular-angular/angular: store bridge and DI | M    | PR-A01                 | todo   |
| PR-A11 | binding rendering pieces + components package | M    | PR-A10, PR-A02, PR-A03 | todo   |
| PR-A12 | @modular-angular/testing                      | S    | PR-A11                 | todo   |
| PR-A20 | @angular-router-modules/core                  | M    | PR-A10                 | todo   |
| PR-A21 | runtime: registry                             | M    | PR-A20                 | todo   |
| PR-A22 | runtime: route building, providers, guards    | M    | PR-A21                 | todo   |
| PR-A23 | runtime: zones and route data                 | M    | PR-A22                 | todo   |
| PR-A24 | @angular-router-modules/testing               | S    | PR-A23                 | todo   |
| PR-A30 | angular journeys: provider and injectors      | M    | PR-A10                 | todo   |
| PR-A31 | angular journeys: outlet                      | L    | PR-A30                 | todo   |
| PR-A32 | journeys wired into runtime + renderJourney   | M    | PR-A22, PR-A31         | todo   |
| PR-A33 | angular compositions: provider and injectors  | M    | PR-A10                 | todo   |
| PR-A34 | angular compositions: outlet                  | L    | PR-A33                 | todo   |
| PR-A40 | examples/angular                              | L    | PR-A23, PR-A32, PR-A34 | todo   |
| PR-A41 | Documentation                                 | M    | PR-A40                 | todo   |
| PR-A42 | Parity audit, promote to 1.0                  | S    | PR-A40                 | todo   |
| PR-A50 | @angular-router-modules/cli                   | M    | PR-04, PR-A40          | todo   |
| PR-A51 | Catalog Angular support                       | S    | PR-A40                 | todo   |
| PR-A52 | ng add schematic (stretch)                    | M    | AD8, 1.0               | todo   |

## Working agreements

- One PR per row above; if a PR grows past its size class, split it and add a row rather than letting it balloon.
- Every PR that adds an Angular analog of an existing file names the React source file and the Vue analog (where PR-10..12 produced one) in its description.
- Every PR updates this document (status board, decision outcomes, spike findings, and any scope changes) in the same commit.
- No Angular package publishes above 0.x before PR-A42 is done.
- Library code contains no `NgZone` references and no `@defer`; suites run zoneless (AD9, AD4).
