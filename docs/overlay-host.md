# State-keyed overlay host (`useOverlay` / `<OverlayOutlet>` / `useModalBehavior`)

A pick-**one**, app-state-keyed, open-contribution **modal host**: modules (first-party
and consumer alike) contribute _windows_ — a body component plus presentation metadata —
to a named overlay host; application state names the one active window by id; the
framework mounts it inside a **managed modal shell** that owns the behaviour every
hand-rolled modal gets subtly wrong somewhere: teleport/portal out of the document flow,
backdrop click-to-close, a shared overlay **stack** (nested overlays layer in open order;
Escape closes the top first), **focus trap + focus return**, **body scroll lock**, and
a11y wiring (`role="dialog"`, `aria-modal`, `aria-label` from the entry's title).

This is the pick-one, modal sibling of [subject-keyed panels](subject-panels.md):

|             | Panels (`<PanelsOutlet>`)           | Overlay host (`<OverlayOutlet>`)                     |
| ----------- | ----------------------------------- | ---------------------------------------------------- |
| Cardinality | **all** matching entries, ordered   | **one** entry (or none)                              |
| Selection   | subject + per-entry `when(subject)` | a caller-supplied **active id** (app state)          |
| Placement   | inline, in the document flow        | teleported/portaled, above the app                   |
| Behaviour   | none (plain rendering)              | managed modal behaviour, structural                  |
| Subject     | drives selection                    | payload only — threaded to the window, not selecting |

Both are pure, read-side projections of an already-resolved slot. Neither registers
anything; contributions ride the existing `module.slots` path. The engine surface lives
in `@modular-frontend/core`, the hosts in `@modular-react/react` and `@modular-vue/vue`
(re-exported by `@modular-vue/core`; the React facade re-exports the engine wholesale).

The host is **headless**: it renders exactly two elements — the backdrop and the dialog
panel — styleable via class props, and hands everything inside the dialog to your
chrome via a `wrap` render-prop/slot. Your design system supplies the pixels; the
framework supplies the behaviour. And the host **never closes itself**: backdrop click
and Escape _request_ close (`onClose` / `@close`); your handler clears the active id.
State stays app-owned, exactly like every other selection in the family.

## When to use an overlay host

- A surface of modal windows where **exactly one is open at a time**, selected by app
  state (not by route): result views, detail dialogs, pickers, confirmation flows
  contributed by feature modules.
- Consumer deployments must be able to **contribute their own window** (for a custom
  entity/agent/block kind) and inherit correct modal behaviour with zero host edits.
- You are hand-rolling `<Teleport>`/portal + backdrop + Escape + focus code per window
  today — that duplication (and its drift: missed focus traps, missing `role`,
  inconsistent test ids) is exactly what the managed shell removes structurally.

Not this primitive: render-all inline detail regions ([panels](subject-panels.md)),
route-driven surfaces (`ModuleRoute` / zones), stepped flows (journeys), multi-module
layouts with shared state (compositions).

## The entry shape

```ts
import type { OverlayEntry } from "@modular-frontend/core";

interface OverlayEntry<TSubject, TMeta = unknown> extends ComponentEntry<UiComponent, TMeta> {
  readonly id: string; // the id app state selects by; unique per host
  readonly component: UiComponent; // the window body — opaque to the engine
  readonly title?: string | ((subject: TSubject | null) => string); // → aria-label
  readonly props?: Record<string, unknown>; // merged under the injected { subject }
  readonly meta?: TMeta; // app presentation (icon, width variant, …) for YOUR chrome
}
```

Two fields deserve a note:

- **`title` is behaviour, `meta` is presentation.** The host resolves `title` against
  the current subject and wires it to the dialog's `aria-label`, so every contributed
  window ships a labelled dialog with zero app effort. Icons, size variants, badges —
  anything only _your_ chrome renders — belongs in `meta`, which the framework carries
  opaquely.
- **`OverlayEntry` is a superset of `ComponentEntry`**, so a slot that already serves
  `resolveComponentRegistry` (the slice-2 pairing surface) can serve an overlay host
  too — migrate a hand-rolled modal surface window by window, no flag-day.

## Declaring a host

```ts
import { defineOverlayHost } from "@modular-frontend/core"; // or your binding's core

export interface StepRef {
  readonly instanceId: string;
  readonly stepIndex: number;
}

/** Export once; import at the host and at every contributor. */
export const resultViews = defineOverlayHost<StepRef>("resultViews");
```

Like `definePanelGroup`, the handle's only runtime field is the slot key; the subject
type rides along as a phantom so `title(subject)` and `useOverlaySubject()` type-check
end to end. The subject is whatever state you thread to the active window — and it may
be `null` while a window is open (selection is by id; a window that reads its own store
simply ignores the subject).

## Contributing a window (any module, including a consumer's)

```ts
defineModule({
  id: "agent-windows",
  version: "1.0.0",
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

A consumer module contributes the same way through its own registration path — no host
edit, no framework change. Namespace consumer ids (`"acme:security-report"`) so they
cannot collide with first-party ones; duplicate ids **throw** by default
(`onDuplicate: "first-wins" | "last-wins"` to shadow intentionally, same stance and same
shared implementation as `resolveComponentRegistry` / `resolvePanels`).

## The resolver

```ts
import { resolveOverlay } from "@modular-frontend/core";

const active = resolveOverlay(slotEntries, activeId, opts?);
// 1. duplicate-id validation (before anything else — a registration bug
//    surfaces on first resolve, even while nothing is open)
// 2. activeId null/undefined → null (closed)
// 3. otherwise the entry with that id, or null for a DANGLING id
```

A dangling id — app state names a window no installed module provides — is **data, not
a crash** (it may name a window another deployment ships). The resolver returns `null`;
the hosts render nothing and `console.warn` in dev. This mirrors `pairById`'s `missing`
bucket. `resolveOverlay` is a pure engine export: unit-test your wiring by calling it
directly, no DOM, no testing subpath needed.

## The host — Vue

```vue
<script setup lang="ts">
import { OverlayOutlet } from "@modular-vue/vue"; // or @modular-vue/core
import { resultViews } from "../overlay-hosts";
import { useUiStore } from "../stores/ui";

const ui = useUiStore();
</script>

<template>
  <OverlayOutlet
    :host="resultViews"
    :active-id="ui.resultView?.view ?? null"
    :subject="ui.selectedStep"
    :subject-key="(s) => `${s?.instanceId}:${s?.stepIndex}`"
    backdrop-class="fixed inset-0 flex items-center justify-center bg-slate-950/70"
    panel-class="w-full max-w-3xl rounded-2xl border bg-slate-900 shadow-2xl"
    @close="ui.closeResultView()"
  >
    <template #wrap="{ entry, subject, close, children }">
      <!-- YOUR chrome: header, icon from entry.meta, close button, … -->
      <ResultWindowChrome :entry="entry" :subject="subject" @close="close">
        <!-- Render `children` (a VNode) through a component with STABLE
             identity — a functional component defined once, `const RenderVNode =
             (p: { node: VNode }) => p.node`. An inline `<component
             :is="() => children" />` gets a fresh identity on every parent
             re-render (e.g. when a nested overlay bumps the shared stack) and
             would remount the window, dropping its local state. -->
        <component :is="RenderVNode" :node="children" />
      </ResultWindowChrome>
    </template>
    <template #empty><!-- optional: rendered in place while closed --></template>
  </OverlayOutlet>
</template>
```

Props: `host`, `activeId`, `subject`, `subjectKey`, `onDuplicate`, `to` (teleport
target, default `"body"`), `teleportDisabled`, `closeOnBackdrop` (default `true`),
`backdropClass`, `panelClass`, `ariaLabelledby` (the `id` of a heading the window
renders in `#wrap`, for a title-less window — forwarded to the dialog's
`aria-labelledby`). Emits `close`. Also exported: `useOverlay(host,
activeId, opts?)` (a `computed` over the slots context — every argument is a
`MaybeRefOrGetter`), `useOverlaySubject<TSubject>()` (reads the provided subject inside
the window, no prop-drilling; throws outside an outlet), `overlaySubjectKey`.

