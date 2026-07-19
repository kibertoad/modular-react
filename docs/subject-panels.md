# Subject-keyed panels (`usePanels` / `<PanelsOutlet>`)

This guide covers **panels**: a named region whose contributions are selected at
render time by a runtime **subject** (a piece of application state — the
currently selected item), filtered by per-contribution predicates, ordered, and
rendered **all-matching**. Any module — first-party or a consumer's — can
contribute a panel, through the module `slots` path you already use.

The canonical shape is an **inspector rail**: the user selects something (a board
block, a table row, a graph node) and a column of detail panels appears, each
panel deciding for itself whether it applies to the current selection.

> **Prerequisite:** you understand the module descriptor and slots from
> [Shell Patterns (Fundamentals)](shell-patterns.md). Panels add **no** new
> registration path — contributions are ordinary slot entries. The only new
> pieces are a typed entry shape, a pure resolver, and a thin per-binding host.

## When to use panels

Reach for panels when **all** of these hold:

1. **A region shows detail for a current selection.** The contributions depend on
   a runtime value (the "subject"), not on the route or on a composition's
   internal state.
2. **Render-all, not pick-one.** Several panels can apply to one subject at once
   and you want them all, ordered — not a single winner.
3. **Open contribution.** A consumer deployment shipping a custom item type
   should be able to add a panel for it **without editing the host**. This is the
   load-bearing reason panels are a library primitive rather than a local
   `v-if` / `switch` map: a local map cannot be extended from outside.
4. **Arbitrary predicates.** Visibility is a conjunction over the subject's shape
   and live state (`level === "frame" && type === "frontend" && !run.failed`),
   not a fixed `kind → component` lookup.

