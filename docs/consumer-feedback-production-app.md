# Top 10 improvements, based on a real-world production consumer

This document distills friction points observed in a production application
built on the library family (Vite + React 19 + TanStack Router, framework mode
via `resolveManifest()`).

The app uses `@tanstack-react-modules/{core,runtime}` for the module system and
`@modular-react/{core,journeys}` for entry/exit and journey primitives. It
registers seven modules and two multi-step journeys, and tests journeys
headlessly with `simulateJourney`.

The methodology was simple: find every wrapper, workaround, type cast, sentinel
value, and copy-pasted comment the app wrote _around_ the library — each one is
a feature request in disguise. Items are ordered by estimated impact.

---

## 1. Ship a router-sync adapter for journeys (URL ↔ step)

> **Shipped** — `createJourneySync` in `@modular-frontend/journeys-engine`, with
> `useJourneySync` on both bindings. See the changelog's "journey hosting and URL
> sync" entry and
> [Deep-linking steps](../packages/journeys/README.md#deep-linking-steps--usejourneysync).
>
> Built router-neutral rather than as per-router packages: the reconciler is a
> state machine over `{ status, step, history, future }` and a path string, so it
> lives in the engine behind a 5-method `JourneySyncPort` the app fills in for its
> router in ~6 lines. React and Vue share one implementation and one test suite.
> Per-router adapter packages remain possible on top, but nothing needs them yet.
>
> One part of the suggestion was **not** built, deliberately: `pathToStep`. A
> journey's step is derived from its state and carries no identity, so a URL
> cannot select an arbitrary step — only frames the journey has already visited
> (`rewindTo`) or just rewound from (`goForward`). Everything else is reported via
> `onUnresolved` for the host to decide. Per-step `path` metadata is left to item 4.

**Evidence.** The single largest piece of glue in the app is a ~300-line hook
(plus its test file): a bespoke bidirectional reconciler between the journey
runtime and TanStack Router history. It re-implements push/replace/goBack/
goForward decision logic and needs ref-based bookkeeping to disambiguate
"journey state advanced" from "browser back" — both present as "URL behind
runtime" between renders.

**Suggestion.** Provide official router bindings —
`@react-router-modules/journeys-sync` and `@tanstack-react-modules/journeys-sync`
(or options on `journeysPlugin`) — that:

- map each journey step to a URL segment (via per-step `path` metadata or a
  `stepToPath` / `pathToStep` pair supplied at `registerJourney` time),
- reconcile browser back/forward with `runtime` history,
- expose the current step index for progress UIs.

Every journey consumer that wants deep-linkable, back-button-friendly flows has
to solve this; it is subtle enough (history races, replace-vs-push, forward
stack) that solving it once in the library is worth a lot.

## 2. Provide a first-class `JourneyHost` / journey-route primitive

> **Shipped** — `<JourneyHost>` + `useJourneyHost` on both bindings (both forms,
> as the suggestion allowed). See
> [Hosting a journey](../packages/journeys/README.md#hosting-a-journey--journeyhost).
> Combined with item 1, a journey is now mountable in one line.
>
> `{ instanceId, stepIndex }` ship; **`stepCount` does not**. The total is not
> knowable from a running instance — the next step is computed by a transition
> handler from live state — and accepting a hand-passed total would re-introduce
> the duplicated flow encoding item 4 is about. It lands with
> `resolveStepSequence`.
>
> Note for whoever picks up the app: the host's start is latched on a ref inside
> an effect, not `useState(() => runtime.start(...))`. The `useState` form
> double-invokes its initializer under StrictMode and leaks an instance per mount
> — worth checking the app's own host for the same bug.

**Evidence.** The app wraps `<JourneyOutlet>` in its own host component to add
what every host needs: start-on-mount, a step counter, and instance cleanup on
navigate-away (a manual `router.subscribe('onBeforeNavigate', …)` calling
`runtime.end` + `runtime.forget`). On top of that, the two per-journey wrappers
around that host are near-identical copies of each other
(`useState(() => runtime.start(...))` plus the same prop wiring) — the
copy-paste pattern shows the abstraction wants to live in the library.

**Suggestion.** Add a `<JourneyHost handle={...} input={...}>` component (or
`useJourneyHost(handle, input, options)`) that owns the instance lifecycle:
starts (or resumes) on mount, ends/forgets on unmount or navigate-away, and
exposes `{ instanceId, stepIndex, stepCount }`. Combined with item 1, a journey
becomes mountable in one line.

## 3. Fix `defineModule` so real apps can use it (literal inference + function-form `nav.to`)

**Evidence.** The app does not use `defineModule` at all. Four of its modules
carry a near-verbatim copy of a justification comment explaining that a plain
object literal with `as const` is used instead, because (a) `defineModule`
widens the literal shape of `entryPoints` / `exitPoints`, breaking journey
transition maps that reference `typeof someModule`, and (b) `defineModule`'s
default generics constrain `navigation[].to` to `string`, clashing with
function-form `to`.

When the flagship definition helper is abandoned with a copy-pasted apology in
every module, the helper is the bug.

**Suggestion.** Make `defineModule` preserve literal entry/exit shapes (`const`
type parameters, as `defineComposition` already does for zones) and default the
nav-item generic to something that admits function-form `to` (the
`NavigationItem` type already supports it — only `defineModule`'s defaults
don't). Acceptance test: `typeof myModule` defined via `defineModule` must work
as a `TModules` member in a journey `TransitionMap` with zero casts.

## 4. Derive step ordering and progress from the transition graph

**Evidence.** Each journey's flow is encoded twice: once as the real
transition-map graph, and again in a ~170-line hand-maintained file of ordered
step arrays for URL segments and "Step X of N" — in _three_ branch-variant
copies. Nothing but discipline keeps the two encodings in sync.

**Suggestion.** The engine already statically resolves transition destinations
(the catalog harvester extracts them). Expose that at runtime/authoring time:

- `resolveStepSequence(definition, { branch })` — derive an ordered step list
  for linear (or branch-selected) flows,
- per-step declarative metadata on `StepSpec` / `defineTransition` (e.g.
  `path`, `progressLabel`) that `JourneyOutlet`/`JourneyHost` and the item-1
  router adapter can consume,
- a runtime `useJourneyProgress()` hook returning `{ index, total }`.

Even supporting only linear-with-branches flows would delete all three arrays.

## 5. Release and publicize the "`input` optional when `buildInput` exists" widening

**Evidence.** The app invented a documented sentinel constant defined as
`undefined as never`, stamped ~20 times across both journeys' `start()` and
transition maps, because `StepSpec.input` was required even for entries whose
`buildInput` re-derives input from state on every mount — a required field
whose value is discarded.

HEAD already fixes this at the type level (`StepInputSlot` makes `input`
optional when the entry declares `buildInput`), but published versions consumed
by the app predate it.

**Suggestion.** Ship the widening in a release, call it out prominently in the
changelog, and consider a codemod (or at least a documented recipe) so
consumers can delete their sentinels. A debug-mode warning when a stamped
`input` will be ignored (drift detection) already exists — mention it in the
same doc so teams trust the deletion.

## 6. Give journeys state-update helpers (or reducer support)

**Evidence.** The larger journey's state module is ~240 lines, most of it
hand-written Redux-style pure updaters (`applyThisStep`, `applyThatStep`, …)
that transitions call to produce the next state. The second journey repeats the
pattern. The library defines the state type parameter but offers zero help
managing it.

**Suggestion.** Options, roughly in order of ambition:

1. Document the reducer-per-concern pattern as the blessed approach (cheap,
   codifies what consumers already converge on).
2. Accept an `updaters` / `actions` map in `defineJourney` so transitions can
   return `{ next, update: { stepCompleted: payload } }` instead of spreading
   state by hand.
3. Integrate an optional immer-style `produce` in transition handlers
   (`({ state, draft }) => …`).

Even option 1 plus a `defineJourneyState()()` helper that ties updater
signatures to `TState` would cut the boilerplate meaningfully.

## 7. Make `JourneyOutlet` error and loading behavior production-shaped

**Evidence.** Three separate app files exist to fight the outlet's defaults:

- The app's journey host hard-codes `onStepError={() => 'ignore'}`, with a
  comment noting that the default (`abort`) ends the instance, which makes
  `JourneyOutlet` return `null` — so the error UI disappears.
- A dedicated error-fallback component exists because, in the app's words,
  without it a step throw aborts the journey and leaves an empty page.
- A loading-fallback factory exists because the outlet-level `loadingFallback`
  is not step-aware and the app needs per-step skeletons; it also has to cast
  `moduleId` at the lookup boundary because the framework types
  `moduleId`/`entry` as plain `string` there.

**Suggestion.**

- Change (or at least loudly document) the default step-error policy: an
  aborted journey should render the `error` component, not `null`. "Blank page
  on throw" is never the desired production behavior.
- Pass the pending step (`{ moduleId, entry, input }`) to `loadingFallback` so
  hosts can render per-step skeletons without a wrapper factory — and type
  `moduleId`/`entry` as the literal unions derived from `TModules` where the
  definition is in scope.

## 8. Smooth the testing story (module wiring, branded IDs, eager loading)

**Evidence.**

- A comment in a 670-line, otherwise happy `simulateJourney` test suite notes
  that `modules:` is required for `buildInput` to fire and to silence the
  "no descriptor for module X" warning — without it, the runtime silently
  skips per-entry input rebuilding and warns on every transition. A silent
  skip makes a test pass while validating the wrong inputs.
- A hook test casts a string literal `as InstanceId` — the branded type has no
  test constructor.
- One module documents that its entries are lazy partly so that the registry
  (pulled in by every test via the shared test-utils providers) doesn't
  eagerly import step components and break `vi.mock(...)`. Production module
  shape is being bent to accommodate test-time loading.

**Suggestion.**

- `simulateJourney`: throw (or require an explicit `modules: 'none'` opt-out)
  when a stepped-into entry declares `buildInput` but no descriptor was
  provided — silent no-op is the worst of the options. Better: let
  `registerJourney`/definition metadata carry the module map so tests don't
  re-wire what the registry already knows.
- Export a `testInstanceId(seed?)` factory from the testing packages for
  branded `InstanceId` (and any other branded types).
- Document (or provide) a test-mode registry/manifest that defers entry
  resolution so `vi.mock` keeps working with eager entries.

## 9. Stabilize navigation semantics and tighten nav-item typing

**Evidence.** The app's nav-item type makes `order` **required**, with a
warning that omitting it cedes sidebar position to library defaults that
differ across `@modular-react/core` versions (alphabetical by label in v1;
trailing all explicit orders in v2). Elsewhere, the app shell casts
`item.icon as FC<{ className?: string }>` when adapting library nav items to
its design-system sidebar.

**Suggestion.**

- Treat nav ordering semantics as public API: document the current rule in the
  navigation guide, add regression tests, and never change it again outside a
  major with a changelog callout. (The damage is done for this consumer — they
  now hard-code `order` everywhere defensively — but the next consumer can be
  spared.)
- Let `NavigationItem` carry a typed icon/component slot (a generic parameter
  or `UiComponent`-typed field) so shells don't cast.

## 10. Derive the journey `TModules` map from the registry (one source of truth)

**Evidence.** Each journey keeps a hand-written type file mapping module ids to
descriptor types (`{ someModule: typeof someModule, … }`) that must be manually
kept in sync with both the `registry.register(...)` calls and the transition
map. The registry also contains two near-empty placeholder modules
(`{ id, version, navigation: [] }`) that exist, per their own comments, only to
participate in the registry's `resolveManifest` cycle.

**Suggestion.**

- Make `register()` accumulate a typed module map, builder-style:
  `const r = createRegistry(...).register(aModule).register(bModule)` with `r`
  carrying `{ a: typeof aModule; b: … }`, and expose `type ModulesOf<typeof r>`
  for `defineJourney<ModulesOf<typeof r>, State>()`. Journeys would then be
  typed against what is actually registered, and drift becomes a compile error
  instead of a convention.
- Allow a module id to be referenced (nav target, journey compat) without a
  full descriptor, so consumers stop registering empty stub modules.

---

## Honorable mentions

Real but lower-impact observations from the same codebase:

- **Two npm scopes read as two libraries.** Modules/registry come from
  `@tanstack-react-modules/*` while entries/journeys come from
  `@modular-react/*`; the app's own README has to explain that these are one
  family. A note in each package README ("part of the modular-react family,
  see …") — or a long-term scope consolidation — would reduce onboarding
  confusion. Relatedly, the app declares `@modular-react/react` but never
  imports it; the facade layering makes it unclear which package a consumer
  actually needs.
- **`useZones` / `useRouteData` return a fresh object each render** containing
  _all_ handle keys — a documented footgun for `useEffect` deps. Memoizing per
  route match and filtering to declared keys would remove the caveat.
- **`buildInput` blocks repeat the same "rehydrate previous values from state"
  shape** in every module definition; a small helper (e.g.
  `rehydrateFrom(state, ['stepOneResult', 'stepTwoResult'])`) would compress
  the pattern.
- **Authoring-time type gymnastics** — `defineEntry`'s nine overloads and the
  `defineJourney()()` / `defineComposition()()` double-curry — are visible to
  consumers as unfamiliar shapes needing JSDoc paragraphs to justify. Worth
  revisiting as TypeScript's inference options improve (partial type-argument
  inference would eliminate the double-curry).

## Cross-cutting takeaway

Nine of the ten items concentrate in the **journeys** layer, and most reduce to
one theme: the engine is solid, but the _integration shell_ around it — URLs,
hosting lifecycle, progress, loading/error UI, state updates — is left to each
consumer, and this consumer needed roughly **1,000 lines of glue** (host +
URL sync + fallbacks + step paths + reducers) to productionize two journeys.
That glue is generic, subtle, and testable — exactly the kind of code a library
should own.