The same reactivity boundary as `usePanels` applies: pass `activeId`/`subject` from
reactive state (a Pinia computed, a ref) — see the caveat in
[subject-panels.md](subject-panels.md) and [reactive-slots-vue.md](reactive-slots-vue.md).
Windows contributed through `dynamicSlots` update on both runtime slot sources.

## The host — React

```tsx
import { OverlayOutlet } from "@modular-react/react";
import { resultViews } from "../overlay-hosts";

<OverlayOutlet
  host={resultViews}
  activeId={ui.resultView?.view ?? null}
  subject={selectedStep}
  subjectKey={(s) => `${s?.instanceId}:${s?.stepIndex}`}
  onClose={() => ui.closeResultView()}
  backdropClassName="app-backdrop"
  panelClassName="app-dialog"
  wrap={({ entry, subject, close, children }) => (
    <ResultWindowChrome entry={entry} subject={subject} onClose={close}>
      {children}
    </ResultWindowChrome>
  )}
/>;
```

Same surface with props instead of slots (`empty` / `wrap` are props), `to` /
`portalDisabled` for the portal target, `ariaLabelledby` for a title-less
window, and `useOverlay` / `useOverlaySubject` / `OverlaySubjectContext` as the
hook-shaped reads.

## What the managed shell guarantees (both bindings)

