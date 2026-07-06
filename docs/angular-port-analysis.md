# Porting modular-react to Angular: feasibility and value analysis

Date: 2026-07-06. Based on the codebase at `807b489` (~63k source LOC including tests, 118 test files, ~1138 test cases). Companion to `vue-port-analysis.md`, written before the Vue port started; this analysis assumes the layering that work produced.

## Verdict

An Angular port is feasible, and it starts from a stronger position than the Vue port did: the framework-neutral engines (`@modular-frontend/core`, `journeys-engine`, `compositions-engine`, `testing`) already exist as separate packages and carry over untouched, and the `Store<T>` seam maps onto Angular signals more cleanly than it maps onto either React or Vue. It is still harder than the Vue port, roughly 1.3-1.5x, because the difficulty concentrates in three places that Vue did not have:

1. Angular has no component-level error boundary. This is the only true behavioral parity gap: React's class boundary and Vue's `onErrorCaptured` isolate a failing module entry; Angular can only approximate it.
2. The `UiComponent`/`UiNode` seam assumes components called with a props object and values that are renderable nodes. Angular components are AOT-compiled classes with input fields, and Angular has no node type. This is real API redesign, not translation.
3. Publishing Angular components requires ng-packagr and the Angular Package Format, an odd-one-out against the repo's vite/rolldown pipeline, plus a support treadmill of one Angular major every 6 months.

The value question cuts the other way from Vue: the ecosystem gap is narrower (Angular DI, Nx boundaries, and Native Federation already serve some of the pitch), but the audience fit is the best of any framework. Angular's enterprise users (banks, insurance, internal tools) are exactly who journeys and compositions were built for, and the workflow-engine category is completely empty in Angular. The recommendation at the end is demand-driven, sequenced behind finishing the Vue family.

## How the code splits today

The extraction work recommended in the Vue analysis is done. The neutral engines are standalone packages, and the two type-only React imports that used to blemish core are now the explicit `UiComponent`/`UiNode` seam in `frontend-core/src/ui-types.ts`. Non-test source LOC per layer:

| Package                                        | LOC (non-test) | Angular port implication                                          |
| ---------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| `@modular-frontend/core`                       | ~4,250         | Reuse as-is                                                       |
| `@modular-frontend/journeys-engine`            | ~5,600         | Reuse as-is                                                       |
| `@modular-frontend/compositions-engine`        | ~1,900         | Reuse as-is                                                       |
| `@modular-frontend/testing`                    | ~100           | Reuse as-is                                                       |
| `@modular-react/react`                         | ~1,000         | Rewrite as `@modular-angular/angular`                             |
| `@modular-react/journeys` (binding)            | ~1,700         | Rewrite outlet/provider/hooks over the untouched engine           |
| `@modular-react/compositions` (binding)        | ~1,750         | Same                                                              |
| `@modular-vue/vue` (Phase 1 done)              | ~1,200         | The translation template: mirrors the React binding file-for-file |
| `@modular-react/catalog`                       | ~2,350         | Reuse; descriptor detection is duck-typed and framework-free      |
| `@modular-react/cli-core`                      | ~2,150         | Reuse the command engine; swap template bodies (PR-04 pending)    |
| Router family (core+runtime+testing+cli), each | ~2,900         | Write one `@angular-router-modules/*` family                      |

All state flows through `Store<T>` (`frontend-core/src/store.ts`: `getState`/`setState`/`subscribe`, zustand-compatible) and `ReactiveService<T>` (`subscribe` + `getSnapshot`). Nothing below the binding layer knows which UI framework exists. The Vue binding (`packages/vue/src/`) is the proof and the blueprint: DI-key contexts, a `store-ref.ts` reactive bridge, an error-capture wrapper, an async entry resolver. An Angular binding is the same file list with a different reactivity and DI substrate.

## What the Angular port would consist of

Package map mirroring the Vue tracker: `@modular-angular/{core,angular,journeys,compositions,testing}` plus one `@angular-router-modules/{core,runtime,testing,cli}` family. Angular Router is the single dominant router, so one family covers the ecosystem, the same advantage Vue had over React's two families.

### Store bridge: the strong point

