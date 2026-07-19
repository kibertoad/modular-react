# Overlay result windows — state-keyed overlay host (Vue Router)

A runnable demonstration of the **state-keyed overlay host** (`defineOverlayHost`
/ `resolveOverlay` / `useOverlay` / `<OverlayOutlet>` / `useOverlaySubject` /
`useModalBehavior`) on the **Vue** binding: a pick-**one**, app-state-keyed
**modal host** whose module-contributed _windows_ are selected by a
caller-supplied active id and mounted inside a framework-managed modal shell —
teleported, backdrop-closed, focus-trapped with focus return, scroll-locked,
stack-registered, a11y-wired. See the
[overlay host guide](../../../docs/overlay-host.md) for the full pattern.

The overlay primitive is **engine-first**: the pure resolver and the shared
overlay stack live in `@modular-frontend/core`, and the React and Vue hosts are
thin bindings over it. This example is the **exact mirror** of the
[React `overlay-result-windows`](../../react-router/overlay-result-windows)
example — same windows, same scenario, same e2e assertions — so you can read the
two side by side and see the one contract observed by both bindings.

The scenario is an **agent run**: pick a step, open a result window. Which window
is open is app state (`activeView`, a `ref`); the selected step is the **subject**
threaded to it. Windows are contributed by modules — including a **consumer**
module that adds its own window with no edit to the host.

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter "@example-vue-overlay-windows/shell" dev
```

Then open the printed URL, pick a step, and open the windows.

## Layout

```text
overlay-result-windows/
├── app-shared/                 StepRef subject + WindowMeta + the overlay-host handle
├── modules/
│   ├── run-core/               First-party: `test-report` (+ a nested useModalBehavior confirm) · `run-logs`
│   └── acme-extras/            Consumer: `acme:security-report` — added with no host edit
└── shell/                      Registry + router wiring + <OverlayOutlet> host + #wrap chrome + e2e
```

- **`app-shared`** owns the `StepRef` subject type and exports the shared
  `resultViews = defineOverlayHost<StepRef>("resultViews")` handle, imported by
  both the host and every contributor so the subject type is stated once.
- **`run-core`** and **`acme-extras`** each contribute `OverlayEntry` windows
  (Vue SFCs) through the ordinary `slots` path — the overlay host adds no new
  registration seam. No window carries any teleport / backdrop / Escape / focus
  code; the managed shell owns all of it. `acme-extras` is deliberately a
  **consumer**: it adds a window with a **namespaced id** the host never knew
  about. (These are the first Vue example modules to contribute `slots`.)
- **`shell`** holds `activeView` (the open window id) and the selected step in
  reactive state, mounts one `<OverlayOutlet>`, and supplies the per-window
  chrome (`#wrap`) and empty state. The shell never branches on window id.

## What it demonstrates

Each behaviour below is asserted in `shell/e2e/smoke.spec.ts` (mirroring the
React example's suite):

| Behaviour                     | What you see                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| **Pick-one, app-state-keyed** | The in-dialog switcher swaps windows without closing; exactly one dialog is ever mounted  |
| **Managed a11y**              | `role="dialog"`, `aria-modal`, `aria-label` from `title(subject)` — zero app effort       |
| **Focus trap + return**       | Focus moves into the dialog on open, follows a window swap, returns to the opener         |
| **Backdrop + Escape close**   | Both _request_ close; app state clears the id (the host never closes itself)              |
| **Press-and-release guard**   | A press that starts in the dialog and releases on the backdrop does **not** close         |
| **Subject injection**         | The window reads the step via a `subject` prop **and** via `useOverlaySubject`            |
| **Consumer contribution**     | `acme:security-report` opens with no host edit — same `slots` path every module uses      |
| **Shared stack**              | A nested `useModalBehavior` confirm layers on the same stack; Escape closes the top first |
| **Dangling id is data**       | An unregistered id renders nothing and dev-warns — it never crashes the app               |

## Test

```bash
pnpm --filter "@example-vue-overlay-windows/shell" test:e2e
```
