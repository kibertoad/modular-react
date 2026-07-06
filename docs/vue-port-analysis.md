# Porting modular-react to Vue.js: feasibility and value analysis

Date: 2026-07-05. Based on the codebase at `de89cda` (~54k source LOC, 103 test files, ~1054 test cases).

## Verdict

A Vue port is moderately difficult, not hard. The codebase is already factored so that roughly two thirds of the logic has no React dependency, and Vue's ecosystem makes the integration layer smaller than either of the existing React router families. The new code needed is roughly 8-10k LOC plus tests, against ~14k LOC of reusable framework-agnostic logic.

The value question is more nuanced. There is a real gap in the Vue ecosystem for typed in-process module composition, but Vue Router ships built-in some of what modular-react has to add on top of React routers, so the marginal value per feature is smaller. The parts that carry their full value across are Journeys, Compositions, and the Catalog. The recommendation at the end is to treat this as demand-driven, and to do the cheap prerequisite (extracting a framework-neutral core) regardless.

## How the code splits today

The repo layers into a router-agnostic foundation and two parallel router families. The React coupling per package:

| Package                                                    | Source LOC (non-test) | React coupling                   | Port implication                                             |
| ---------------------------------------------------------- | --------------------- | -------------------------------- | ------------------------------------------------------------ |
| `@modular-react/core`                                      | ~6,700                | None (two type-only imports)     | Reuse as-is                                                  |
| `@modular-react/react`                                     | ~2,100                | Total; this is the binding layer | Rewrite as `@modular-vue/vue`                                |
| `@modular-react/journeys`                                  | ~7,100                | ~20% (outlet, hooks, provider)   | Reuse the 3,000-line state machine; rewrite ~1,400 LOC of UI |
| `@modular-react/compositions`                              | ~3,600                | ~45% (outlet.tsx, hooks)         | Reuse runtime/stores/validation; rewrite ~1,600 LOC          |
| `@modular-react/catalog`                                   | ~2,400                | None (zero `.tsx` files)         | Reuse; adjust descriptor detection and the SPA bundle        |
| `@modular-react/cli-core`                                  | ~2,200                | Templates only                   | Reuse the command engine; swap template bodies               |
| `@modular-react/testing`                                   | ~400                  | Thin                             | Light port                                                   |
| Router family (core + runtime + testing + cli), per router | ~3,100 each           | Heavy                            | Write one `@modular-vue/*` family                            |

The single most important portability fact is `core/src/store.ts`: the `Store<T>` interface matches zustand's `StoreApi<T>` (`getState`/`setState`/`subscribe`) and ships a dependency-free implementation. All state in journeys, compositions, and the registries flows through this interface. React consumes it via `useSyncExternalStore`; nothing below the hook layer knows React exists.

The only blemish in core is two type-only imports of `ComponentType`/`ReactNode` (in `plugin.ts` and `runtime-mount.ts`) used to mean "a renderable thing". Making core generic over a renderable type, or moving those aliases behind a type parameter, is a small refactor that would let a Vue family depend on the exact same core package instead of a fork. This is worth doing even if the port never happens, since it makes the layering honest.

## What the Vue port would consist of

One binding package and one router family, mirroring the existing structure:

1. `@modular-vue/core` re-exports (or the shared core made neutral, see above).
2. `@modular-vue/vue` (~2k LOC): the binding layer. The translation is mechanical:
   - React context providers → `provide`/`inject` with typed `InjectionKey<T>`.
   - `useSyncExternalStore` store hooks → a `shallowRef` updated from `store.subscribe`, exposed as composables. This is simpler than the React side; there is no tearing problem to design around and no selector-stability dance (`compositions/src/stores.ts` has code tuned specifically for `useSyncExternalStore` referential stability that a Vue port can drop).
   - `React.lazy` + `Suspense` → `defineAsyncComponent`, which handles loading and error states natively without needing Suspense at all.
   - The class-based error boundary → a small wrapper component using `onErrorCaptured`.
   - Zone/slot rendering → `<component :is>` over the contribution lists.
