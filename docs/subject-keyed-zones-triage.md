# Triage: the cat-factory slice-4 request for `@modular-vue/zones` (subject-keyed zones)

Downstream request: [kibertoad/cat-factory#1205](https://github.com/kibertoad/cat-factory/pull/1205)
(`docs/initiatives/modular-vue-slice4-upstream-zones.md` on their side). Status here:
**triaged — accepted in substance, redirected in shape.** This document is the upstream
half of the co-evolution artifact: what we agree to build, what we decline, and why.

## Verdict in one paragraph

The need is real and well-evidenced: a named region whose contributions are selected by a
runtime **subject** (their selected board block), gated by per-contribution predicates,
ordered, rendered **all-matching** (not pick-one), and contributable by first-party and
consumer modules alike. Nothing shipped today provides that host. But the proposed
delivery — a new Vue-only package named `@modular-vue/zones`, a new `zones` registration
seam on module descriptors, a new registry plugin, and Nuxt manifest threading — is the
wrong shape for this library on four counts, detailed below. The same semantics fall out
of a much smaller change: the requested aggregation model **is the slot model we already
ship**, and what is genuinely missing is a pure, framework-neutral _subject resolver_ over
slot entries plus a thin host per binding. That is the exact shape slice 2's pairing
helpers took ("read-side projections of an already-resolved slot"), and it should land
engine-first, on React and Vue together, under a name that is not "zones".

## What the request gets right

- **Gap A is real.** Every zones surface we ship is route-driven (`useZones` /
  `useActiveZones` over route `meta`/`handle` in `@react-router-modules/runtime`,
  `@tanstack-react-modules/runtime`, `@modular-vue/runtime`) or module-activation-driven
  (`ModuleDescriptor.zones`, pick-one per key). None of them keys contributions off a
  caller-supplied piece of application state.
- **Gap C is real, and the request's own analysis is correct.** Slice-2 pairing
  (`resolveComponentRegistry` / `pairById`) is a pick-**one**-by-id lookup; the inspector
  is a filtered, ordered, render-**all** concatenation. Different reduction, correctly
  identified as a different primitive.
- **The compositions out-of-scope call is correct — but for a reason worth recording.**
  Composition zones are state-driven, which makes them look adjacent, but they are
  (a) **pick-one per zone** — a zone's `select(ctx)` returns a single resolution — and
  (b) **closed**: the zone set and selectors are declared by the composition definition,
  so a consumer module cannot add a panel without editing the composition. The inspector
  needs an **open, render-all** contribution surface. Compositions genuinely do not fit;
  the request was right not to bend them.
- **The extensibility argument is the load-bearing one.** A local `v-if` map, however
  tidy, cannot be extended by a consumer deployment shipping a custom block type. A
  registry-aggregated contribution surface can. That is the same seam nav items and
  result views already use, and it is why this deserves a library primitive rather than a
  cat-factory shim.
- **Arbitrary `when(subject)` predicates (not a keyed map) are required.** Their
  visibility conditions are conjunctions over level _and_ type _and_ live run state; a
  `level → panels` map cannot express that. The predicate contract is right.

## Where the request goes wrong

### 1. "Zones" is the one name this primitive must not have

The word "zone" already means **two unrelated things** in this library — the
`packages/compositions` README carries an explicit "two distinct primitives both use the
word zone; they are unrelated" apology table for exactly this reason:

| Existing primitive                                                          | Selection                    | Cardinality                             | Contributed by                           |
| --------------------------------------------------------------------------- | ---------------------------- | --------------------------------------- | ---------------------------------------- |
| Route/module zones (`useZones`, `useActiveZones`, `ModuleDescriptor.zones`) | active route / active module | **one** component per key, deepest-wins | route `handle`/`meta`, module descriptor |
| Composition zones (`defineComposition({ zones })`)                          | per-zone `select(state)`     | **one** resolution per zone             | the composition definition (closed)      |

The request adds a third semantic — subject-keyed, predicate-gated, **render-all**,
open contribution — that differs from _both_ existing meanings on every axis. Worse, a
Vue consumer would then hold `useZones` (route-driven, from `@modular-vue/runtime`) and
`useZone` (subject-driven, from `@modular-vue/zones`) in one app: two imports one letter
apart with disjoint semantics. The request itself invites us to "align names with the
existing zones vocabulary" — the honest alignment is to conclude the vocabulary is full
and pick a new word. Recommendation: the **panels** family — `definePanelGroup`,
`usePanels`, `<PanelsOutlet>` — which matches the downstream's own language ("inspector
panels", "detail panels") and stays greppable. ("Subject slots" and "facets" were the
runners-up; final naming is a maintainer call, but "zones" is rejected.)

