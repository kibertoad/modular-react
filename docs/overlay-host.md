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
        <component :is="() => children" />
      </ResultWindowChrome>
    </template>
    <template #empty><!-- optional: rendered in place while closed --></template>
  </OverlayOutlet>
</template>
```

Props: `host`, `activeId`, `subject`, `subjectKey`, `onDuplicate`, `to` (teleport
target, default `"body"`), `teleportDisabled`, `closeOnBackdrop` (default `true`),
`backdropClass`, `panelClass`. Emits `close`. Also exported: `useOverlay(host,
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
`portalDisabled` for the portal target, and `useOverlay` / `useOverlaySubject` /
`OverlaySubjectContext` as the hook-shaped reads.

## What the managed shell guarantees (both bindings)

- **Teleported/portaled** to `body` by default; nothing renders while closed (the
  `#empty` slot renders in place).
- **Backdrop click-self** requests close (`closeOnBackdrop={false}` to opt out).
- **One overlay stack per app.** Every open overlay — outlet-hosted or bespoke via
  `useModalBehavior` — registers on one shared stack. Nested overlays layer in open
  order; **Escape closes only the top**; when it closes, the one below becomes top.
- **Focus**: moved into the dialog on open (first focusable, else the dialog itself),
  Tab-cycled within it while open, **returned to the opener** on close.
- **Scroll**: body scroll locked while any overlay is open, restored when the last
  closes.
- **A11y**: `role="dialog"`, `aria-modal="true"`, `aria-label` from `title` resolved
  against the subject, `tabindex="-1"` on the panel.
- **Stable e2e hooks**: `data-modular-overlay-backdrop`, `data-modular-overlay-panel`,
  `data-overlay-id="<entry.id>"` — no configuration, no per-app drift.
- **Containment**: the window body renders inside `ModuleErrorBoundary` (label
  `"Overlay"`), so a throwing window cannot take down the shell.
- **Subject injection**: as a `subject` prop _and_ via `provide`/context
  (`useOverlaySubject`), keyed per `(entry.id, subjectKey)` so switching subjects
  remounts the window instead of leaking state across opens — the `subjectKey`
  contract from panels, pick-one edition.

## `useModalBehavior` — the behaviour without the shell

For a surface that needs a bespoke root (a full-bleed detail view, a hand-styled
transition wrapper) but must behave like a first-class overlay:

```ts
const { dialogRef, isTop } = useModalBehavior({
  active: () => ui.detailOpen, // React: a boolean
  onClose: () => ui.closeDetail(),
  // initialFocus?: element to focus on activation
});
// Put dialogRef on your root (give it tabindex="-1"); style it however you like.
```

Same stack, same focus/scroll/Escape rules as the outlet — a bespoke overlay and a
hosted window layer and close correctly against each other because they share the one
stack. (`<OverlayOutlet>` is implemented on exactly this composable/hook.)

## End-to-end: an app shell over the host

The intended division of labor, using the agent-run "result windows" shape as the
example:

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