- **Teleported/portaled** to `body` by default; nothing renders while closed (the
  `#empty` slot renders in place).
- **Backdrop press-and-release** requests close (`closeOnBackdrop={false}` to opt
  out). Only a press that both starts _and_ releases on the backdrop counts — a press
  that starts inside the dialog and slips onto the backdrop (a text selection, a
  missed drag) is not a close request.
- **One overlay stack per app.** Every open overlay — outlet-hosted or bespoke via
  `useModalBehavior`, whichever binding mounted it — registers on the engine's single
  `sharedOverlayStack`. Nested overlays layer in open order; **Escape closes only the
  top**; when it closes, the one below becomes top.
- **Focus**: moved into the dialog on open (`initialFocus` if given, else the first
  focusable, else the dialog itself), Tab-cycled within it while open, re-applied when
  the active window **swaps without closing** (so focus follows the new content), and
  **returned to the opener** on close.
- **Scroll**: body scroll locked while any overlay is open, restored when the last
  closes.
- **A11y**: `role="dialog"`, `aria-modal="true"`, `aria-label` from `title` resolved
  against the subject (or `aria-labelledby` pointed at a heading the window renders
  in `wrap` when it ships no `title`), `tabindex="-1"` on the panel.
- **Stable e2e hooks**: `data-modular-overlay-backdrop`, `data-modular-overlay-panel`,
  `data-overlay-id="<entry.id>"` — no configuration, no per-app drift.
- **Containment**: the window body renders inside `ModuleErrorBoundary` (label
  `"Overlay"`), so a throwing window cannot take down the shell.
- **Subject injection**: as a `subject` prop _and_ via `provide`/context
  (`useOverlaySubject`), keyed per `(entry.id, subjectKey)` so switching subjects
  remounts the window instead of leaking state across opens — the `subjectKey`
  contract from panels, pick-one edition.

## Conscious constraints — what the shell deliberately does _not_ do

The overlay host is the first surface in this family that owns DOM behaviour rather
than pure rendering, and that line is held on purpose. The guarantee list above is the
whole contract: a behaviour joins it only when it is **structural** (it cannot be made
uniformly correct per app or per window — the reason the host exists) and carries
**zero visual opinion**. Everything below is out of scope by decision, not omission,
and feature requests for them start from a default of _no_:

- **No pixels, ever.** No CSS ships, no default `z-index`, no positioning, no
  transitions or animation hooks. Stacking order is DOM order at the teleport/portal
  target; your `backdropClass` supplies `position`/`inset`/`z-index` along with the
  rest of your design system. Enter/leave animation belongs to your `wrap` chrome.
- **No chrome anatomy.** The host renders exactly two elements — backdrop and dialog
  panel — and will not grow header/footer/close-button slots. That anatomy was
  proposed and rejected in the [triage](overlay-host-triage.md); `wrap` is the whole
  answer.
- **No background `inert`/`aria-hidden` management.** `aria-modal="true"` is the
  contract with assistive tech. Marking the rest of the app inert (and the churn of
  restoring it correctly around portals, toasts, and third-party DOM) stays app scope.
- **Structural focusable detection only.** The focus trap scans by attributes
  (`a[href]`, non-disabled form controls, tabindex) and does not chase the rendered
  long tail — `visibility: hidden` content, elements hidden by an ancestor,
  `contenteditable`, zero-size targets. If a window's first structural focusable is
  visually hidden, pass `initialFocus` or restructure the window.
- **No platform scroll-lock workarounds.** The lock is a counted
  `body.style.overflow` save/restore. iOS rubber-band suppression,
  scrollbar-gutter compensation, and nested-scroll-container policy are app scope.