### 2. The proposed registration seam collides with a shipped field

`defineModule({ zones: { inspector: [...] } })` cannot ship as written:
`ModuleDescriptor.zones` already exists (`readonly zones?: Readonly<Record<string,
UiComponent>>` — one component per key, read by `useActiveZones` in workspace-style
shells). Redefining it as `Record<string, ZoneContribution[]>` is a breaking change to a
published contract, and unioning the two shapes on one field would poison both. The
"additive; no breaking changes" framing of the request is false at precisely its main
seam. This alone forces a different registration path — and we already have the right
one (next point).

### 3. This is a slot, not a new registration concept

Strip the framing and look at the required aggregation semantics: contributions declared
per-module, aggregated by the registry across first-party **and** consumer modules,
array-concatenated per key, registration order preserved, deterministically ordered,
consumed by a host. That is `module.slots` + `buildSlotsManifest`, verbatim — the seam
slice 1 (nav) and slice 2 (result views) already ride, reactive in Vue via
`useReactiveSlots` / the slots signal. The request concedes this ("plain slots can be
bent into this") but frames a slot-based build as a shim. It has it backwards: slot
entries are **opaque by design** (`SlotMap = Record<string, readonly unknown[]>`) —
apps already put typed entry objects in them. Contributing
`{ id, component, when, order }` entries to a slot is not bending slots; it is what
slots are for. What is _actually_ missing is small and pure:

1. a **typed entry shape** — `{ id, component, when?(subject), order?, props? }`;
2. a **pure resolver** — `(entries, subject) → visible, ordered entries` (null subject
   → empty; stable sort on `order`, ties by contribution order; fail-loud on duplicate
   ids, consistent with `resolveComponentRegistry`'s stance);
3. a **thin host per binding** that renders each resolved entry with the subject
   injected, keyed per `(entry.id, subjectKey)`, each wrapped in the binding's module
   error boundary.

This is exactly the shape slice 2 shipped as: pure read-side projections in
`@modular-frontend/core`, "no module type and no new ingress", re-exported by the
bindings. Following the same shape here dissolves most of the request's surface area:

- **§4A's registry plumbing** — not needed; `registerAppModule`-style consumer
  extension falls out of the existing module → slot path for free.
- **§4E (Nuxt / `installModularApp`)** — collapses to ~zero code. The "resolved zone
  manifest" _is_ the slots manifest, which `installModularApp` already provides;
  `<PanelsOutlet>` reads it from the existing slots context. No `manifest.zones`, no
  plugin-extension type threading, no cast to eliminate.
- **§4A's `/testing` subpath** — not needed. The resolver is a pure named export of the
  engine; cat-factory unit-tests its predicate/order table by calling it, no DOM, today.
- **§4B's opt-in route-sync helper** — cut entirely (YAGNI). The host is route-free _by
  construction_ because nothing in the slot+subject path can see a router; there is
  nothing to keep off the "baseline import path". Nobody has asked for the routed case.

### 4. A new Vue-only package inverts the family's architecture

The operating rule of this repo — restated as recently as the journey-sync and
`JourneyHost` work — is _engine-first, both bindings together_: neutral logic in
`@modular-frontend/*`, React and Vue landing the binding surface in the same train, with
the Angular tracker staged for the same parity. `@modular-vue/zones` as the definition
point of a framework-neutral concept inverts that: React (whose consumers have the same
single-route, state-driven detail-panel need — the primitive is not Vue-shaped in any
way) would later have to port _from the Vue binding_, and Angular from that. New
packages in this family are justified by runtimes with instance lifecycles (journeys,
compositions), not by one pure function plus one small component — pairing, the closest
precedent in both size and kind, went into `@modular-frontend/core` + binding
re-exports, not a package. Publishing an essentially-empty `@modular-vue/zones` would
also permanently commit the npm namespace to the name rejected in point 1.

## What we will build instead (proposed)

Engine (`@modular-frontend/core`; components stay opaque `UiComponent`s, per PR-01):

```ts
export interface PanelEntry<TSubject> {
  readonly id: string;
  readonly component: UiComponent;
  readonly when?: (subject: TSubject) => boolean; // absent = always
  readonly order?: number; // ascending; ties keep contribution order
  readonly props?: Record<string, unknown>; // merged with { subject }
}

/** Phantom-typed handle, same convention as defineJourneyHandle /
 *  defineCompositionHandle: carries TSubject + the slot key. */
export function definePanelGroup<TSubject>(slotKey: string): PanelGroupHandle<TSubject>;

/** Pure: filter by when(subject), stable-sort by order; null/undefined
 *  subject → empty; duplicate ids throw (align with resolveComponentRegistry). */
export function resolvePanels<TSubject>(
  entries: readonly PanelEntry<TSubject>[],
  subject: TSubject | null | undefined,
): readonly PanelEntry<TSubject>[];
```

Vue (`@modular-vue/vue`, re-exported from `@modular-vue/core` like the pairing surface):

- `usePanels(group, subject: MaybeRefOrGetter<TSubject | null>)` — `computed` over the
  slots context + the subject; subject-reactive by the same source-boundary rules
  `useReactiveSlots` already documents (see caveat below).
- `<PanelsOutlet :group :subject :subject-key>` — renders every resolved entry with
  `subject` as a prop **and** via `provide` (`usePanelSubject()` for nested content),
  keyed by `entry.id + subjectKey(subject)`, each entry wrapped in
  `ModuleErrorBoundary`; `#empty` slot for the no-match case. (`#wrap` per-entry chrome:
  accepted, it is cheap and genuinely useful for collapsible shells.)

React (`@modular-react/react`, same train): `usePanels` + `<PanelsOutlet>` — the same
~hundred lines with `useMemo`/context instead of `computed`/`provide`. Angular gets
`injectPanels` whenever its gate opens; the engine part is already done for it.

Module authors contribute through the existing field — no descriptor change at all:

```ts
defineModule({
  id: "inspector-frames",
  slots: {
    inspectorPanels: [
      {
        id: "frontend-config",
        component: FrontendConfig,
        order: 20,
        when: (b: BoardBlock) => b.level === "frame" && b.type === "frontend",
      },
    ],
  },
});
```

Dropped from the proposed API, deliberately:

- **`section`** — one group with three sections is isomorphic to three group ids
  (`inspector.body`, `inspector.banners`, `inspector.actions`), which are already typed,
  already bucketed by the slot map, and need no new concept, no `options.section`
  parameter, and no per-section ordering rules. If a real interleaving need appears
  later, `section` can be added compatibly; starting without it is the smaller contract.
- **route-sync helper** — see point 3 above.
- **`/testing` entry, registry plugin, Nuxt manifest threading** — subsumed, see point 3.

One honest caveat to document (not to engineer around): subject-reactivity of
_mutable-state_ predicates (their "run flips to failed" case) requires the subject to be
Vue-reactive state — a Pinia/`reactive` object, which cat-factory's
`ui.selectedBlockId → board.getBlock` computed already is. A predicate reading a
non-reactive snapshot tracks nothing. This is the exact source-boundary
`reactive-slots-vue.md` already teaches; the panels guide will cross-link it rather than
invent a second reactivity story.

## The version-alignment carry-over (their Gap D) — stale, but a real residual exists

The request's picture is out of date in both directions:

- The widen it asks for **already shipped**: `@modular-vue/{vue,core,runtime,nuxt,journeys}`
  peer `@modular-frontend/core@^0.1.0 || ^0.2.0` today.
- Meanwhile `@modular-frontend/core@0.3.0` published on 2026-07-19, so those same ranges
  now exclude the _current_ engine again, and `@modular-vue/compositions` +
  `@modular-vue/testing` were never widened past `^0.1.0`.

Accepted as housekeeping, generalized: widen the whole Vue family (including
compositions and testing this time) to include `^0.3.0` in the next release train, and
have the new panels surface peer against the range that includes the engine version that
ships `resolvePanels`. A follow-up worth considering separately: this drift has now
recurred three times (React family in the changelog's peer-range entries, Vue slice 2,
now 0.3.0) — a `check:publish`-style script asserting every workspace peer range admits
every workspace sibling's current version would end the category.

## Docs plan

- New guide (`docs/subject-panels.md` or similar, name pending the naming decision):
  the entry shape, the resolver, both bindings' hosts, the detail-panel recipe (host
  shell + `<PanelsOutlet>` + consumer contributing a panel for a custom subject type),
  and the reactivity caveat above.
- Extend the compositions README's "pick by problem shape" table from three primitives
  to four: route/module zones (pick-one, route-keyed) · **panels (render-all,
  subject-keyed, open contribution)** · compositions (pick-one per zone, closed,
  state-coordinated) · journeys (one step at a time, flow). This table is where the
  naming decision pays for itself — with a third "zones" it would be unreadable.
- Contrast with `remote-capability-manifests.md` pairing (pick-one by id vs render-all
  by predicate), as the request suggests — that part of §4F is accepted as-is.

## What cat-factory's §6 acceptance criteria become

| Their criterion                                                                                 | Disposition                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@modular-vue/zones` published; `defineZone`/`ZoneOutlet`/`useZone`/`useZoneSubject` importable | **Changed**: import `definePanelGroup`/`resolvePanels` (engine, via `@modular-vue/core`) and `usePanels`/`<PanelsOutlet>`/`usePanelSubject` (`@modular-vue/vue`). No new package. |
| Render-all, ordered, sectioned, no router                                                       | **Met**, with sections replaced by per-region group ids.                                                                                                                          |
| Subject-reactive, incl. mutable run-state predicates                                            | **Met**, with the documented reactive-source boundary (their subject already qualifies).                                                                                          |
| Render-all distinct from `pairById`                                                             | **Met**; documented side by side.                                                                                                                                                 |
| Consumer-extensible via module registration, no host edit                                       | **Met** — it is the existing module → slot path.                                                                                                                                  |
| Headless `/testing` resolver                                                                    | **Met** by `resolvePanels` being a pure engine export; no subpath needed.                                                                                                         |
| `installModularApp` provides the zone manifest, typed, opt-in                                   | **Obsolete** — the slots context Nuxt already provides is the manifest; nothing to thread.                                                                                        |
| Peer alignment                                                                                  | **Superseded** by the corrected picture above (family-wide widen to `^0.3.0`, incl. compositions/testing).                                                                        |
| Docs                                                                                            | **Met** per the docs plan.                                                                                                                                                        |
| Additive, no breaking changes                                                                   | **Met** — and only met _because_ the `defineModule({ zones })` seam was rejected; as requested it was breaking.                                                                   |

Slice 5's reuse claim survives intact: the agent-run result windows become a second
panel group whose subject is the selected step — same handle, resolver, and outlet.

## Decisions for the maintainer before implementation

1. **Name** — "panels" recommended; "zones" rejected with prejudice. (Blocks everything
   downstream of it, including the guide filename and the downstream spec's vocabulary.)
2. **React host in the same train** — recommended yes (it is small and keeps the
   both-bindings rule intact); shipping engine + Vue first and React one train later is
   defensible if the train needs to be lean.
3. **Duplicate-id stance in `resolvePanels`** — throw (recommended, matches
   `resolveComponentRegistry`) vs dev-warn; an `onDuplicate` escape hatch can mirror the
   pairing API if a deployment needs intentional shadowing.
