# Triage: the cat-factory slice-5 request for a Vue overlay host (`OverlayOutlet`)

Downstream request: [kibertoad/cat-factory#1217](https://github.com/kibertoad/cat-factory/pull/1217)
(`docs/initiatives/modular-vue-slice5-upstream-overlays.md` on their side). Status here:
**triaged — accepted in substance, redirected in shape — and now implemented.** This
document is the upstream half of the co-evolution artifact, the slice-5 sibling of
[`subject-keyed-zones-triage.md`](subject-keyed-zones-triage.md). See
[Resolution](#resolution--implemented) at the bottom for what shipped; the guide is
[`docs/overlay-host.md`](overlay-host.md).

## Verdict in one paragraph

The need is real, and this time the request's self-diagnosis is almost exactly right: a
**pick-one, app-state-keyed overlay host with framework-managed modal behaviour** is a
genuinely missing primitive — the modal dual of slice 4's render-all panels — and the
evidence (2 of 18 windows trap focus, every window re-registers its own global Escape
listener, `z-50` hard-coded eighteen times, `role="dialog"` dropped in one, test ids
drifting) shows precisely the kind of _behavioural_ defect that no amount of copy-paste
discipline fixes and that only a host owning the behaviour fixes structurally. Our own
codebase agrees: `examples/vue/nuxt-modal-journey` hand-rolls the same chrome with none
of the a11y behaviour, and `frontend-core`'s `MountKind` comment has anticipated "modal
hosts" as a future surface since PR-33. But the proposed delivery repeats, almost
clause for clause, the shape mistakes slice 4 made and this repo already redirected:
a new `overlays` registration seam on module descriptors, Nuxt manifest threading, a
`/testing` subpath, a route-sync helper, and a Vue-only landing. The selection half of
the request is **already shipped** (it is slice-2 pairing over a slot); the genuinely
new half is the **managed modal behaviour**, which is framework-shaped but not
Vue-shaped, and lands engine-first with React and Vue hosts in the same train.

## What the request gets right

- **Gap A/B are real, and correctly separated from selection.** Nothing in the family
  hosts a modal: no `Teleport`/portal use exists in any published package, no focus
  trap, no scroll lock, no overlay stack. The request is also right that
  `<PanelsOutlet>` cannot be bent into this — panels are render-all + inline; an
  overlay is pick-one + teleported + behaviourally managed. Different reduction on
  both axes, correctly identified as a different primitive.
- **The slice-4 §5.6 correction is honest and load-bearing.** The whole-surface survey
  (11 step-keyed windows, 7 block-keyed, exactly one open at a time) is exactly the
  evidence needed to justify a pick-one host keyed by caller-supplied state rather
  than "reuse panels keyed by the selected step". Panels remain the right tool for the
  shared header regions — as a _secondary_ use inside the app's shell, needing no
  upstream change. Both calls are correct.
- **The headless/styling split is right.** The framework owns behaviour (teleport,
  backdrop-close, Escape, focus trap + return, scroll lock, stacking, a11y wiring);
  the app owns pixels. That is what makes a consumer-contributed window inherit
  _correct_ chrome instead of re-deriving it — the same extensibility argument that
  moved panels upstream, and the load-bearing one here too.
- **Selection must reuse slice-2 pairing semantics.** Correct instinct: the engine
  must not grow a second, divergent id-matcher. (We hold the request to this harder
  than it holds itself — see shape point 2.)
- **`useModalBehaviour` as a public escape hatch is a good idea.** Their deferred
  full-bleed surfaces (`AgentStepDetail`, `ObservabilityPanel`) and our own
  modal-journey example both want the behaviour without the centered-card host.
- **The "why not a local shell" section is the initiative working as designed.** A
  local `ResultWindowShell` would fix the duplication and leave the behaviour
  re-derived per app and unavailable to consumer modules — the "local shim that
  reimplements a missing library primitive" both sides' protocol forbids.

## Where the request goes wrong

### 1. `defineModule({ overlays: … })` — the same seam slice 4 already rejected

The request proposes windows "declared on module descriptors
(`defineModule({ overlays: { resultViews: [...] } })`)". Slice 4 litigated exactly
this and the answer has not changed: **slots are the ingress.** `SlotMap` entries are
opaque by design; contributing typed `OverlayEntry` objects under the host's slot key
is what slots are for, not a workaround. A new `overlays` descriptor field would be a
second registration concept sitting beside `zones` (route/module-keyed, pick-one) and
the slot path, for no capability the slot path lacks — and consumer extension via
`registerAppModule` falls out of the existing module → slot path for free, which is
the property the request actually wants. No descriptor change ships.

### 2. `resolveOverlay` as specified is bigger than the gap

The request specifies `resolveOverlay(entries, activeId)` "reusing `pairById` under
the hood" — but `pairById` joins a _list_ of manifest items against a registry; the
overlay case is one id against one slot. What is actually missing from the engine is
small: a typed entry, a phantom-typed handle carrying `TSubject` (the
`definePanelGroup` convention), and a resolver that is `collapseEntriesById` (the
_shared_ duplicate-id implementation behind `resolveComponentRegistry` and
`resolvePanels` — the stances cannot drift) plus a map lookup. Semantics follow the
panels precedent exactly: duplicate validation runs **before** the null guard so a
registration bug surfaces on first resolve even while nothing is open; `activeId:
null` → closed; an id that resolves to nothing → `null`, which the hosts dev-warn on
(the `pairById` "missing"-bucket stance: a dangling reference is a warn-and-fallback,
not a throw — the id may name a window a consumer deployment ships and this one
doesn't).

Two entry-shape redirects:

- **`icon` is rejected; `title` is kept.** `title` is a11y-load-bearing — it is what
  the host wires into the dialog's accessible name, so it must be a first-class,
  subject-aware field (`string | ((subject) => string)`). `icon` is pure app
  presentation with no behaviour attached; it rides the existing `meta` field
  (`OverlayEntry` extends `ComponentEntry`, so `meta` is already there), where the
  app's shell — the thing that renders icons — reads it. The engine blesses what the
  behaviour needs, nothing more.
- **`OverlayEntry` extends `ComponentEntry`.** Deliberate: cat-factory's
  `resultViews` slot already holds `ComponentEntry`-shaped objects consumed by
  `resolveComponentRegistry`. Making the overlay entry a superset means the same slot
  serves the existing registry path and the new host during migration — the slice-5
  refactor is additive window-by-window, not a flag-day.

### 3. Vue-only delivery inverts the family's architecture — again

The behaviour in this request — focus trap, focus return, scroll lock, stack-aware
Escape, backdrop-close, a11y wiring — contains not one Vue-shaped element. React
consumers have the identical need (the React family has no modal host either), and
the operating rule restated in the slice-4 triage holds: _engine-first, both bindings
in the same train._ Shipping a Vue-only overlay host would leave React to later port
from the Vue binding — the inversion the family exists to prevent. The neutral parts
(entry/handle/resolver, and the overlay **stack** — pure order-of-registration data
with a subscribe seam, no DOM) land in `@modular-frontend/core`; each binding ships
the same thin host and behaviour composable/hook over them. The DOM-touching parts
(focus, scroll, key events) are per-binding by necessity, but they share the engine
stack so "the top overlay closes first" is one implementation of _semantics_, twice
of _glue_.

### 4. §4E Nuxt threading and the `/testing` entry — obsolete for the same reason as slice 4

`<OverlayOutlet>` reads the same slots context (`slotsKey` / `reactiveSlotsKey`) the
runtime already provides and `installModularApp` already installs. There is no
overlay manifest to thread, no `manifest.overlays` to type, no plugin, no cast —
the request's §4E collapses to zero code, exactly as its §4E predecessor did in
slice 4. Likewise the headless testing entry: `resolveOverlay` is a pure named
export of the engine; cat-factory unit-tests its wiring by calling it. No subpath.

### 5. The route-sync helper — cut (YAGNI, their own assessment)

The host is route-free _by construction_: nothing in the slot + `activeId` path can
see a router. The request itself marks the routed case a nice-to-have with no
consumer. Same disposition as slice 4: cut entirely; nothing needs keeping off a
"baseline import path" because no such path exists to guard.

### 6. Gap D is stale — for the third consecutive slice

The request tracks peer ranges as of the published `1.3.x`/`1.4.x` line. In-repo,
the whole category is already closed (the "shared peer dependency" change, PR #95):
every `@modular-frontend/core` peer range family-wide is the single forward-looking
`>=0.1.0 <2.0.0`, and `@modular-react/core`, `@modular-frontend/journeys-engine`,
and `@modular-frontend/compositions-engine` no longer carry core as a hard
dependency at all — it is a peer backed by a dev dependency, so the "second engine
copy beside 0.4.0" their override works around cannot recur. Both residuals the
request re-files are fixed by changes that ship in the same release train as the
overlay surface; the new surface is born onto the unified range with no per-package
edit. cat-factory can drop its `@modular-frontend/core: 0.4.0` override on adoption.

### 7. Small redirects on the host surface

- **`aria-labelledby` → `aria-label`.** A headless host renders no title element, so
  there is nothing for `aria-labelledby` to reference. The host derives the dialog's
  accessible name from `entry.title` (resolved against the subject) and sets
  `aria-label` — the same a11y outcome, zero styling opinion, works with zero app
  effort. An app that renders its own labelled heading may override via its chrome.
- **Five named slots → one render-prop + `#empty`.** The requested
  `#backdrop` / `#panel` / `#header` / `#header-extras` / `#default` decomposition
  bakes a particular chrome anatomy into the framework surface. The host instead
  renders exactly two elements (backdrop, dialog panel — the two the behaviour needs
  to own), styleable via `backdropClass` / `panelClass`, and hands everything inside
  the dialog to a single `#wrap` (Vue) / `wrap` (React) render-prop receiving
  `{ entry, subject, close, isTop, children }` — the same shape `<PanelsOutlet>`
  established. Header, icon badge, close button, `StepRestartControl`,
  header-hosted `<PanelsOutlet>` — all of that is the app's `wrap`, where its design
  system lives. `#empty` mirrors panels.
- **Ad-hoc `data-testid` props → stable namespaced data attributes.** The host stamps
  `data-modular-overlay-backdrop`, `data-modular-overlay-panel`, and
  `data-overlay-id="<entry.id>"` unconditionally. E2E suites get a stable modal
  selector with no configuration and no drift; app-level `data-testid`s remain the
  app's business inside its chrome.
- **`useModalBehaviour` → `useModalBehavior`.** House spelling (cf. "Default exit
  behavior", `docs/` throughout). Same contract as requested: `{ active, onClose,
initialFocus? }` → `{ dialogRef, isTop }`, public in both bindings.

## What we will build instead (proposed)

Engine (`@modular-frontend/core`; components stay opaque `UiComponent`s):

```ts
/** Superset of ComponentEntry — the same slot can serve resolveComponentRegistry
 *  and the overlay host during an incremental migration. */
export interface OverlayEntry<TSubject, TMeta = unknown> extends ComponentEntry<
  UiComponent,
  TMeta
> {
  /** Accessible name for the dialog; subject-aware. The host wires it to aria-label. */
  readonly title?: string | ((subject: TSubject | null) => string);
  /** Extra props merged with the injected { subject } by a binding's host. */
  readonly props?: Record<string, unknown>;
}

/** Phantom-typed handle, the definePanelGroup convention: slotKey + TSubject. */
export function defineOverlayHost<TSubject>(slotKey: string): OverlayHostHandle<TSubject>;

/** Pure pick-one: dedupe (shared collapseEntriesById; throw by default, first/last-wins
 *  escape hatch), null activeId → null, then a map lookup. Dangling id → null. */
export function resolveOverlay<TSubject, TMeta = unknown>(
  entries: readonly OverlayEntry<TSubject, TMeta>[],
  activeId: string | null | undefined,
  opts?: { onDuplicate?: OnDuplicateComponentId },
): OverlayEntry<TSubject, TMeta> | null;

/** Resolve an entry's accessible name against the subject. */
export function resolveOverlayTitle<TSubject>(
  entry: OverlayEntry<TSubject>,
  subject: TSubject | null,
): string | undefined;

/** Pure LIFO stack with a subscribe seam — the shared "top overlay closes first"
 *  semantics both bindings' behaviour implementations consume. No DOM. */
export function createOverlayStack(): OverlayStack; // push(): { release(); isTop() }, size, subscribe(cb)
```

Vue (`@modular-vue/vue`, re-exported from `@modular-vue/core`):

- `useOverlay(host, activeId, opts?)` — `computed` over the slots context (both
  runtime sources, the `usePanels` pattern) + the active id.
- `<OverlayOutlet :host :active-id :subject :subject-key :to :close-on-backdrop
:backdrop-class :panel-class @close>` — teleports (default `body`), renders
  backdrop + dialog (`role="dialog"`, `aria-modal`, `aria-label` from `title`,
  `tabindex="-1"`, the stable data attributes), mounts the one active entry inside
  `ModuleErrorBoundary` (label `"Overlay"`), injects the subject as a prop **and**
  via `provide` (`useOverlaySubject`), keys per `(entry.id, subjectKey)`, and owns
  the behaviour via `useModalBehavior`. Emits `close` on backdrop click, Escape
  (top-of-stack only) — state stays app-owned: the host _requests_ close, the app
  clears the id. `#wrap` / `#empty` slots.
- `useOverlaySubject<TSubject>()`, `overlaySubjectKey`.
- `useModalBehavior({ active, onClose, initialFocus? })` → `{ dialogRef, isTop }` —
  stack registration, focus trap + focus return, scroll lock (shared lock count),
  Escape gated on top-of-stack. Public, for bespoke roots.

React (`@modular-react/react`, same train): `useOverlay`, `<OverlayOutlet>` (portal,
`empty` / `wrap` props, `onClose`), `useOverlaySubject` / `OverlaySubjectContext`,
`useModalBehavior` — the same surface with `useMemo` / context /
`useSyncExternalStore` over the same engine stack. Angular: the engine part is done
for it; hosts when its gate opens.

Module authors contribute through the existing field — no descriptor change:

```ts
defineModule({
  id: "agent-windows",
  slots: {
    resultViews: [
      {
        id: "test-report",
        component: TestReportWindow,
        title: (step: StepRef | null) =>
          step ? `Test report — step ${step.stepIndex}` : "Test report",
        meta: { icon: "i-lucide-flask-conical", width: "wide" },
      },
    ],
  },
});
```

Dropped from the proposed API, deliberately: `defineModule({ overlays })`,
`icon` as a blessed field, the five-slot chrome anatomy, the route-sync helper, the
`/testing` subpath, Nuxt manifest threading, and any router awareness.

## What cat-factory's §6 acceptance criteria become

| Their criterion                                                                             | Disposition                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OverlayOutlet` / `useOverlaySubject` / `useModalBehaviour` importable from the Vue binding | **Met** (spelling: `useModalBehavior`); engine surface via `@modular-vue/core` re-export.                                                                             |
| Managed modal shell, no router, `activeId = null` → `#empty`                                | **Met**; unit-covered in both bindings.                                                                                                                               |
| Pick-one vs `PanelsOutlet` render-all, demonstrated distinct                                | **Met**; documented side by side in the guide + comparison table.                                                                                                     |
| Uniform structural behaviour incl. nested stacking, Escape top-first                        | **Met** — engine stack + per-binding behaviour; test-covered.                                                                                                         |
| Subject-reactive, injected two ways, null-subject safe, re-keyed per subject                | **Met** — the `usePanelSubject` guarantees, pick-one edition.                                                                                                         |
| Consumer window via module registration, correct chrome, zero host edits                    | **Met** — it is the existing module → slot path.                                                                                                                      |
| Headless testing entry                                                                      | **Met** by `resolveOverlay` being a pure engine export; no subpath.                                                                                                   |
| `installModularApp` provides a typed overlay manifest                                       | **Obsolete** — the slots context Nuxt already provides _is_ the manifest; nothing to thread.                                                                          |
| Peer/dep alignment (`^0.4.0` family-wide, journeys-engine dep)                              | **Superseded** — already closed in-repo by the shared-peer change (`>=0.1.0 <2.0.0` unified; core promoted from dependency to peer in the engines); ships this train. |
| Docs                                                                                        | **Met** per the docs plan below.                                                                                                                                      |
| Additive, no breaking changes                                                               | **Met** — and, as in slice 4, only met because the descriptor seam was rejected.                                                                                      |

## Docs plan

- New guide [`docs/overlay-host.md`](overlay-host.md): the entry shape, the resolver,
  both bindings' hosts, the behaviour contract (stacking, focus, scroll, Escape,
  a11y), the state-hosted modal recipe (app shell via `wrap` + a consumer
  contributing a window for a custom kind), and the pick-one-modal vs
  render-all-panels contrast.
- Extend the compositions README's "pick by problem shape" table four → five.
- Cross-links: `subject-panels.md` (the sibling), `remote-capability-manifests.md`
  (pairing selects, overlays host), `framework-mode-nuxt.md` (consumer seam).

## Decisions for the maintainer before implementation

1. **Name** — "overlay" recommended: unclaimed in the family (checked: no package
   uses it; "modal"/"dialog" appear only as prose), matches the `*Outlet` host
   convention, and names the surface (a layer above the app) rather than one styling
   (modal). The behaviour composable keeps "modal" (`useModalBehavior`) because
   that _is_ the behaviour bundle's name.
2. **React host in the same train** — recommended yes, same grounds as slice 4.
3. **Dangling active id: warn vs throw** — dev-warn + render nothing (recommended;
   the `pairById` "missing" stance — the id may name a window another deployment
   ships), vs throw (rejected: turns a data-driven id into a crash).

## Resolution — implemented

All three decisions landed on the recommended option; the counter-proposal shipped
as-scoped (no new package, no descriptor change, no `/testing` subpath, no Nuxt
threading, no route helper):

- **Engine** (`@modular-frontend/core`): `OverlayEntry<TSubject, TMeta>`,
  `OverlayHostHandle<TSubject>`, `defineOverlayHost`, `resolveOverlay` (dedupe via
  the shared `collapseEntriesById` before the null guard; pick-one lookup; dangling
  → `null`), `resolveOverlayTitle`, and `createOverlayStack` (pure LIFO with
  `subscribe`, the shared stacking semantics). Re-exported by `@modular-react/core`
  (`export *`) and `@modular-vue/core`.
- **Vue** (`@modular-vue/vue`, re-exported from `@modular-vue/core`): `useOverlay`,
  `<OverlayOutlet>` (Teleport, backdrop `click.self` → `close`, managed behaviour,
  `#wrap` / `#empty`, subject as prop + `provide`, per-subject keying, stable data
  attributes, `ModuleErrorBoundary` label `"Overlay"`), `useOverlaySubject` /
  `overlaySubjectKey`, `useModalBehavior`.
- **React** (`@modular-react/react`): `useOverlay`, `<OverlayOutlet>` (portal,
  `empty` / `wrap` / `onClose` props), `useOverlaySubject` / `OverlaySubjectContext`,
  `useModalBehavior` (`useSyncExternalStore` over the engine stack).
- **Docs**: [`docs/overlay-host.md`](overlay-host.md); comparison table extended
  four → five; cross-links per the plan.
- **Gap D**: confirmed already closed by the shared-peer-dependency change; ships in
  the same release train. Nothing further to widen.