- **No router awareness** — held from the original triage. State in, requests out.

If a surface needs behaviour beyond this contract, the supported moves are, in order:
put it in your `wrap`/chrome (visual), layer it over `useModalBehavior` (structural
but yours), or use a dedicated dialog library for that one surface — accepting that a
surface which bypasses `useModalBehavior` is invisible to the shared stack, so Escape
ordering and scroll-lock counting no longer coordinate with hosted windows. Do **not**
nest another focus-trapping dialog library _inside_ a hosted window: two traps fight.

## `useModalBehavior` — the behaviour without the shell

For a surface that needs a bespoke root (a full-bleed detail view, a hand-styled
transition wrapper) but must behave like a first-class overlay:

```ts
const { dialogRef, isTop } = useModalBehavior({
  active: () => ui.detailOpen, // React: a boolean
  onClose: () => ui.closeDetail(),
  // initialFocus?: element to focus on activation
  // contentKey?: identity of the hosted content — when it changes while
  //   active (the surface swaps content without closing), initial focus is
  //   re-applied so focus follows the swap
});
// Put dialogRef on your root (give it tabindex="-1"); style it however you like.
```

Same stack, same focus/scroll/Escape rules as the outlet — a bespoke overlay and a
hosted window layer and close correctly against each other because they share the one
stack. (`<OverlayOutlet>` is implemented on exactly this composable/hook.)

## End-to-end: an app shell over the host

Two runnable examples build exactly this — the agent-run "result windows" shape,
one per binding, with matching Playwright suites that assert the whole behaviour
contract (open/close, Escape, backdrop press-and-release, focus trap + return,
window swap, consumer contribution, the shared stack, and the dangling-id
stance):

- **React Router** — [`examples/react-router/overlay-result-windows`](../examples/react-router/overlay-result-windows)
- **Vue Router** — [`examples/vue/overlay-result-windows`](../examples/vue/overlay-result-windows)

They are the pick-one, modal sibling of the [`inspector-panels`](../examples/react-router/inspector-panels)
panels example, and read side by side to show the one engine-first contract
observed by both bindings.

The intended division of labor, using that same "result windows" shape:

1. The app declares the host (`defineOverlayHost<StepRef>("resultViews")`) and mounts
   **one** `<OverlayOutlet>` in its shell, driving `activeId` from its ui store and
   styling via `backdropClass` / `panelClass` / `wrap`. The `wrap` chrome renders the
   header (icon and width variant from `entry.meta`, title text, close button) — and
   can host cross-cutting header regions with a nested `<PanelsOutlet>` keyed by the
   step, so any module can add a header control to every window without touching the
   shell ([panels](subject-panels.md) doing what panels do).
2. Each window module contributes `{ id, component, title, meta }` to the slot and
   keeps its body logic; all `<Teleport>`/backdrop/Escape/focus code it carried is
   deleted — the shell owns it now.
3. A consumer deployment ships `registerAppModule`-style modules contributing windows
   for its custom kinds, paired against the same wire-delivered id space
   ([remote-capability-manifests.md](remote-capability-manifests.md)) — and inherits
   the full behaviour contract with zero host edits.

## Overlays vs the neighbours

| Question                                        | Use                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| One window, selected by app state, modal        | **Overlay host** (this guide)                                                     |
| Many detail panels for a selection, inline      | [Panels](subject-panels.md)                                                       |
| One component per id, no hosting opinion        | Pairing (`resolveComponentRegistry`)                                              |
| Route-attached widget                           | `module.zones` / route zones                                                      |
| Stepped multi-module flow (possibly in a modal) | Journeys — hosted _inside_ an overlay window or a bespoke `useModalBehavior` root |

## Testing

- **Engine**: call `resolveOverlay(entries, activeId)` directly — pure, no DOM. The
  duplicate-id and dangling-id stances are deterministic and unit-testable.
- **Hosts**: mount `<OverlayOutlet>` with a provided slots context (see
  `packages/vue/src/overlay.test.ts` / `packages/react/src/overlay.test.tsx` for the
  provide pattern). Vue tests can pass `teleport-disabled` to keep the shell inside
  the wrapper — but attach to the document for focus assertions, since `focus()` only
  moves `document.activeElement` for connected elements.
- **E2e**: select on the stable `data-modular-overlay-*` hooks rather than app test
  ids, so suites survive chrome restyling.