`storeSignal(store, selector?)` seeds `signal(store.getState())`, pushes new snapshots from `store.subscribe`, and tears down via `inject(DestroyRef).onDestroy(unsubscribe)`. Selector variants wrap in `computed()`, whose default equality gives the same free deduplication that `shallowRef`'s `Object.is` setter gives the Vue bridge (`packages/vue/src/store-ref.ts`); the referential-stability code tuned for `useSyncExternalStore` can be dropped, as in Vue. `reactiveServiceSignal` is the same bridge over `getSnapshot`.

Two Angular-specific properties are worth stating. First, the bridge is zoneless-ready by construction: signal writes mark consuming views dirty without NgZone, so OnPush and zoneless apps (the default since v21) need no `markForCheck` plumbing. The framework's external-store model and Angular's signals direction align well. Second, the constraint: these helpers must run in an injection context (constructor or field initializer) or take an explicit `Injector`, mirroring `toSignal`'s contract. Every React `useX` hook becomes an `injectX` function with documented call-site rules; this is a stricter authoring contract than hooks or composables, and the docs must carry it. Subscriptions created at the environment level (not in a component) must hang teardown off the environment injector's `DestroyRef` or they leak across route changes.

### DI: also a strong point

React context and Vue `InjectionKey` map 1:1 onto `InjectionToken<T>` + `inject()`. Per-module-instance scoping (nested providers in React, scoped `provide` in Vue) maps onto hierarchical injectors: the journey and composition outlets create components programmatically anyway, so each module instance gets a `createEnvironmentInjector(providers, parent)` passed to `createComponent`. This is arguably cleaner than React's provider nesting. The one sharp edge: forgetting to pass the injector to `createComponent` silently resolves from root, so the binding must own that plumbing and test it.

One seam does not translate: `ModularPlugin.providers` returns wrapper components (`UiComponent<{children: UiNode}>[]`), a React/Vue idiom. The Angular analog is provider arrays contributed to the environment injector, so the plugin surface needs an Angular-specific shape rather than a translation.

### The component seam: the big one