3. `@modular-vue/{router-core,router-runtime,testing,router-cli}` (~2.5-3k LOC): the router bridge. This is where Vue is actively easier than either existing family:
   - Vue Router is the single dominant router. One integration family covers the ecosystem where React needed two; the whole reason the repo maintains parallel `react-router-*` and `tanstack-router-*` trees disappears.
   - `router.addRoute()` registers routes at runtime as a first-class API. The TanStack runtime carries real complexity because its route tree freezes at `createRouter` time (the `IGNORED_TANSTACK_LAZY_FIELDS` warn-list, the `basePath/$` catch-all workaround for lazy modules); React Router needs a pathless-layout trick for auth. Vue Router needs neither.
   - Route metadata is native. `handle` (React Router) and `staticData` (TanStack) map onto Vue Router's built-in `meta`, typed via `RouteMeta` interface augmentation, and `useRoute().matched` gives the matched-record chain, so core's `mergeRouteStaticData` deepest-wins merge and the `useZones`/`useRouteData` channels port directly.
   - Auth guards map onto `router.beforeEach`/per-route `beforeEnter`, which is more idiomatic than either React equivalent.
4. Journeys and Compositions Vue outlets (~3k LOC combined): rewrite `outlet.tsx`, the instance hooks, and providers over the untouched engines (`journeys/src/runtime.ts`, `compositions/src/runtime.ts`).
5. Catalog: the harvester (Vite SSR loading + oxc-parser AST extraction) is framework-agnostic. Work needed: teach descriptor detection about the Vue package names and decide whether the portal SPA stays React-built (it ships as static HTML, so it could) or gets rebuilt in Vue for dogfooding.
6. CLI: reuse `cli-core`'s command engine and `transform.ts`; write Vue SFC template bodies and a `vue-router` preset. The store template drops zustand for either the vanilla core store or Pinia.
7. Testing packages: `@testing-library/vue` / `@vue/test-utils` equivalents of `render-module` / `render-journey`; the pure helpers (`resolveModule`, `createMockStore`, `simulate-journey`) carry over.

### Vue-specific friction

- Nuxt is where most serious Vue apps live. The analog of the two "framework-mode" guides is a Nuxt module, and Nuxt's own conventions (file-based routing, auto-imports, its module system) overlap awkwardly with a runtime module registry. A plain vue-router SPA integration is straightforward; a good Nuxt story is the genuinely hard part and also the part that determines adoption.
- Module descriptors in this framework are plain objects referencing components, so the JSX-vs-SFC difference barely matters at the API surface. It does matter in the CLI templates and in docs, which are all-new writing rather than translation.
- Typing ergonomics: the heavy generic surfaces (`defineModule<AppDependencies, AppSlots>`, `NavigationItem<TLabel, TContext, TMeta>`, journey entry/exit contracts) are plain TypeScript and work identically. Volar handles typed `meta` and generic components well now; this is not the obstacle it would have been in the Vue 2 era.
- Serialization contracts, Standard Schema validation, semver handling, and remote manifest merging carry over untouched.

### Effort estimate