If instead you need to select **one** component by a data id (a wire manifest
naming which view to render), that is the pick-one pairing surface, not panels —
see [Panels vs component pairing](#panels-vs-component-pairing).

For the full "which primitive?" matrix (route/module zones · panels ·
compositions · journeys), see
[Comparison with sibling primitives](../packages/compositions/README.md#comparison-with-sibling-primitives).

### Why this is not a "zone"

The word _zone_ already names two unrelated, **pick-one** primitives in this
library — route/module zones (`useZones`, keyed on the active route) and
composition zones (`defineComposition({ zones })`, keyed on composition state,
closed to outside contribution). Panels differ from both on every axis:
render-all, subject-keyed, open. Overloading "zone" a third time would put
`useZones` and a subject-driven `useZone` one letter apart with disjoint
meanings. So the render-all primitive gets its own vocabulary: **panels**.

## The pieces

The primitive is split the same way the [component-pairing](../packages/compositions/README.md) helpers are: a **pure engine function** plus a **thin host per binding**.

| Layer                                     | Export                                   | Package                                            |
| ----------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| Typed entry shape                         | `PanelEntry<TSubject>`                   | `@modular-frontend/core` (re-exported by bindings) |
| Group handle                              | `definePanelGroup<TSubject>(slotKey)`    | `@modular-frontend/core`                           |
| Pure resolver                             | `resolvePanels(entries, subject, opts?)` | `@modular-frontend/core`                           |
| Host hook/composable                      | `usePanels(group, subject)`              | `@modular-react/react` · `@modular-vue/vue`        |
| Host outlet                               | `<PanelsOutlet>`                         | `@modular-react/react` · `@modular-vue/vue`        |
| Read the injected subject in panel bodies | `usePanelSubject<TSubject>()`            | `@modular-react/react` · `@modular-vue/vue`        |

React consumers import everything from `@modular-react/react` (the engine parts
flow through `@modular-react/core`). Vue consumers import from `@modular-vue/vue`
or the `@modular-vue/core` facade.

## The entry shape

A panel is contributed as a `PanelEntry<TSubject>` in a module's `slots`, under
the group's slot key. Slot entries are opaque by design
(`SlotMap = Record<string, readonly unknown[]>`), so putting typed panel objects
in a slot is exactly what slots are for — not a workaround.

```ts
export interface PanelEntry<TSubject> {
  readonly id: string; // stable identity; duplicates are a registration bug
  readonly component: UiComponent; // carried opaquely — never inspected by the engine
  readonly when?: (subject: TSubject) => boolean; // absent = always visible
  readonly order?: number; // ascending; absent = 0; ties keep contribution order
  readonly props?: Record<string, unknown>; // merged with the injected { subject }
}
```

## The resolver

`resolvePanels` is pure over its inputs, so a React `useMemo` or a Vue `computed`
re-runs it on change with no framework glue. Semantics, in order:

1. **Null subject → empty.** A `null` / `undefined` subject (nothing selected)
   resolves to no panels; no predicate runs.
2. **Duplicate ids throw** by default — two modules contributing the same panel
   id to one group is a bug, the same stance as `resolveComponentRegistry` and
   duplicate-module-id validation. Pass `onDuplicate: "first-wins"` /
   `"last-wins"` when a deployment intentionally shadows a first-party id.
3. **Filter by predicate.** Panels without `when` always pass; those with one
   pass iff it returns `true` for the (non-null) subject.
4. **Stable-sort by `order`** (ascending, absent = `0`); ties keep contribution
   order. The input array is never mutated.

```ts
import { resolvePanels } from "@modular-frontend/core";

const visible = resolvePanels(slots.inspectorPanels, selectedBlock);
// → the ordered PanelEntry[] whose when(selectedBlock) matched
```

Because it is a plain named export, cat-factory-style unit tests exercise the
predicate/order table by calling `resolvePanels` directly — no DOM, no host, no
`/testing` subpath.

## Declaring a group

`definePanelGroup` pins the subject type to a slot key. Export the handle once
and import it at both the host and every contributor, so the subject type is
stated in exactly one place.

```ts
// inspector/panels.ts
import { definePanelGroup } from "@modular-react/react"; // or "@modular-vue/core"
import type { BoardBlock } from "./types";

export const inspectorPanels = definePanelGroup<BoardBlock>("inspectorPanels");
```

## Contributing a panel (any module, including a consumer's)

No descriptor change — a panel is a normal slot entry:

```ts
import { defineModule } from "@modular-react/react";
import { FrontendConfig } from "./FrontendConfig";

export default defineModule({
  id: "inspector-frames",
  slots: {
    inspectorPanels: [
      {
        id: "frontend-config",
        component: FrontendConfig,
        order: 20,
        when: (b) => b.level === "frame" && b.type === "frontend",
      },
    ],
  },
});
```

A **consumer** deployment adds a panel for a block type the host never knew about
by registering its own module with a namespaced id — no host edit:

```ts
defineModule({
  id: "acme-inspector-extras",
  slots: {
    inspectorPanels: [
      {
        id: "acme:security-report",
        component: SecurityReport,
        when: (b) => b.type === "acme-secure",
      },
    ],
  },
});
```

## The host — React

```tsx
import { PanelsOutlet } from "@modular-react/react";
import { inspectorPanels } from "./inspector/panels";

function Inspector({ selected }: { selected: BoardBlock | null }) {
  return (
    <aside className="inspector">
      <PanelsOutlet
        group={inspectorPanels}
        subject={selected}
        subjectKey={(b) => b.id}
        empty={<p>Select a block to inspect it.</p>}
        wrap={({ entry, children }) => (
          <section className="panel" data-panel={entry.id}>
            {children}
          </section>
        )}
      />
    </aside>
  );
}
```

Each panel component receives the subject as a `subject` prop **and** via context:

```tsx
import { usePanelSubject } from "@modular-react/react";

function FrontendConfig({ subject }: { subject: BoardBlock }) {
  // Either the prop above, or — for nested content — the context reader:
  const block = usePanelSubject<BoardBlock>();
  return <dl>{/* … */}</dl>;
}
```

`usePanels(group, subject)` is available too when you want the resolved
`PanelEntry[]` without the outlet's rendering (e.g. to show a count badge).

## The host — Vue

```vue
<script setup lang="ts">
import { PanelsOutlet } from "@modular-vue/vue";
import { inspectorPanels } from "./inspector/panels";
import { storeToRefs } from "pinia";
import { useBoardStore } from "./board";

const { selectedBlock } = storeToRefs(useBoardStore());
</script>

<template>
  <aside class="inspector">
    <PanelsOutlet :group="inspectorPanels" :subject="selectedBlock" :subject-key="(b) => b.id">
      <template #empty>Select a block to inspect it.</template>
      <template #wrap="{ entry, children }">
        <section class="panel" :data-panel="entry.id"><component :is="children" /></section>
      </template>
    </PanelsOutlet>
  </aside>
</template>
```

`usePanels(group, subject)` takes a `MaybeRefOrGetter` subject and returns a
`computed`; `usePanelSubject<TSubject>()` returns a reactive `computed` of the
current subject for use inside panel components.

### Reactivity caveat (Vue) — read this

The panels re-resolve when the **subject** changes, but only if the subject is
**Vue-reactive state** — a `ref` / `reactive` / Pinia value, or a `computed`
derived from one. A `when` predicate that reads a **non-reactive snapshot**
tracks nothing and will not re-run when that snapshot mutates (the "run just
flipped to failed" case). This is the same source-boundary rule
[`useReactiveSlots`](reactive-slots-vue.md) documents. In practice the subject
already qualifies: an app's `selectedBlock` is typically a Pinia `computed`
(`ui.selectedBlockId → board.getBlock`), which _is_ reactive, so mutable
run-state predicates track correctly. Pass the subject as a ref/getter over
reactive state and you get subject-reactive panels for free.

React has no ambient reactivity to worry about here: `usePanels` re-runs on
render like any hook, keyed by its `subject` argument.

## `subjectKey` — remounting on selection change

By default a panel's rendered instance is keyed on `entry.id` alone, so moving
between two subjects of the same type reuses the component instance (state and
DOM persist). Pass `subjectKey` — a string, or `(subject) => string | number` —
to fold the subject's identity into the key, forcing a remount when the selection
changes. Use it whenever a panel holds per-subject local state (a scroll
position, an expanded/collapsed toggle, an in-progress edit) that must not leak
across selections.

## Sections, deliberately dropped

An early design carried a `section` option ("body" / "banners" / "actions"). It
is omitted: one group with three sections is isomorphic to **three group ids**
(`inspector.body`, `inspector.banners`, `inspector.actions`), which are already
typed, already bucketed by the slot map, and need no new concept or ordering
rules. If a real interleaving need appears later, `section` can be added
compatibly; starting without it is the smaller contract.

## Panels vs component pairing

Both are **read-side projections of an already-resolved slot** — pure functions
that register nothing. They differ in the reduction:

|             | Component pairing (`resolveComponentRegistry` / `pairById`)        | Panels (`resolvePanels`)                                     |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Reduction   | **pick-one** by string id                                          | **render-all** by predicate                                  |
| Keyed on    | a data id (often wire-delivered)                                   | a runtime subject + per-entry `when(subject)`                |
| Result      | the one component registered under that id (or a `missing` bucket) | every matching entry, ordered                                |
| Typical use | a manifest row names which detail view to render                   | an inspector shows every panel that applies to the selection |

If your manifest names _one_ view per row, pair by id
([Pairing wire-safe manifests with code-shipped components](remote-capability-manifests.md#pairing-wire-safe-manifests-with-code-shipped-components)).
If a region shows _all_ panels that apply to a selection, use panels. They
compose: a paired detail view can itself host a `<PanelsOutlet>`.

## Testing

- **Engine** — call `resolvePanels(entries, subject)` directly and assert the
  ordered, filtered ids. No DOM. Duplicate-id and `onDuplicate` behavior is a
  pure-function test.
- **Host** — mount `<PanelsOutlet>` with a slots context providing the group's
  entries; assert which panels render, that the subject reaches them, that
  `#empty` shows for a null / no-match subject, and that a throwing panel is
  contained by its per-panel `ModuleErrorBoundary`.