`UiComponent<P>` is `((props: P) => any) | (new (props: P) => any)`. The construct arm technically admits a modern Angular component: a class using `inject()` fields has an implicit zero-argument constructor, and a zero-argument construct signature is assignable to `new (props: P) => any` (verified against this repo's `strict` tsconfig). But the admission is accidental. `P` is never checked against anything, because Angular inputs are class fields, not constructor arguments, and a component with constructor-injected concrete dependencies fails the assignability check under `strictFunctionTypes`. The Angular binding must therefore narrow the seam to `Type<unknown>` and move prop-shape checking elsewhere: an authoring contract where entry components declare signal inputs (`input.required<TInput>()`) matching an interface, checked by a `moduleEntry<TInput>(cmp)` helper at descriptor authoring time.

Prop delivery is mechanical: the outlet applies `ModuleEntryProps` fields via `componentRef.setInput()` (v14.1+, handles OnPush dirtying and signal inputs uniformly), or `NgComponentOutlet`'s `inputs` binding (v16.2+) where a template host suffices. Descriptor authoring ends up idiomatic for Angular users, since route configs already reference component classes; `defineModule({ component: SettingsComponent })` reads natively. The redesign cost lives in the binding's generics, not the user-facing surface.

`UiNode` is the harder half. Angular has no VNode, and a `TemplateRef` cannot be created outside a template. The three `UiNode` surfaces in core all degrade from "any renderable" to "component class or string":

- `LazyModuleEntryPoint.fallback` (`frontend-core/src/types.ts`): `fallback: <Spinner/>` becomes `fallback: SpinnerComponent`.
- `RuntimeMountAdapter.Outlet.loadingFallback` (`runtime-mount.ts`): same substitution.
- `ModularPlugin.providers` children (`plugin.ts`): replaced by the provider-array plugin shape above.

A real ergonomic downgrade, but a contained one. The wider `UiComponent` surfaces (descriptor `component`, `zones`/`ZoneMap`, entry components, `NavigationItem.icon`, composition `fallback`) all take component classes, which is what Angular authors expect to write anyway; icon-style props (`UiComponent<{className?: string}>`) deliver via `setInput`.

### Rendering layer

The outlets rewrite as components driving `ViewContainerRef.createComponent` directly (rather than `NgComponentOutlet`), because the outlet needs `setInput` control, the per-instance environment injector, and an error-capture point in one place. Lazy entries map directly: `LazyEntryComponent`'s `() => Promise<{default} | Component>` becomes an awaited dynamic import followed by `createComponent`, and the idempotent preload cache in `resolve-entry.ts` ports nearly verbatim. `@defer` does not apply here: it is compile-time template syntax and cannot host runtime-registered modules.

### Error boundary: the honest weak spot

Angular has no per-subtree error boundary. `ErrorHandler` is application-global; providing one in a child injector does not scope capture (that is exactly what open issue [angular#43504](https://github.com/angular/angular/issues/43504) asks for). The canonical request, [angular#18509](https://github.com/angular/angular/issues/18509) (open since 2017), sits at "under consideration" in the backlog, and the [current roadmap](https://angular.dev/roadmap) has no error-handling item. `@defer`'s `@error` block covers deferred-load failures only.

Best-effort strategy for the binding: try/catch around `createComponent` plus the initial `detectChanges` (this catches instantiation and first-render failures, the dominant real case for module entries), catch lazy-import rejections, and ship a `provideModularErrorHandler` that tags errors escaping to the global handler with module/journey context. Steady-state change-detection errors after first render escape to the global handler and can leave the app in a broken-CD state. This must be documented plainly: module-failure isolation in Angular is weaker than in the React and Vue bindings, and the journeys/compositions guarantees need an Angular-specific caveat. If Angular ships subtree error handling later, the outlet is the single place to adopt it.

### Router family

Angular Router friction sits between vue-router (best) and TanStack (worst), closer to vue-router:

- Native wins: routes are plain data; `loadComponent` covers lazy loading; functional guards (`CanActivateFn`) are more idiomatic than either React equivalent; route `data` is native. As of v22, `paramsInheritanceStrategy: 'always'` is the default, so `data` inherits down the matched chain with child-wins semantics, which is core's `mergeRouteStaticData` deepest-wins merge nearly for free.
- `Data` is untyped (`{[key: string | symbol]: any}`), like React Router's `handle`, so the typed route-metadata channel still earns its keep.
- Runtime registration is `router.resetConfig()`: whole-config replacement rather than vue-router's incremental `addRoute`, but it is the sanctioned API and the established pattern in [dynamic module federation setups](https://www.angulararchitects.io/en/blog/dynamic-module-federation-with-angular/). The registry must rebuild the config and keep wildcard `**` routes last, a mild echo of React Router's pathless-layout care and nothing like TanStack's frozen-tree workarounds.

### Packaging: the second structural friction

Anything containing `@Component` must be compiled by ngtsc in partial-Ivy mode and published in [Angular Package Format](https://angular.dev/tools/libraries/angular-package-format) via ng-packagr; there is no supported vite/rolldown path for component libraries (ng-packagr is adopting Rolldown internally, which may narrow the gap eventually, but does not remove the requirement). Shipping undecorated code with runtime JIT compilation is a non-starter for AOT apps.

The mitigation is a package split. Most of the binding is plain TypeScript: the store bridge, injection tokens, registry glue, route builders, entry resolution, and all engine re-exports carry no Angular declarations and need no ngtsc, so they stay on the existing rolldown pipeline. (No official Angular statement blesses ngtsc-free plain-TS libraries, but nothing in APF applies to code without declarations, exactly as any plain npm dependency is consumed by AOT apps today.) The few real components (the outlets, the error wrapper, a route host) are quarantined in small ng-packagr-built packages with minimal inline templates. APF also imposes the release discipline: `@angular/*` as peerDependencies per supported major, compile against the lowest supported major, CI matrix across majors.

### CLI, testing, catalog

- CLI: `cli-core`'s preset mechanism (`preset.ts`: package coordinates plus template fragments per router family) extends naturally with an Angular preset once PR-04 (framework-pluggable cli-core) lands. The open question is templates emitting standalone components (cheap) versus real ng schematics (expensive, better adoption); start with templates.
- Testing: `@modular-angular/testing` re-exports `@modular-frontend/testing` (`createMockStore`, `resolveModule` carry over) plus TestBed or `@testing-library/angular` render harnesses for `renderModule`/`renderJourney`. TestBed setup is heavier than the React/Vue harnesses.
- Catalog: descriptor detection is duck-typed on plain object fields (`catalog/src/harvester/detect.ts`) and needs no changes; the harvester loads descriptor modules via Vite SSR, and Angular component classes imported by a descriptor evaluate fine without the Angular compiler as long as the harvester never renders them (it does not). Work needed is limited to recognizing the Angular package names and the portal-SPA dogfooding question, same as Vue.

## Angular-specific friction

- The hooks-to-`inject*` re-idiomatization is more redesign than the near-mechanical hooks-to-composables mapping Vue got, because of the injection-context constraint and the class-component seam.
- Version cadence: one major every 6 months, ~18 months of support each ([release schedule](https://angular.dev/reference/releases)). Everything the binding needs is stable by v20 (signal inputs v19, `effect`/`toSignal` v20, zoneless CD v20.2; `setInput` v14.1, `NgComponentOutlet` inputs v16.2). Target the lowest in-support major at ship time; as of mid-2026 that is v20 (LTS until 2026-11), with v21/v22 in the CI matrix. Do not chase anything older; v19 and below are out of support.
- No SSR-framework question: Angular SSR is in-framework, so there is no analog of the Nuxt problem that was the hardest and least certain part of the Vue plan. This is genuinely less friction than Vue.

## Effort estimate

New code: ~10-13k source LOC plus tests. Binding layer ~2-2.5k (the Vue binding is ~1.2k, but the seam narrowing, injection-context plumbing, and error scaffolding add design work, not just lines); router family ~2.5-3k; journeys and compositions outlets ~3-3.5k including the error-capture machinery; CLI preset, testing harnesses, catalog recognition ~1.5-2k; plus the ng-packagr pipeline as new build infrastructure and a full docs rewrite in Angular idiom. Call it 1.3-1.5x the Vue estimate, with the excess concentrated in design decisions (seam, error handling, packaging) rather than translation volume.

The steady-state cost is also higher than Vue's. A third binding family means every core change is validated against four integration surfaces (React x2 routers, Vue, Angular), and Angular adds the only one with a semiannual major-version treadmill and a separate build toolchain.

## Is there comparable value?

### The gap is narrower than it was in Vue

Angular natively serves more of the pitch than React or Vue did. Hierarchical DI with multi-providers gives typed extension points and is the closest built-in analog to slots; plugin-architecture articles use it as exactly that. Nx workspace libraries with [enforce-module-boundaries](https://nx.dev/docs/features/enforce-module-boundaries) (and [Sheriff](https://www.angulararchitects.io/blog/modern-architectures-with-angular-part-1-strategic-design-with-sheriff-and-standalone-components/) for lighter setups) are the dominant enterprise pattern for build-time modularity with typed imports. [Native Federation](https://github.com/angular-architects/module-federation-plugin/blob/main/libs/native-federation/README.md) is mature and [officially endorsed](https://blog.angular.dev/micro-frontends-with-angular-and-native-federation-7623cfc5f413) for the independent-deployment case. An Angular team already gets typed contracts (DI), enforced boundaries (Nx), and runtime composition at the route level (`loadChildren`/`resetConfig`) from their platform.

### What survives fully

- Journeys: the typed, serializable multi-module workflow engine has no Angular equivalent at all. The category contains only UI steppers ([CDK Stepper](https://material.angular.dev/cdk/stepper/overview), formly multi-step forms, wizard libs); nothing composes steps from separate modules over a shared typed context.
- Slot/zone aggregation as a product: DI multi-providers can collect contributions, but every team [rebuilds the registry-and-slots pattern from scratch](https://angular.love/building-an-extensible-dynamic-pluggable-enterprise-application-with-angular); no maintained typed library packages it. The closest artifact ([angular-extension-registry](https://github.com/openshift/angular-extension-registry)) is AngularJS-era and abandoned.
- The runtime module registry with typed cross-module contracts, dependency validation, and the delete-a-directory property. Federation tools solve independent deploys with weak cross-boundary typing; Nx stops at static structure. The in-process, one-build, fully-typed point on the spectrum is unoccupied in Angular too.
- The catalog and the documented patterns.

### Counterweights

- The registry and lifecycle pieces will face "you can do that with DI" pushback from Angular architects, and must be visibly better than the hand-rolled DI recipe to win adoption. This headwind did not exist in Vue.
- The audience-fit counterpoint: Angular's user base skews to exactly the multi-team enterprise apps (admin panels, dashboards, regulated-industry internal tools) where journeys and compositions carry their full value. The demographic fit is the best of the three frameworks.
- No known user demand, same as Vue at analysis time, and the Vue family is mid-flight; an Angular effort would compete with finishing it.

## Recommendation

1. Nothing needs pre-extraction this time; the neutral core already exists. The one cheap preparatory item: document in `ui-types.ts` how a class-component framework narrows `UiComponent` (to `Type<unknown>` plus an input-shape contract), so the seam's contract is explicit rather than accidental.
2. If a port happens, sequence by value density as the Vue plan does: journeys engine + minimal `@modular-angular/angular` binding + router runtime first (the unreplicated value), compositions and CLI second, catalog and schematics later. Prototype the ng-packagr split and the outlet error-capture early, since those are the two risks that could change the estimate.
3. Do not start on spec, and rank it behind finishing the Vue family. The technical risk is modest and the engines are ready, but the marginal ecosystem value is lower than Vue's (narrower gap) while the steady-state cost is higher (release treadmill, separate build toolchain, weaker error-isolation story). It pays off against demonstrated Angular demand: issues asking for it, a design partner, or an internal consumer.

Sources: [Angular releases and support](https://angular.dev/reference/releases), [effect API (stable v20)](https://angular.dev/api/core/effect), [provideZonelessChangeDetection](https://angular.dev/api/core/provideZonelessChangeDetection), [Angular v21 announcement (zoneless default)](https://blog.angular.dev/announcing-angular-v21-57946c34f14b), [NgComponentOutlet](https://angular.dev/api/common/NgComponentOutlet), [ComponentRef.setInput](https://angular.dev/api/core/ComponentRef), [error handling best practices](https://angular.dev/best-practices/error-handling), [issue #18509: declarative error handling](https://github.com/angular/angular/issues/18509), [issue #43504: scoped ErrorHandler](https://github.com/angular/angular/issues/43504), [Angular roadmap](https://angular.dev/roadmap), [Angular Package Format](https://angular.dev/tools/libraries/angular-package-format), [creating libraries](https://angular.dev/tools/libraries/creating-libraries), [Router API (resetConfig)](https://angular.dev/api/router/Router), [Route Data type](https://angular.dev/api/router/Data), [RouterConfigOptions (paramsInheritanceStrategy)](https://angular.dev/api/router/RouterConfigOptions), [Dynamic Module Federation with Angular](https://www.angulararchitects.io/en/blog/dynamic-module-federation-with-angular/), [Native Federation](https://github.com/angular-architects/module-federation-plugin/blob/main/libs/native-federation/README.md), [Angular blog: Native Federation](https://blog.angular.dev/micro-frontends-with-angular-and-native-federation-7623cfc5f413), [Nx enforce-module-boundaries](https://nx.dev/docs/features/enforce-module-boundaries), [Sheriff and standalone components](https://www.angulararchitects.io/blog/modern-architectures-with-angular-part-1-strategic-design-with-sheriff-and-standalone-components/), [single-spa-angular](https://github.com/single-spa/single-spa-angular), [pluggable enterprise app pattern](https://angular.love/building-an-extensible-dynamic-pluggable-enterprise-application-with-angular), [DI plugin architecture](https://www.thisdot.co/blog/plugin-architecture-for-angular-libraries-using-dependency-injection), [angular-extension-registry (abandoned)](https://github.com/openshift/angular-extension-registry), [CDK Stepper](https://material.angular.dev/cdk/stepper/overview), [Enterprise Angular book](https://leanpub.com/enterprise-angular).
