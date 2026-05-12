# Changelog

This repo releases via the `release-same-version` label (see `.github/workflows/publish.yml`): every package in the workspace ships the same version bump per release, even packages without code changes. This file exists so consumers can tell a content release from an alignment bump.

Per-package detail lives in the GitHub release tagged `<npm-name>@<version>`.

## Unreleased

### Added — journey runtime additions (EXP-1848 adoption follow-up)

- **`@modular-react/core`** — `ModuleEntryPoint.buildInput?: (state) => TInput`. When declared on an entry, the journey runtime calls it on every entry into the step (initial start, forward push, `goBack` pop, and re-entry after a child journey returns) and uses the result as the step's `input`, ignoring whatever a transition handler placed on `next.input`. Lets a back-navigated form re-render against the journey state accumulated by earlier exits instead of the input frozen at first push. Opt-in — entries without `buildInput` keep the current cache-on-push behaviour. Authors annotate the `state` parameter with the hosting journey's `TState` (the module surface stays journey-agnostic).
- **`@modular-react/core`** — `JourneyRuntime.goBack(id: InstanceId): void` on the public surface. Equivalent to the `goBack` prop the runtime hands the active step's component, but addressable by instance id so a shell that owns its own back button (browser `popstate`, hardware back, breadcrumb) can wire `popstate → runtime.goBack(id)` directly instead of capturing the active step's callback through a React context. No-op under the same conditions as the closure form (unknown id, terminal / loading, child in flight, no `allowBack`, empty history).
- **`@modular-react/journeys`** — `useJourneyState<T>(id)` and `useActiveLeafJourneyState<T>(rootId)`. React hooks that subscribe to a runtime instance via `useSyncExternalStore` and return its `state` (or `null` for unknown ids / no provider). `useActiveLeafJourneyState` walks `activeChildId` from the root to the deepest descendant and re-subscribes as the chain grows / shrinks, so a host rendering inside an invoked child reads the child's state without a hand-rolled chain walker.
- **`@modular-react/core`** — new public type `JourneyStepFor<TModules>`. Discriminated union of every concrete `JourneyStep` reachable in a journey's module map; narrowing on `moduleId` + `entry` surfaces the entry's typed `input` without a cast. `JourneyStep` itself becomes `JourneyStep<TInput = unknown>` (backwards-compatible — existing usages default to the wide form). The `simulateJourney` `JourneySimulator<TModules, TState>`'s `step` / `currentStep` / `history` now use the typed union, so tests can assert on per-entry input shapes without `Record<string, unknown>` casts.
- **`@modular-react/journeys`** — `simulateJourney` gains a fourth generic, `TOutput = unknown`. Journeys with a concrete terminal payload type are now assignable to the simulator's parameter without the `as unknown as Parameters<typeof simulateJourney>[0]` cast required by the previous `unknown`-output signature. `SimulateJourneyOptions.modules` lets headless tests bind module descriptors so `buildInput` re-runs at every step entry (without descriptors, the runtime falls back to the cached handler-supplied input — identical to pre-`buildInput` behaviour).

### Behavior changes

- **`@modular-react/core`** — `buildNavigationManifest` (and therefore `useNavigation`) now breaks ties on `order` by preserving insertion order instead of label string comparison. Items declared first render first when `order` is unset or equal: modules in registration order, items in the order declared in each module's `navigation` array, plugin-contributed items last. Labels are no longer a tiebreaker — the previous fallback sorted by i18n-key name (e.g. `appShell.nav.assets` < `appShell.nav.projects`), which produced surprising orderings unrelated to translated text. Apps that relied (intentionally or not) on alphabetical-by-key fallback should set explicit `order` values to lock in the desired sequence.

### Peer-dep ranges

- **`@modular-react/react`** and **`@modular-react/journeys`** — peer ranges for `@modular-react/core` (and, for journeys, `@modular-react/react`) bumped from `^1.2.0` to `^2.0.0` to match the packages' actual release lines. Drift went unnoticed when `@modular-react/react@2.0.0` and `@modular-react/journeys@1.0.0` shipped: both packages already require a 2.x core at runtime (lazy entry-point support, `EagerModuleEntryPoint | LazyModuleEntryPoint` discriminated union, `resolveEntryComponent` with sync-thenable fast path), but the peer descriptors still pointed at 1.x. Consumers installing `journeys@1.0.0` against `core@^2.0.0` get an `ERESOLVE` error from npm, and `--legacy-peer-deps` workarounds end up dual-installing core (one hoisted 2.x copy plus a nested 1.x copy under journeys), which fragments singletons (`registry`, `defineEntry` identity) at runtime. This is a peer-descriptor correction, not a behavior change.
- **`@tanstack-react-modules/core`**, **`@tanstack-react-modules/runtime`**, **`@tanstack-react-modules/testing`**, **`@react-router-modules/core`**, **`@react-router-modules/runtime`**, **`@react-router-modules/testing`** — same peer-range correction: `@modular-react/core` and `@modular-react/react` bumped from `^1.2.0` to `^2.0.0`; testing packages' peer of `@modular-react/journeys` bumped from `^1.0.0` to `^1.0.1` to match the corrected upstream. Same drift cause and same consumer impact as the previous entry — without this fix, runtime packages nest a 1.x core under a 2.x host, which breaks React Context identity for `useZones` / `useNavigation` / `useRouteData` (the runtime hooks consume contexts created by `@modular-react/react` in the host's `<Manifest.Providers>` tree). Peer-descriptor correction only.

## 2026-04-19 — `@modular-react/*@1.2.0`, `@*-modules/*@2.3.0`

Released alongside PR adjustments to PR #14 (Lokalise PoC gaps follow-up).

### Changed (substantive)

- **`@modular-react/core`** — new exports: `mergeRouteStaticData` (router-agnostic merge helper used by `useZones` / `useRouteData`) and `AnyModuleDescriptor<TNavItem>` (alias for `ModuleDescriptor<any, any, any, TNavItem>` — internal-plumbing shorthand). Internal: `buildNavigationManifest`, `collectDynamicSlotFactories`, and `warnIgnoredLazyFields` now accept the alias rather than positional `any` filler.
- **`@react-router-modules/core`** — re-exports its own router-narrowed `AnyModuleDescriptor` (preserves the React Router `createRoutes` signature).
- **`@tanstack-react-modules/core`** — same as above for TanStack Router.
- **`@react-router-modules/runtime`** — `useZones` and `useRouteData` now delegate merge logic to `mergeRouteStaticData` in core. No behavior change; deduplicates merge logic across the two runtimes.
- **`@tanstack-react-modules/runtime`** — same as above.

### Peer-dep ranges

Runtime and router-core packages tightened their `@modular-react/core` peer range to `^1.2.0` because they consume the new export. All other workspace-to-workspace peer/dev ranges updated to the new minor line for coherence.

### Alignment bumps (no code change)

These packages are published at the new minor version to keep the workspace coherent, but carry no source changes:

- `@modular-react/react@1.2.0`
- `@modular-react/testing@1.2.0`
- `@react-router-modules/cli@2.3.0`
- `@react-router-modules/testing@2.3.0`
- `@tanstack-react-modules/cli@2.3.0`
- `@tanstack-react-modules/testing@2.3.0`
