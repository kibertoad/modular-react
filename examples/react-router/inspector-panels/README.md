# Inspector panels — subject-keyed panels (React Router)

A runnable demonstration of **subject-keyed panels** (`definePanelGroup` /
`resolvePanels` / `usePanels` / `<PanelsOutlet>`): a named region whose
module-contributed panels are selected at render time by a runtime **subject**,
gated by per-panel `when(subject)` predicates, ordered, and rendered
**all-matching**. See the [Subject-keyed panels guide](../../../docs/subject-panels.md)
for the full pattern.

The scenario is an **inspector rail**: a design board of blocks; selecting one
opens a column of detail panels, each panel deciding for itself whether it
applies to the selection.

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter "@example-rr-inspector-panels/shell" dev
```

Then open the printed URL and click the blocks in the left column.

## Layout

```text
inspector-panels/
├── app-shared/                 BoardBlock subject type, sample board, the panel-group handle
├── modules/
│   ├── inspector-core/         First-party: `identity` (always) + `frontend-config` (frame-frontend)
│   └── acme-extras/            Consumer: `acme:security-report` (acme-secure) — added with no host edit
└── shell/                      Registry wiring + the board host + <PanelsOutlet> rail + e2e
```

- **`app-shared`** owns the `BoardBlock` subject type and exports the shared
  `inspectorPanels = definePanelGroup<BoardBlock>("inspectorPanels")` handle,
  imported by both the host and every contributor so the subject type is stated
  once.
- **`inspector-core`** and **`acme-extras`** each contribute `PanelEntry`
  objects through the ordinary `slots` path — panels add no new registration
  seam. `acme-extras` is deliberately a **consumer** module: it adds a panel for
  a block type (`acme-secure`) the host never knew about, with a **namespaced
  id** so it can't collide with a first-party one.
- **`shell`** holds the selected block in local state, hands it to
  `<PanelsOutlet group={inspectorPanels} subject={selected}>`, and provides the
  per-panel chrome (`wrap`) and the empty state (`empty`). The shell never
  branches on block type.

## What renders

The panels resolve by predicate, then order (`identity` 0 · `acme:security-report`
10 · `frontend-config` 20). This matches the walkthrough table in the guide
row-for-row, and the e2e (`shell/e2e/smoke.spec.ts`) asserts exactly it:

| Selected block                   | Panels rendered, in order          | Why                                                   |
| -------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| _nothing_                        | _none_ → empty state               | Null subject short-circuits before any predicate runs |
| `Auth service` (leaf · backend)  | `identity`                         | `identity` has no `when`; the others don't match      |
| `Login frame` (frame · frontend) | `identity`, `frontend-config`      | `frontend-config`'s `when` matches; order 0 then 20   |
| `Secrets vault` (frame · acme)   | `identity`, `acme:security-report` | The **consumer** panel matches; order 0 then 10       |

The last row is the point: the host module knows nothing about `acme-secure`,
yet the consumer panel appears — correctly ordered — because contribution flows
through the same `module.slots` path every module already uses.

## Test

```bash
pnpm --filter "@example-rr-inspector-panels/shell" test:e2e
```