New code: ~8-10k source LOC (binding layer ~2k, router family ~3k, journeys/compositions UI ~3k, CLI templates and testing ~1-2k), plus ports of the UI-facing test suites and a full docs rewrite (the docs are a large fraction of this repo's value; every guide references router-specific idioms). Against the existing repo, that is roughly a third of the original build effort, benefiting from the hardest parts (journey state machine, compositions runtime, catalog harvester, validation) being finished and tested. For one person familiar with both codebase and Vue, a working `@modular-vue` router family with ported guides is plausibly 4-8 weeks; the Nuxt integration is extra and less predictable.

The larger cost is not the port but the steady state: a third family means every core change is validated against three integration surfaces, and API parity drift becomes a permanent tax. The existing two-family structure at least shares React; Vue shares only core.

## Is there comparable value?

### The gap is real

Searching the Vue ecosystem for this shape of tool finds three categories, none of which is this:

- Folder-by-feature conventions: blog posts and small helpers like [vue-modular](https://github.com/laander/vue-modular) (Vue 2 era, effectively dormant). Convention only: no typed contracts, no dependency validation, no slot/zone aggregation, no lifecycle. Examples: [a modular approach write-up](https://medium.com/@darwishdev.com/building-scalable-vue-js-applications-a-modular-approach-11287e7a674c), [Vue app architecture](https://dev.to/michaldulik/vue-modular-architecture-1d4e), [large-scale Vue structure](https://medium.com/js-dojo/architect-a-large-scale-vue-js-application-eaf90dc1da05).
- Micro-frontends: qiankun, wujie, micro-app, and [Module Federation with Vue](https://alexop.dev/posts/how-to-build-microfrontends-with-module-federation-and-vue/) ([practical setups](https://dev.to/lmlonghuynh/building-a-micro-frontend-architecture-with-vue-3-vite-and-module-federation-1bb1), [qiankun + Vite](https://www.oreateai.com/blog/minimalist-practice-implementing-microfrontend-architecture-with-react-and-vue-qiankun-vite/3e822b505b9e9d5df1f3e6f2403f4719)). These solve independent deployment, at the cost of runtime sandboxes, duplicated dependencies, and near-zero cross-module type safety. modular-react's pitch (typed, in-process, one build, module = directory) is a different and lighter point on the spectrum, and that point is unoccupied in Vue.
- Nuxt layers and modules: build-time directory merging and framework extensions. No runtime registry, no typed inter-module dependencies, no journeys equivalent, and Nuxt-only.

So the competitive gap in Vue is at least as open as the one modular-react filled in React. Vue also over-indexes on exactly the app category this framework targets (admin panels, enterprise dashboards, multi-team internal tools), particularly in the Asian and European enterprise markets where qiankun's popularity demonstrates demand for module composition.

### But the marginal value per feature is smaller

Part of modular-react's value in React is compensating for what React routers lack: a typed route-metadata channel (`handle` is untyped by default; `staticData` needs augmentation and a helper), runtime route registration (TanStack can't; React Router needs care), and centralized guards. Vue Router ships all three natively (`meta` + `RouteMeta` augmentation, `addRoute`, navigation guards). A Vue team gets a meaningful slice of the pitch from their router alone.

What survives fully on top of that baseline:

- The module contract itself: `defineModule`, dependency declaration and validation, duplicate-ID checks, the "delete a feature = delete a directory" property.
- Slot/zone aggregation across modules (sidebar, command palette, header commands), which no router provides.
- Journeys: the typed, serializable multi-module workflow engine is router- and framework-agnostic value with no Vue equivalent at all.
- Compositions and the Catalog: same, and the catalog's harvest/portal pipeline is nearly framework-neutral already.
- Scaffolding and the documented patterns.

### Counterweights

- Nuxt captures a large share of Vue mindshare; a SPA-only story misses many teams, and the Nuxt integration is the hardest and least certain piece of work.
- The Vue package ecosystem is smaller than React's, so the addressable audience is smaller in absolute terms even if the fit is good.
- No known user demand yet. The React packages have real users and a roadmap; a speculative port competes with that for maintenance attention.

## Recommendation

1. Do now, regardless of the port: remove the two type-only React imports from `@modular-react/core` (genericize the renderable type) so core is provably framework-neutral. Cheap, improves the existing layering, and keeps the option open.
2. If a port happens, sequence by value density: Journeys engine + a minimal `@modular-vue/vue` binding + vue-router runtime first (this is the unreplicated value), CLI and Catalog second, Compositions third, Nuxt integration only once the SPA story has users.
3. Do not start the port on spec. The technical risk is low and the code is ready for it, but the steady-state maintenance of a third integration family is the real cost, and it only pays off against demonstrated Vue demand (issues asking for it, a design partner team, or an internal consumer).

Sources: [vue-modular](https://github.com/laander/vue-modular), [Building Scalable Vue.js Applications: A Modular Approach](https://medium.com/@darwishdev.com/building-scalable-vue-js-applications-a-modular-approach-11287e7a674c), [Vue - App Architecture](https://dev.to/michaldulik/vue-modular-architecture-1d4e), [Architect a large scale Vue.js Application](https://medium.com/js-dojo/architect-a-large-scale-vue-js-application-eaf90dc1da05), [Microfrontends with Module Federation and Vue](https://alexop.dev/posts/how-to-build-microfrontends-with-module-federation-and-vue/), [Micro Frontend Architecture with Vue 3, Vite and Module Federation](https://dev.to/lmlonghuynh/building-a-micro-frontend-architecture-with-vue-3-vite-and-module-federation-1bb1), [Qiankun + Vite micro-frontend practice](https://www.oreateai.com/blog/minimalist-practice-implementing-microfrontend-architecture-with-react-and-vue-qiankun-vite/3e822b505b9e9d5df1f3e6f2403f4719).
