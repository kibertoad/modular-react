# @modular-react/compositions

Arrange several modules (and journeys) into named **zones** on a single screen, driven by a per-instance scoped store. Zones are pure projections of state — a selector inspects the composition's state and returns "render module X's entry Y here", "mount journey Z here", or "nothing".

Use this package when one screen orchestrates several modules with **shared coordination state**, but no inherent transition graph — e.g. an editor with a main canvas, a left integrations panel, and a right inspector that all need to agree on `documentId` / `selectedItem` / `activeIntegration` but each is otherwise free-standing.

If you instead need a stepped flow ("complete A → branch into B or C → finalize"), reach for [`@modular-react/journeys`](../journeys/README.md). Journeys and compositions interoperate: a zone can host a journey, and a journey step can host a composition (via plain `<CompositionOutlet>`).

## Prerequisite reading

- [Shell Patterns (Fundamentals)](../../docs/shell-patterns.md)
- [Sibling modules sharing a screen](../../docs/sibling-modules-shared-screen.md) — the simpler "plain React + per-module config" pattern. If that's enough, you don't need compositions.

## Contents

- [Installation](#installation)
- [Mental model](#mental-model) — three roles, what the composition owns vs the host vs the panels
- [Quickstart](#quickstart) — the 5-step path from zero to a running composition
- [Core concepts](#core-concepts) — zones, selectors, instance statuses, lifecycle, disposal
- [Authoring patterns](#authoring-patterns) — selector idioms, dispatch from panels, cross-zone hand-offs
- [Composing journeys inside zones](#composing-journeys-inside-zones) — when a zone needs a stepped flow
- [Runtime surface](#runtime-surface) — `CompositionRuntime`
- [Composition handles](#composition-handles) — typed tokens for `runtime.start(handle, input)`
- [`CompositionsProvider` + context](#compositionsprovider--context)
- [Rendering — `CompositionOutlet`](#rendering--compositionoutlet) — props, render-prop, error policies, preload
- [Host hook — `useComposition`](#host-hook--usecomposition) — mint an instance for the route / tab / modal that mounts the outlet
- [Hooks for foreign panels](#hooks-for-foreign-panels) — `useCompositionState` / `Dispatch` / `Emit` / `Zone`, typed-bundle factory
- [Validation](#validation) — definition-time + resolve-time checks
- [Hydration](#hydration) — attaching an SSR or debug-dump blob
- [Cycle safety](#cycle-safety) — composition ↔ journey nesting
- [Errors, races, and edge cases](#errors-races-and-edge-cases)
- [Limitations](#limitations)
- [Comparison with journeys](#comparison-with-journeys)

## Installation

```bash
pnpm add @modular-react/compositions
```

Peer deps: `@modular-react/core`, `@modular-react/react`, `react`, `react-dom`.

`@modular-react/journeys` is **not** a peer dependency. Compositions stays journeys-agnostic at the package level — `kind: "journey"` zone resolutions are wired through a generic [`RuntimeMountAdapter`](#runtime-mount-adapters) the consumer registers explicitly. If your app uses journey-in-zone, install `@modular-react/journeys` and call `registerMountAdapter("journey", createJourneyMountAdapter(...))` once at startup. See [Composing journeys inside zones](#composing-journeys-inside-zones).

## Mental model

Three roles, strictly separated:

1. **Modules** declare what they render (`entryPoints`) and what they emit (`exitPoints`). They know **nothing** about the composition that hosts them — a panel rendered as part of an "editor" composition is the same module that might be rendered standalone on a different route.
2. **The composition** owns a scoped store (`TState`), declares one **zone** per layout slot, and provides a pure **selector** per zone that maps state to "what should render here right now".
3. **The host** (a route Component, a tab, a modal, anywhere) calls `runtime.start(handle, input)` to get an `instanceId`, then renders `<CompositionOutlet instanceId={id}>` with a layout render-prop that arranges the zones however it wants.

The composition's store is the **orchestration bus**. Panels exchange data with it via either:

- **Typed store contracts** — the selector projects state into `ReadableStore<T>` / `WritableStore<T>` (from `@modular-react/core`) and hands them to the panel via `input`. The panel imports only the structural store interface — recommended when panels and the composition are owned by different teams.
- **Composition hooks** — `useCompositionState` / `useCompositionDispatch` read and write directly. Recommended when the same team owns both.

Both patterns subscribe at slice level (via `useSyncExternalStore` under the hood) — they differ in coupling, not performance. See [Hooks vs stores — which to use](#hooks-vs-stores--which-to-use).

```text
┌──────────────────── Host (route / tab / modal) ─────────────────┐
│                                                                  │
│   ┌───────── <CompositionOutlet instanceId={ci_…}> ──────────┐   │
│   │                                                          │   │
│   │   children: (zones) => layout JSX                        │   │
│   │      ↑ {                                                 │   │
│   │      │   editorMain:        ⟶ render <EditorMain>        │   │
│   │      │   integrationSource: ⟶ render <ContentfulPanel>   │   │
│   │      │   inspector:         ⟶ render fallback (empty)    │   │
│   │      │ }                                                 │   │
│   │      │                                                   │   │
│   │      └── computed by per-zone selectors over scoped store│   │
│   │                                                          │   │
│   └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Quickstart

### 1. Declare panel modules normally

Modules are the same `defineModule` you already use. Compositions don't change anything about how a module is authored — its entries and exits are framework-agnostic.

```typescript
// packages/editor/src/index.ts
import { defineModule, defineEntry, defineExit, schema } from "@modular-react/core";
import { EditorMain } from "./EditorMain.js";

export const editorModule = defineModule({
  id: "editor",
  version: "1.0.0",
  exitPoints: { saved: defineExit() },
  entryPoints: {
    main: defineEntry({
      component: EditorMain,
      input: schema<{ documentId: string }>(),
    }),
  },
});
```

### 2. Define the composition's state and zones

`defineComposition` is a two-call helper. The first call pins `TModules` + `TState`; the second takes the definition with `const`-narrowed zone names.

```typescript
// packages/editor-composition/src/index.ts
import { defineComposition, defineCompositionHandle } from "@modular-react/compositions";
import type { editorModule } from "@myorg/editor";
import type { contentfulModule } from "@myorg/contentful";
import type { strapiModule } from "@myorg/strapi";

type EditorModules = {
  readonly editor: typeof editorModule;
  readonly contentful: typeof contentfulModule;
  readonly strapi: typeof strapiModule;
};

export interface EditorState {
  readonly documentId: string;
  readonly activeIntegrationId: "contentful" | "strapi" | null;
  readonly selectedSourceItem: string | null;
}

export const editorComposition = defineComposition<EditorModules, EditorState>()({
  id: "editor",
  version: "1.0.0",
  initialState: (input: { documentId: string }) => ({
    documentId: input.documentId,
    activeIntegrationId: null,
    selectedSourceItem: null,
  }),
  zones: {
    editorMain: {
      select: ({ state }) => ({
        kind: "module-entry",
        module: "editor",
        entry: "main",
        input: { documentId: state.documentId },
      }),
    },
    integrationSource: {
      select: ({ state }) =>
        state.activeIntegrationId
          ? {
              kind: "module-entry",
              module: state.activeIntegrationId,
              entry: "sourcePanel",
              input: { documentId: state.documentId },
            }
          : { kind: "empty" },
      fallback: () => <p>Pick an integration to load assets.</p>,
    },
  },
});

// Optional typed handle — gives `runtime.start(editorHandle, input)` full type-check on input.
export const editorHandle = defineCompositionHandle<"editor", { documentId: string }>({
  id: "editor",
});
```

### 3. Register the composition in the shell

```typescript
// shell/src/registry.ts
import { createRegistry } from "@modular-react/core";
import { compositionsPlugin } from "@modular-react/compositions";
import { editorComposition } from "@myorg/editor-composition";
import { editorModule } from "@myorg/editor";
import { contentfulModule } from "@myorg/contentful";
import { strapiModule } from "@myorg/strapi";

export const registry = createRegistry({ plugins: [compositionsPlugin()] })
  .registerModule(editorModule)
  .registerModule(contentfulModule)
  .registerModule(strapiModule)
  .registerComposition(editorComposition);

export const manifest = registry.resolve();
```

`compositionsPlugin()` contributes `registerComposition(...)` onto the registry. The plugin validates structural mistakes immediately and cross-references contracts + `moduleCompat` at `resolve()` time. The runtime is exposed as `manifest.extensions.compositions`.

### 4. Mount the composition in a route / tab / modal

```typescript
// shell/src/routes/editor.tsx
import {
  CompositionOutlet,
  CompositionsProvider,
  useComposition,
} from "@modular-react/compositions";
import { editorHandle, type EditorState } from "@myorg/editor-composition";
import { manifest } from "../registry.js";

export function EditorRoute({ documentId }: { documentId: string }) {
  // `useComposition` mints the instance exactly once for the lifetime of
  // this route component and returns its id. Disposal is automatic — when
  // this component unmounts, `<CompositionOutlet>` releases its refcount
  // and the runtime ends the instance after a microtask. **Do not** wrap
  // `runtime.start()` in `useEffect` or `useMemo` yourself; `useEffect`
  // is the "you might not need an effect" anti-pattern (it round-trips
  // through setState before commit), and `useMemo` is documented as a
  // pure optimization hint that React may re-invoke at will — a fresh
  // start() call on every re-run would orphan the previous instance.
  const instanceId = useComposition(editorHandle, { documentId });

  return (
    <CompositionsProvider runtime={manifest.extensions.compositions}>
      <CompositionOutlet<"editorMain" | "integrationSource">
        compositionId="editor"
        instanceId={instanceId}
      >
        {(zones) => (
          <div className="editor-shell">
            <main className="editor-canvas">{zones.editorMain}</main>
            <aside className="editor-aside">{zones.integrationSource}</aside>
          </div>
        )}
      </CompositionOutlet>
    </CompositionsProvider>
  );
}
```

The render-prop receives one `ReactNode` per zone, fully wrapped (`Suspense` + per-zone error boundary already applied). The host owns layout; the framework owns content.

> `useComposition` reads its runtime from the surrounding `<CompositionsProvider>` — wired automatically when you use `compositionsPlugin()`. If you're mounting the outlet without the plugin, pass `useComposition(handle, input, useCompositionOptions({ runtime }))` to bypass the context lookup.

### 5. Drive the composition from inside a panel

Two supported patterns — pick by team ownership:

**Recommended for cross-team scenarios — typed store contracts.** The composition's selector projects state into `ReadableStore<T>` / `WritableStore<T>` (from `@modular-react/core`) and hands them to panels via `input`. The panel imports only the structural store interface — _nothing_ composition-specific — and reads via `useSyncExternalStore`:

```typescript
// editor-composition/src/composition.ts — selector projects state into a store
zones: {
  source: {
    select: ({ state, stores }) => ({
      kind: "module-entry",
      module: state.activeSource,
      entry: "sourcePanel",
      input: {
        documentId: state.documentId,
        // Stable per (instance, "selectedItem") — same reference across
        // selector re-runs, so useSyncExternalStore doesn't re-subscribe.
        selectedItem: stores.writable("selectedItem", {
          get: (s) => s.selectedSourceItem,
          set: (value) => ({ selectedSourceItem: value }),
        }),
      },
    }),
  },
},
```

```typescript
// contentful/src/SourcePanel.tsx — module imports zero composition types
import { useSyncExternalStore } from "react";
import type { ModuleEntryProps, WritableStore } from "@modular-react/core";

interface SourcePanelInput {
  readonly documentId: string;
  readonly selectedItem: WritableStore<string | null>;
}

export function ContentfulSourcePanel({ input }: ModuleEntryProps<SourcePanelInput>) {
  const selected = useSyncExternalStore(
    input.selectedItem.subscribe,
    input.selectedItem.getSnapshot,
  );
  return (
    <ul>
      {items.map((it) => (
        <li
          key={it.id}
          aria-current={selected === it.id || undefined}
          onClick={() => input.selectedItem.set(it.id)}
        >
          {it.title}
        </li>
      ))}
    </ul>
  );
}
```

The panel team and composition team share only the structural `WritableStore<string | null>` contract. The composition's `TState` shape can change without touching the panel; a different host can supply a different `WritableStore<string | null>` (test mock, shell-level Zustand store, etc.).

See [Pattern — typed store projections](#pattern--typed-store-projections-composition-unaware-panels) for the full design.

**Alternative for same-team scenarios — composition hooks.** When one team owns both the composition and the panels, calling `useCompositionState` / `useCompositionDispatch` directly is slightly less ceremony — the panel imports the composition's `TState` and subscribes to slices through the hook:

```typescript
import { useCompositionState, useCompositionDispatch } from "@modular-react/compositions";
import type { EditorState } from "@myorg/editor-composition";

export function ContentfulSourcePanel({ input }: ModuleEntryProps<{ documentId: string }>) {
  const selected = useCompositionState<EditorState, string | null>(
    (s) => s.selectedSourceItem,
  );
  const dispatch = useCompositionDispatch<EditorState>();
  return (/* same UI as above, calling dispatch({ selectedSourceItem: it.id }) */);
}
```

See [Hooks for foreign panels](#hooks-for-foreign-panels) for the typed-hooks factory.

> **Which pattern do I pick?** See [Hooks vs stores — which to use](#hooks-vs-stores--which-to-use).

## Core concepts

### Composition zones vs `module.zones`

The framework has two distinct primitives that both use the word "zone." They are unrelated.

|                 | `module.zones` (existing)                                                                  | composition zones (this package)                                                              |
| --------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Declared by     | `defineModule({ zones: { ... } })` and the router's route `staticData`                     | `defineComposition({ zones: { ... } })`                                                       |
| Populated by    | The _active route's_ module — at most one component per zone                               | The composition's per-zone `select(ctx)`, which can target any registered module              |
| Cardinality     | One contribution per zone at a time (most-recent active wins)                              | Many panels mounted in parallel, one per declared zone                                        |
| Layout owner    | The shell — `useZones` / `useActiveZones` read the merged map                              | The host — `<CompositionOutlet>`'s render-prop arranges zones however it wants                |
| Authoring shape | String → React component                                                                   | String → `select(ctx) → CompositionZoneResolution`                                            |
| Use when        | A module needs to contribute a header chip, command, or one-shot slot to the active screen | Several modules need to render side-by-side on a single screen with shared coordination state |

A composition does **not** participate in `module.zones`. The shell's `useZones`/`useActiveZones` will not see anything from a `<CompositionOutlet>`. The two systems are orthogonal — a screen can use both at once (e.g., a route uses `module.zones` for the header chip + a `<CompositionOutlet>` for the multi-panel body).

Inside a composition zone, **the composition definition owns the zone name and the selector** (what renders here, driven by state); **the host owns the layout** (where the zone appears on screen). The framework wraps each zone in `<Suspense>` + a per-zone error boundary before handing the `ReactNode` to the host's render-prop.

### Zones

A zone is a named projection of state into one of three resolutions, declared per-render by the zone's `select(ctx)`:

```typescript
type CompositionZoneResolution =
  | { kind: "module-entry"; module: string; entry: string; input?: unknown }
  | { kind: "journey"; handle: JourneyHandleRef; input?: unknown; instanceId?: string }
  | { kind: "empty" };
```

- **`module-entry`** — render the named module's entry. The runtime looks the entry up in the module map and calls it with `input` as `ModuleEntryProps.input`.
- **`journey`** — mount a `<JourneyOutlet>` for the referenced journey handle. The composition outlet caches the minted journey instance id per `(handle.id, structural hash of input)` so a state change that produces the same resolution does not re-mint.
- **`empty`** — render the zone's `fallback` (a React component) or `null`.

`TModules` constrains the `module` field to ids the composition's typed module map declares, so a typo is a compile error.

### Mount kinds — opting an entry out of compositions

Some module entries belong to one host surface only. A panel typed for a journey step receives `exit`, `goBack`, and `goForward` — calling those inside a composition zone is a silent drop, because the composition has no exit channel (panels dispatch via `useCompositionDispatch` / `useCompositionEmit` instead). To surface that mismatch at the right moment, an entry can declare which hosts may mount it:

```typescript
defineEntry({
  component: CheckoutStep,
  input: schema<{ amount: number }>(),
  mountKinds: ["journey"], // journey only — composition selectors reject this entry
});

defineEntry({
  component: EditorPanel,
  input: schema<{ documentId: string }>(),
  mountKinds: ["composition"], // composition only — journey transitions reject this entry
});

defineEntry({
  component: SharedHeader,
  input: schema<void>(),
  mountKinds: ["journey", "composition"], // both — explicit form of the default
});

defineEntry({
  component: AgnosticPanel,
  input: schema<void>(),
  // mountKinds omitted → defaults to every surface; works as before.
});
```

The framework enforces this in three places:

1. **Compile time** — a composition selector that returns a `module-entry` resolution targeting a journey-only entry is a type error at the selector call site. The diagnostic enumerates the entries that ARE composition-mountable on that module, so the author can pick a different one. Symmetric on the journey side: a `StepSpec` returning a composition-only entry is a type error in the transition handler.
2. **Render time** — if a resolution somehow bypasses the type filter (a dynamic id, an `as never` cast, an `any`-typed module map), the composition outlet renders a clear error fallback naming the entry, its declared `mountKinds`, and why the mismatch was rejected.
3. **Dev warn** — independently, the `exit` prop wired into a composition-mounted panel is a no-op stub that logs once per exit name in dev. So even if `mountKinds` is omitted on a journey-shaped panel reused in a composition, a panel that calls `exit(...)` still surfaces the silent drop loudly enough to investigate.

Backward compatibility: omitting `mountKinds` (the v0.1.0 behavior) is treated as "every surface" — every existing module continues to work in both journeys and compositions without changes. The opt-in is a tightening, not a default shift.

The annotation captures _intent_, not _capability_: a module can declare `mountKinds: ["journey", "composition"]` while its component still imports `useJourneyExit` and crashes outside a journey. The dev-warn covers that case; the structural-purity solution (a discriminated `ModuleEntryProps` per mount) is a heavier refactor that the framework intentionally has not taken so panel reuse stays cheap.

### Selectors are pure

Selectors run on every state change. They must be pure functions of `(state, deps)` — no I/O, no `setState`, no time-based behavior. The runtime reads the resolution and decides whether to remount the panel (when `module`/`entry` change), keep the existing panel and update `input` (when only `input` changes), or skip rendering (when the resolution is structurally identical to the previous one).

`deps` is the shared-dependency snapshot the plugin captures at registry resolve time. It is opaque to the runtime — use it for things like a logger, a feature-flag client, or any service the composition author wants in scope.

### Instance lifecycle and statuses

Two statuses:

| status     | meaning                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `active`   | the instance is live; `dispatch`, `subscribe`, and outlet rendering all work normally                          |
| `disposed` | the instance is torn down; subscribers receive one last `"disposed"` snapshot and `getInstance` returns `null` |

Disposal happens automatically when:

- the last `<CompositionOutlet>` for the instance unmounts AND no other `runtime.subscribe()` listeners are attached;
- the disposal microtask fires (so React 18/19 StrictMode mount/unmount/mount cycles do not tear an instance down on first visit).

Explicit `runtime.end(id, { reason })` short-circuits the auto-disposal and is the right path for programmatic teardown (e.g. a Cmd-K palette killing a stale instance).

### Lifecycle hooks fire order

For every instance, the runtime guarantees this sequence:

```text
start(handle, input)
  ├── initialState(input) → state
  ├── lifecycle.onMount(state, deps)
  └── options.onMount({ compositionId, instanceId, state })

... live mutations via dispatch ...

end(id) | last outlet detaches
  ├── status → "disposed"
  ├── lifecycle.onUnmount(state, deps)
  ├── options.onUnmount({ compositionId, instanceId, state })
  └── definition.onDispose({ compositionId, instanceId, state, reason })
```

`onError` is fired observation-only on throws from selectors, panel renders, lifecycle hooks, and `onZoneEvent` callbacks.

### Idempotency: `start()` semantics

Every `start()` call mints a fresh instance — the runtime does not dedupe by input. Host components should call [`useComposition(handle, input)`](#host-hook--usecomposition) so the id is minted **once per mount** and disposed via the outlet's refcount when the host unmounts. Do not wrap `runtime.start(...)` in `useMemo` (it's not guaranteed to run only once — React may discard or re-evaluate memos during concurrent rendering), and do not call it from `useEffect` (that introduces a render-then-mint lag the outlet can't paper over). For SSR-style hand-off or persistence-driven resume, mint the instance outside React and hand the id to the outlet.

## Authoring patterns

### Hooks vs stores — which to use

Both patterns subscribe at slice level (via `useSyncExternalStore` under the hood) and have equivalent re-render behavior — the choice is **ownership**, not performance.

|                                      | **Stores** (typed `ReadableStore` / `WritableStore` via `input`)         | **Hooks** (`useCompositionState` / `useCompositionDispatch`)            |
| ------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Panel imports                        | `@modular-react/core` only (for `ReadableStore<T>` / `WritableStore<T>`) | `@modular-react/compositions` + the composition's `TState` type         |
| Panel workspace deps                 | Zero on the composition package                                          | Yes — module depends on the composition package for `TState`            |
| Coupling between panel & composition | Structural — `WritableStore<T>` interface only                           | Nominal — the composition's `TState` shape                              |
| Reuse in other hosts                 | Easy — any `WritableStore<T>` works (test mock, shell-level store, …)    | Panel only renders inside _this_ composition                            |
| Composition's selector               | Calls `stores.writable("key", { get, set })`                             | Selector returns plain `input`; panel reads from context                |
| Ceremony at the panel                | Two lines of `useSyncExternalStore` per slice                            | One line of `useCompositionState(s => ...)` per slice                   |
| Best for                             | Panels owned by a different team than the composition; reusable panels   | Panels and composition owned by the same team; one-off internal screens |

**Default to stores** when modules and compositions are owned by different teams, or when you want a panel to be reusable outside this composition. **Reach for hooks** when the same team owns both and you want minimum ceremony — they're a fully-supported alternative, not a deprecated path.

The two patterns can coexist in one composition (e.g., the editor panel uses hooks because it's owned by the composition team; integration panels use stores because they're owned by integration teams).

### Pattern — typed store projections (composition-unaware panels)

For strict separation between the **composition team** (owns coordination state) and the **panel teams** (own panel modules), project composition state into typed store contracts that panels consume via their `input`. Panels then depend only on the structural store interface — not on the composition's `TState` shape — so they import nothing composition-specific.

The framework gives selectors a `stores` factory bound to the active instance. `stores.readable(key, get)` and `stores.writable(key, { get, set })` return objects stable per `(instance, key)`. They wrap the composition's per-instance store with **slice-level change detection** — subscribers fire only when the projected slice value actually differs (`Object.is`).

The store types live in `@modular-react/core` as `ReadableStore<T>` / `WritableStore<T>`. They match `useSyncExternalStore`'s contract (`getSnapshot` + `subscribe`); a `WritableStore<T>` adds `set(value)`.

**Composition side** — selector projects state into stores:

```typescript
import { defineComposition } from "@modular-react/compositions";
import type editorModule from "@myorg/editor";
import type contentfulModule from "@myorg/contentful";
import type strapiModule from "@myorg/strapi";

type Modules = {
  readonly editor: typeof editorModule;
  readonly contentful: typeof contentfulModule;
  readonly strapi: typeof strapiModule;
};

interface EditorState {
  readonly documentId: string;
  readonly activeSource: "contentful" | "strapi" | null;
  readonly selectedItem: string | null;
}

export const editorComposition = defineComposition<Modules, EditorState>()({
  id: "editor",
  version: "1.0.0",
  initialState: (input: { documentId: string }) => ({
    documentId: input.documentId,
    activeSource: null,
    selectedItem: null,
  }),
  zones: {
    main: {
      select: ({ state, stores }) => ({
        kind: "module-entry",
        module: "editor",
        entry: "main",
        input: {
          documentId: state.documentId,
          // Stable WritableStore<"contentful" | "strapi" | null> per
          // (instance, "activeSource"). The editor panel uses it via
          // useSyncExternalStore; identity stable across re-renders.
          activeSource: stores.writable("activeSource", {
            get: (s) => s.activeSource,
            set: (value) => ({ activeSource: value }),
          }),
        },
      }),
    },
    source: {
      select: ({ state, stores }) =>
        state.activeSource
          ? {
              kind: "module-entry",
              module: state.activeSource,
              entry: "sourcePanel",
              input: {
                documentId: state.documentId,
                selectedItem: stores.writable("selectedItem", {
                  get: (s) => s.selectedItem,
                  set: (value) => ({ selectedItem: value }),
                }),
              },
            }
          : { kind: "empty" },
    },
  },
});
```

**Panel side** — module declares the store interface in its `input`; reads via `useSyncExternalStore`:

```typescript
import { useSyncExternalStore } from "react";
import { defineEntry, defineModule, schema } from "@modular-react/core";
import type { WritableStore } from "@modular-react/core";

interface SourcePanelInput {
  readonly documentId: string;
  readonly selectedItem: WritableStore<string | null>;
}

function ContentfulSourcePanel({ input }: { input: SourcePanelInput }) {
  // Subscribes once per instance — the store's identity is stable, so
  // useSyncExternalStore doesn't re-subscribe across re-renders.
  const selectedItem = useSyncExternalStore(
    input.selectedItem.subscribe,
    input.selectedItem.getSnapshot,
  );
  return (
    <ul>
      {items.map((it) => (
        <li
          key={it.id}
          aria-current={selectedItem === it.id || undefined}
          onClick={() => input.selectedItem.set(it.id)}
        >
          {it.title}
        </li>
      ))}
    </ul>
  );
}

export default defineModule({
  id: "contentful",
  version: "1.0.0",
  entryPoints: {
    sourcePanel: defineEntry({
      component: ContentfulSourcePanel,
      input: schema<SourcePanelInput>(),
    }),
  },
});
```

The panel imports **nothing composition-specific** — only `@modular-react/core` for the `WritableStore<T>` interface. The composition team can change `EditorState`'s shape without touching the panel; the only contract between them is `WritableStore<string | null>`. This is the recommended pattern for projects where panel modules and the composition are owned by different teams.

For projects where a single team owns both, `useCompositionState` / `useCompositionDispatch` (below) are still supported and slightly less ceremony.

### Pattern — empty zone with a typed message

```typescript
zones: {
  inspector: {
    select: ({ state }) =>
      state.selectedItemId
        ? { kind: "module-entry", module: "inspector", entry: "main", input: { id: state.selectedItemId } }
        : { kind: "empty" },
    fallback: () => <p>Select an item to inspect.</p>,
  },
}
```

### Pattern — state-driven module dispatch

The `module` field of a `module-entry` resolution can be any id in `TModules`. Use this to swap between integrations / variants without authoring N parallel zone descriptors:

```typescript
integrationSource: {
  select: ({ state }) =>
    state.activeIntegrationId
      ? {
          kind: "module-entry",
          module: state.activeIntegrationId,   // narrowed to "contentful" | "strapi" by TModules
          entry: "sourcePanel",
          input: { documentId: state.documentId },
        }
      : { kind: "empty" },
},
```

### Pattern — sibling-zone hand-off via dispatch

Panels never call each other directly. To make zone A reflect a change in zone B, B dispatches and A's selector picks up the new state on the next tick.

```typescript
// In panel B:
const dispatch = useCompositionDispatch<EditorState>();
<button onClick={() => dispatch({ selectedSourceItem: it.id })} />

// Panel A reads the same slice:
const selected = useCompositionState<EditorState, string | null>((s) => s.selectedSourceItem);
```

### Pattern — emit-only side channel

Use `useCompositionEmit` for cross-zone events that don't fit through state (e.g. "open the diff modal"). The outlet's `onZoneEvent` prop receives them with the originating zone name attached.

```typescript
// Panel:
const emit = useCompositionEmit();
<button onClick={() => emit({ kind: "open-diff", payload: { id: selected } })} />

// Host:
<CompositionOutlet
  onZoneEvent={(ev, { zone }) => {
    if (ev.kind === "open-diff") setDiffOpen(true);
  }}
/>
```

### Pattern — typed hooks per composition

> Hook-based pattern — pairs with [Hooks for foreign panels](#hooks-for-foreign-panels). See [Hooks vs stores — which to use](#hooks-vs-stores--which-to-use) for when to reach for this vs. the store-projection pattern above.

Avoid spelling `<EditorState>` at every call site by exporting pre-typed hooks from the composition package:

```typescript
// editor-composition/src/hooks.ts
import { createCompositionContext } from "@modular-react/compositions";
import type { EditorState } from "./types.js";

export const editorHooks = createCompositionContext<EditorState>();

// some-panel.tsx
import { editorHooks } from "@myorg/editor-composition";

const docId = editorHooks.useState((s) => s.documentId);
const dispatch = editorHooks.useDispatch();
```

### Pattern — exit contracts on a zone

If every panel that may render into a zone must declare the same exit (e.g. `closeRequested`), declare the contract on the zone. The resolve-time validator spot-checks that at least one registered module exposes the contract.

```typescript
import { defineExitContract } from "@modular-react/core";

export const closeRequested = defineExitContract<{ saved: boolean }>("close-requested");

zones: {
  integrationSource: {
    select: /* ... */,
    contract: closeRequested,
  },
}
```

Composition panels do not deliver exits directly to the host (their `exit` prop is a no-op stub). The contract declares **expected vocabulary** — the validator catches modules that drop the exit, but the runtime relays panel exits via `emit` or `dispatch`, not the journey-style exit channel.

## Composing journeys inside zones

A zone can host a journey instead of a plain module entry. Use this when a slot needs a stepped flow (e.g. an inline wizard).

```typescript
import { defineJourneyHandle } from "@modular-react/journeys";

export const setupHandle = defineJourneyHandle<"setup", { tenantId: string }>({ id: "setup" });

zones: {
  setupWizard: {
    select: ({ state }) =>
      state.showSetup
        ? { kind: "journey", handle: setupHandle, input: { tenantId: state.tenantId } }
        : { kind: "empty" },
  },
}
```

`@modular-react/compositions` does **not** depend on `@modular-react/journeys` directly. Instead it talks to a generic [`RuntimeMountAdapter`](#runtime-mount-adapters) registered for `kind: "journey"`. The journeys package ships a one-line factory that builds the adapter; wire it once after the manifest resolves, before mounting React:

```tsx
import { createJourneyMountAdapter } from "@modular-react/journeys";
import { CompositionsProvider } from "@modular-react/compositions";
import { JourneyProvider } from "@modular-react/journeys";

const manifest = registry.resolve();
manifest.extensions.compositions.registerMountAdapter(
  "journey",
  createJourneyMountAdapter(manifest.extensions.journeys),
);

// Mount both providers (the JourneyProvider is still needed for
// stand-alone <JourneyOutlet> usage; the adapter only wires zone-hosted
// journeys, not free-standing ones).
<JourneyProvider runtime={manifest.extensions.journeys}>
  <CompositionsProvider runtime={manifest.extensions.compositions}>
    {/* …app routes… */}
  </CompositionsProvider>
</JourneyProvider>;
```

If a zone returns a `kind: "journey"` resolution and no adapter is registered for that kind, the zone renders its error fallback with a clear "no mount adapter is registered for kind \"journey\"" message. Compositions that never use `kind: "journey"` don't need any of this wiring and don't pay for the journeys package.

### Idempotency of journey-kind resolutions

The outlet caches the minted journey instance id per `(handle.id, structural hash of input)` inside each `ZoneRenderer`. A state mutation that re-runs the selector but returns the same handle+input does not re-mint a journey instance. To take ownership of the journey lifetime explicitly, pass `instanceId`:

```typescript
{ kind: "journey", handle, input, instanceId: state.activeJourneyId }
```

When `instanceId` is provided, the outlet skips the cache and uses your id directly.

## Runtime surface

`manifest.extensions.compositions` (or `manifest.compositions` if your framework wires the alias) exposes:

```typescript
interface CompositionRuntime {
  // Mint or resume an instance. Handle form is type-checked; string form is escape-hatched.
  start(handle: CompositionHandleRef<TId, TInput>, input?: TInput): CompositionInstanceId;
  start(compositionId: string, input: unknown): CompositionInstanceId;

  // Read-only snapshot. `null` for unknown / disposed ids.
  getInstance(id: CompositionInstanceId): CompositionInstance | null;

  // Introspection.
  listInstances(): readonly CompositionInstanceId[];
  listDefinitions(): readonly CompositionDefinitionSummary[];
  isRegistered(compositionId: string): boolean;

  // Subscribe to instance changes — fires on dispatch, status flip, disposal.
  subscribe(id: CompositionInstanceId, listener: () => void): () => void;

  // Lower-level state mutation. Buffered during loading; dropped on disposed.
  dispatch<TState>(
    id: CompositionInstanceId,
    updater: Partial<TState> | ((prev: TState) => Partial<TState> | TState),
  ): void;

  // Programmatic teardown. Idempotent on disposed/unknown ids.
  end(id: CompositionInstanceId, ctx?: { reason: unknown }): void;

  // Wire an external runtime (journeys, future composition-in-zone, etc.)
  // for zones that return `kind: "<name>"` resolutions. See
  // "Runtime mount adapters" below.
  registerMountAdapter(kind: string, adapter: RuntimeMountAdapter): void;
  getMountAdapter(kind: string): RuntimeMountAdapter | undefined;
}
```

### When to call which

| API                               | When                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- |
| `start(handle, input)`            | Open an instance from a route loader, tab activation, or a button click |
| `getInstance(id)`                 | Read state outside React (telemetry, analytics, command-handlers)       |
| `subscribe(id, listener)`         | External observers (Redux bridge, devtools)                             |
| `dispatch(id, updater)`           | Imperative writes from outside a panel (URL sync, keyboard shortcuts)   |
| `end(id)`                         | Programmatic teardown that doesn't fit the "outlet unmount" trigger     |
| `registerMountAdapter(kind, adt)` | Once at startup, to enable `kind: "journey"` (or future kinds) in zones |
| `getMountAdapter(kind)`           | Tests / debug introspection of what is wired                            |

Inside panel components, prefer the React hooks — they handle subscription, dispatch, and instance binding for you.

## Runtime mount adapters

Zones with `kind: "module-entry"` resolve modules directly through the runtime's module map. Zones with any other `kind` (today: `"journey"`) resolve through a `RuntimeMountAdapter` registered on the composition runtime — a small interface defined in `@modular-react/core`:

```typescript
import type { ComponentType, ReactNode } from "react";

interface RuntimeMountAdapter<TInput = unknown> {
  start(definitionId: string, input: TInput): string; // returns instanceId
  Outlet: ComponentType<{ instanceId: string; loadingFallback?: ReactNode }>;
}
```

The adapter is the _only_ compile-time seam between compositions and other orchestration runtimes. Compositions doesn't import journey types or components at runtime; the adapter is registered explicitly by the consumer:

```typescript
import { createJourneyMountAdapter } from "@modular-react/journeys";

manifest.extensions.compositions.registerMountAdapter(
  "journey",
  createJourneyMountAdapter(manifest.extensions.journeys),
);
```

Register adapters once after `registry.resolve()` and before mounting React. The outlet caches the minted instance id per `(handle.id, structural hash of input)` per `ZoneRenderer`, so state changes that re-run the selector with the same handle+input do not call `adapter.start` again.

Future kinds (composition-in-zone, federated remote modules) plug into the same hole.

## Composition handles

A handle is an identity-only token that ties `runtime.start` to a typed `input`:

```typescript
import { defineCompositionHandle } from "@modular-react/compositions";

export const editorHandle = defineCompositionHandle<"editor", { documentId: string }>({
  id: "editor",
});

// At the call site — TInput is enforced:
runtime.start(editorHandle, { documentId: "doc-1" });
// runtime.start(editorHandle, {});   // ❌ TS error: missing documentId
```

Phantom-typed — there's nothing in the handle at runtime besides `id`. The benefit is purely compile-time: the composition's `TInput` and the caller's argument must agree.

## `CompositionsProvider` + context

Wrap the shell once, at or near the React root:

```tsx
<CompositionsProvider runtime={manifest.extensions.compositions}>
  {/* …routes / tabs / modals that mount CompositionOutlet…  */}
</CompositionsProvider>
```

`CompositionOutlet` reads the runtime from context, so you don't have to thread it through every container. If you need to reach a different runtime from a sub-tree (rare — usually one runtime per shell), pass `runtime={otherRuntime}` directly on the outlet to override the context value.

If you register the plugin via `registry.use(compositionsPlugin())`, the framework wires `CompositionsProvider` automatically — you only need to mount it manually when you create runtimes outside the registry.

## A note on persistence — there is none

Compositions intentionally do **not** ship a persistence adapter. Their state is _coordination_ (which integration is active, what is selected) rather than _flow_ (which step of a wizard you're on), and durable coordination state usually already lives somewhere else in the app — the URL, a route loader, a Redux/Zustand store with its own persist middleware. Forking that state into the composition's scoped store just to read it back via a persistence adapter doubles the source of truth.

When you want a composition to survive a reload, drive its `initialState(input)` from the durable source you already have. If you genuinely need to round-trip an entire composition's state, use [`hydrateComposition`](#hydration) with a blob you produced yourself — it skips `start()` so out-of-band attachment doesn't conflict with the input-driven init path.

Journeys _do_ ship a persistence adapter because their state is load-bearing: you can't resume "step 3 with accumulated state X" without that machinery. Compositions don't have that asymmetry — a fresh `start()` plus the right input recreates exactly the same layout.

## Rendering — `CompositionOutlet`

```typescript
<CompositionOutlet<"zoneA" | "zoneB">
  compositionId="editor"
  instanceId={id}
  loadingFallback={<Spinner />}
  notFoundComponent={CustomNotFound}
  errorComponent={CustomError}
  onZoneEvent={(ev, { zone }) => /* host-level routing */}
  retryLimit={2}
>
  {(zones) => (
    <div>
      {zones.zoneA}
      {zones.zoneB}
    </div>
  )}
</CompositionOutlet>
```

### Props

| prop                | purpose                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `runtime`           | Optional — defaults to the runtime from `CompositionsProvider` context                                       |
| `compositionId`     | Definition id (also resolvable via the instance, but the prop avoids a round-trip lookup)                    |
| `instanceId`        | The id returned from `runtime.start(...)`                                                                    |
| `modules`           | Optional override for the module descriptors (defaults to the runtime's module map)                          |
| `children`          | Render-prop receiving `{ [zoneName]: ReactNode }` — one fully-wrapped element per zone                       |
| `loadingFallback`   | Used as the per-zone `Suspense` fallback while a lazy entry's chunk loads (entry-level `fallback` overrides) |
| `notFoundComponent` | Rendered when a `module-entry` resolution names a module/entry that isn't registered                         |
| `errorComponent`    | Rendered when a zone's panel throws and `onZoneError` returns `"fallback"`                                   |
| `onZoneEvent`       | Receives `useCompositionEmit({ kind, payload })` calls with the zone name attached                           |
| `retryLimit`        | Cap on `"retry"` policy responses before the zone falls back. Default `2`                                    |

The render-prop receives one `ReactNode` per declared zone. Each `ReactNode` is wrapped in:

1. `<CompositionInstanceContext.Provider>` — so the panel's hooks resolve to this instance
2. `<ZoneErrorBoundary>` — catches panel + selector throws, keyed on `(selectionKey, retryKey)`
3. `<Suspense fallback={entry.fallback ?? loadingFallback ?? null}>` — for lazy entries

The host is responsible for layout only; rendering is fully owned by the framework.

### Error policies (`onZoneError`)

The composition's `onZoneError(err, ctx)` returns one of three policies:

| policy       | behavior                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"retry"`    | Bumps the per-zone retry counter (capped by `retryLimit`) and remounts the boundary with a fresh key. Counter resets when the resolution changes successfully |
| `"fallback"` | Renders `errorComponent` (default: a red-bordered card). Stays visible until the resolution changes                                                           |
| `"ignore"`   | Renders `null`. Useful for optional UI sugar (recommendation strip, ambient hints) whose failure shouldn't show error chrome                                  |

Default policy is `"fallback"` if `onZoneError` is not declared on the definition. `options.onError` is always called for telemetry, regardless of policy.

### Preload

A zone descriptor's `preload` field controls whether its currently-resolved module-entry's lazy chunk is warmed during browser idle:

- **`"lazy"`** (default): no extra prefetch. The chunk loads when the panel first renders (via `React.lazy` + `Suspense`).
- **`"eager"`**: after the outlet mounts, the runtime walks every zone marked `eager`, runs its selector against current state, and calls `resolveEntryComponent(entry).preload()` during `requestIdleCallback` (or `setTimeout(0)` in non-DOM environments). The selector re-evaluates as state changes; cancelled idle handles never fire.

Eager preload only affects `lazy: () => import(...)` entries — eager entries (`component: Foo`) are already resolved. The effect is a no-op server-side.

### Host rules

- Render each zone exactly **once** per outlet. Mounting the same zone twice produces two distinct boundaries and two distinct panel instances — sibling panels reading the same composition state will work, but you'll pay double-render cost.
- Do **not** mount the same `instanceId` in two outlets simultaneously unless you understand the listener-count semantics. The runtime tolerates it (both outlets attach via `outletRefCount`), but disposal only fires when both detach AND no other listeners remain.
- The render-prop is allowed to skip zones (`{zones.editorMain}` without `{zones.integrationSource}`). The skipped zone's panel doesn't mount; its selector still runs (it's a pure function — no harm) but the result is discarded.

## Host hook — `useComposition`

The route / tab / modal that _mounts_ a composition uses one hook to mint its instance:

```typescript
import { useComposition } from "@modular-react/compositions";

// Handle form — TS infers `TInput` and rejects mismatches.
const instanceId = useComposition(editorHandle, { documentId: "doc-1" });

// String-id form — same lifecycle, no input typing.
const instanceId = useComposition("editor", { documentId: "doc-1" });

// Explicit runtime — useful for standalone consumers not using the plugin.
// Wrap options with `useCompositionOptions(...)` so the hook can tell options
// apart from an input that happens to have a `runtime` field.
import { useCompositionOptions } from "@modular-react/compositions";
const instanceId = useComposition(
  editorHandle,
  { documentId: "doc-1" },
  useCompositionOptions({ runtime }),
);
```

**What it does.** Lazy-ref initializer that calls `runtime.start(...)` exactly once per component mount and returns the minted id. No `useEffect`. No setState round-trip. Reads the runtime from `<CompositionsProvider>` context by default; pass an explicit runtime via `useCompositionOptions({ runtime })` to bypass.

**Disposal.** Automatic via `<CompositionOutlet>`'s attach/detach refcount: when the outlet unmounts and no other listeners remain, the runtime ends the instance after a microtask (the microtask defer keeps StrictMode's simulated mount/unmount/mount dance from tearing it down on first visit). For imperative teardown — a "close" button, a Cmd-K palette killing a stale instance — call `runtime.end(id)` directly.

**Why not `useEffect` / `useMemo`?**

- `useEffect(() => { setInstanceId(runtime.start(...)) }, [])` round-trips the id through React state before the outlet can attach. In StrictMode's dev double-mount it spawns a spurious instance the cleanup has to dispose, and the parent re-renders an extra time with `instanceId === null`. It's also the textbook ["You Might Not Need an Effect"](https://react.dev/learn/you-might-not-need-an-effect#initializing-the-application) case.
- `useMemo(() => runtime.start(...), [])` looks tempting but the React docs explicitly say `useMemo` is **a pure optimization hint** — React may discard the memo cache and re-invoke the factory at any time, which would mint orphan instances every time it does so.

`useComposition` uses a `useRef` initializer so the `start()` call is guaranteed to run exactly once per React mount, and lets the outlet's refcount handle disposal. Tests are in `third-pass-fixes.test.tsx` (`useComposition` describe block).

## Hooks for foreign panels

> The alternative to the [typed store projections](#pattern--typed-store-projections-composition-unaware-panels) pattern, suited to in-team panels. The hook-based path is fully supported — neither pattern is deprecated. See [Hooks vs stores — which to use](#hooks-vs-stores--which-to-use) for the trade-off.

Panels inside a composition zone — and only those panels — can read the active instance via four hooks. They throw if called outside a `<CompositionOutlet>` zone.

```typescript
// All four are also available pre-typed via createCompositionContext<TState>().
import {
  useCompositionState,
  useCompositionDispatch,
  useCompositionEmit,
  useCompositionZone,
} from "@modular-react/compositions";
```

### `useCompositionState<TState>(selector?)`

Subscribes to the composition's scoped store. With a selector, only re-renders when the selected slice changes (via `Object.is` on the selector's output). Without one, re-renders on every dispatch.

```typescript
// Full state — rare; prefer a selector.
const state = useCompositionState<EditorState>();

// Selected slice — typical.
const docId = useCompositionState<EditorState, string>((s) => s.documentId);
```

### `useCompositionDispatch<TState>()`

Returns a stable callback that accepts a partial-state shallow-merge or an updater function. The callback identity is preserved across composition state changes — wrapping a consumer in `React.memo` (if the framework allows non-function components in entries) avoids re-renders from context churn.

```typescript
const dispatch = useCompositionDispatch<EditorState>();
dispatch({ selectedSourceItem: "id-42" });
dispatch((prev) => ({ tick: prev.tick + 1 }));
```

### `useCompositionEmit()`

Returns a stable callback that routes events to the outlet's `onZoneEvent` prop with the zone name attached:

```typescript
const emit = useCompositionEmit();
emit({ kind: "open-diff", payload: { id: selected } });
```

### `useCompositionZone()`

Returns `{ compositionId, instanceId, zone }` — useful for analytics and logging that scope to which zone a panel is filling.

### Typed-hooks factory

Avoid repeating `<TState>` at every call site:

```typescript
// editor-composition/src/hooks.ts
import { createCompositionContext } from "@modular-react/compositions";
import type { EditorState } from "./types.js";

export const editor = createCompositionContext<EditorState>();
// → { useState, useDispatch, useEmit, useZone }

// some-panel.tsx
const docId = editor.useState((s) => s.documentId);
const dispatch = editor.useDispatch();
```

## Validation

The plugin runs two passes:

### `validateCompositionDefinition` — at registration

Catches authoring mistakes that wouldn't otherwise surface until the first render:

- Missing / blank `id`, `version`, `initialState`
- Empty `zones` map
- Non-function `select` on a zone

Throws `CompositionValidationError` (with `issues: readonly string[]`) aggregating every problem.

### `validateCompositionContracts` — at registry resolve

Cross-references the composition against the resolved module map:

- **Duplicate composition ids** — `"composition X is registered more than once"`.
- **`moduleCompat`** — every entry naming a registered module is checked with the shared semver subset from `@modular-react/core` (caret, tilde, x-range, bounded, hyphen, AND, OR). Empty/non-string ranges and parse errors are reported. Modules not registered in the assembly are silently skipped (typed-module catalogs may include environment-specific modules).
- **Zone contracts** — for every zone with a declared `contract`, the validator spot-checks that at least one registered module declares the same `ExitContract` (by reference identity) as an exit point. If none does, the registration fails.

The contract check is intentionally weak ("at least one"). Selectors are dynamic, so we cannot statically enumerate every reachable `module-entry` resolution. Pair contracts with `moduleCompat` to also enforce version-range agreement on each candidate module.

## Hydration

`hydrateComposition` attaches an out-of-band blob — typically an SSR dump or a debug snapshot — to an existing runtime without going through `start()`. This is **not** a persistence path; the compositions package doesn't ship one. Use it when you have a server-rendered state you want to hand off to the client verbatim:

```typescript
import { hydrateComposition, CompositionHydrationError } from "@modular-react/compositions";

try {
  const id = hydrateComposition(runtime, "editor", dumpBlob);
  // id === dumpBlob.instanceId
} catch (err) {
  if (err instanceof CompositionHydrationError) {
    // version mismatch, definitionId mismatch, or instanceId already live
  }
  throw err;
}
```

The function throws `UnknownCompositionError` when the composition id isn't registered, and `CompositionHydrationError` when:

- the blob's `definitionId` doesn't match the supplied composition id,
- the blob's `version` doesn't match the active definition (there is no migration runner — migrate the blob upstream before calling), or
- the supplied `instanceId` is already live in the runtime.

The hydrated instance is otherwise indistinguishable from one minted by `start()` and follows the same disposal rules.

## Cycle safety

`<CompositionOutlet>` tracks the set of composition instance ids currently in the React ancestor chain. If a descendant outlet attempts to render an instance already in that set — typically because a zone hosts a journey whose step renders the same composition instance — the descendant outlet refuses to mount and renders its `errorComponent` with a clear message instead of stack-overflowing.

The detection is narrow on purpose: it catches the **same instance** rendering inside itself. Cycles that recurse through two different instances of the same definition (composition C₁ → journey J → composition C₂ where C₁ and C₂ share a definition) aren't caught — the outlets see different instance ids and proceed. Similarly, `@modular-react/journeys` runs its own parent-link cycle detection for journey-to-journey invocations but does not see composition ancestors. If you author a cycle that crosses the journey ↔ composition boundary on different instance ids, neither package can detect it for you; restructure to share a single instance and the in-ancestor check then catches the recursion.

## Errors, races, and edge cases

### Throws are routed by phase

`options.onError(err, { zone, phase })` receives every caught throw with one of:

- `"select"` — the zone's `select` function threw (the zone renders its `errorComponent`)
- `"render"` — a panel's render or commit threw (the zone error boundary engages with `onZoneError`)
- `"lifecycle"` — `lifecycle.onMount`, `lifecycle.onUnmount`, or `onDispose` threw
- `"emit"` — the host's `onZoneEvent` callback threw while handling a `useCompositionEmit` call
- `"notify"` — a `runtime.subscribe` listener threw during a notify pass
- `"retry-exhausted"` — `onZoneError` returned `"retry"` but the configured `retryLimit` was already consumed; the original render error is passed through and the zone's fallback UI renders

Telemetry runs for **every** throw, regardless of the `onZoneError` policy.

### StrictMode tolerance

The runtime defers disposal one microtask so React 18/19 StrictMode's mount/unmount/mount cycle never tears an instance down on first visit. The microtask checks both `outletRefCount` and `listeners.size` before firing `endInstance`; if anything is still listening, disposal is skipped.

### Validation timing

- Definition-time (`registerComposition`) — synchronous, throws `CompositionValidationError` immediately on structural issues.
- Resolve-time (`registry.resolve()`) — synchronous, throws `CompositionValidationError` on duplicate ids, `moduleCompat` mismatches, and contract gaps.
- Direct construction (`createCompositionRuntime(registered, { modules })`) — synchronous, runs the same cross-reference checks as resolve-time when a `modules` map is supplied. Structural validation is still expected to have happened upstream (via `registerComposition` or your test fixture); the runtime constructor will also reject duplicate composition ids on its own.

## Limitations

- **Selectors must be pure functions of (state, deps).** They run on every state change and on every parent re-render of the outlet. Side effects, time-based behavior, or `setState` from inside a selector will cause undefined behavior.
- **No transition graph.** Compositions express layout coordination, not flow. If you need "advance to next module on exit", reach for `@modular-react/journeys`.
- **No outlet-level error boundary.** The framework wraps each zone in its own boundary, not the entire outlet. A throw outside the zone-render path (e.g. from the host's render-prop body) is the host's responsibility.
- **No built-in persistence.** Coordination state lives in memory; durable storage belongs in the application (URL params, app-level store). See the [persistence note](#a-note-on-persistence--there-is-none).
- **Composition panels' `exit` prop is a no-op stub.** Foreign panels rendered inside a composition zone cannot deliver exits to the host's exit dispatcher. Use `dispatch` for state changes and `emit` for cross-zone events instead. (Journeys hosted inside a zone deliver exits through the journey runtime normally.)
- **Cycle detection is partial across the journey ↔ composition boundary.** Same-instance recursion is caught; recursion through two different instances of the same definition is not. See [Cycle safety](#cycle-safety).

## Comparison with sibling primitives

Three primitives in the framework arrange modules on a screen. Pick by problem shape: extending one screen vs. coordinating several modules in parallel vs. driving a stepped flow.

|                                | `module.zones` (route-level)                                                        | `@modular-react/compositions` (this package)                                                                       | `@modular-react/journeys`                                                |
| ------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **Primary use**                | A foreign module contributes a single component to a named slot on the active route | Multi-module screen layout with shared state, rendered in parallel                                                 | Multi-module stepped workflow with typed transitions                     |
| **Cardinality**                | One contribution per zone (most-recent active wins)                                 | N panels mounted simultaneously, one per declared zone                                                             | One step rendered at a time                                              |
| **Declared by**                | `defineModule({ zones })` + route `staticData`                                      | `defineComposition({ zones })`                                                                                     | `defineJourney({ start, transitions })`                                  |
| **State model**                | None — slots map id → component                                                     | Scoped store; selectors project state into zones                                                                   | Step + accumulated state; transitions advance step                       |
| **Flow**                       | Static contribution                                                                 | No graph — any state can produce any resolution                                                                    | Directed graph of `(step, exit) → next step`                             |
| **Read in shell**              | `useZones` / `useActiveZones`                                                       | `<CompositionOutlet>` render-prop with zone names                                                                  | `<JourneyOutlet>` (leaf-walk through current step)                       |
| **Instance id prefix**         | n/a                                                                                 | `ci_*`                                                                                                             | `ji_*`                                                                   |
| **Persistence**                | n/a                                                                                 | None — keep durable coordination state in the application layer                                                    | First-class adapter (`JourneyPersistence`) with versioned blobs          |
| **Panel ↔ host data flow**     | n/a                                                                                 | Stores (`ReadableStore`/`WritableStore` via `input`) **or** hooks (`useCompositionState`/`Dispatch`/`Emit`/`Zone`) | `useJourneyState`, `useJourneyInstance`, `useJourneyCallStack`           |
| **Validation**                 | Slot-name + route lookup                                                            | Zone contracts (spot-check) + `moduleCompat`                                                                       | Reachability + transition exhaustiveness + contracts                     |
| **Composition with the other** | n/a                                                                                 | A zone can mount `<JourneyOutlet>` via `kind: "journey"`                                                           | A journey step can render `<CompositionOutlet>` like any other component |

Choose by problem shape:

- **`module.zones`** when a route already exists and another module needs to contribute one widget (a header chip, a command, a sidebar entry) — the contribution is static and tied to the active route.
- **Compositions** when one screen layout coordinates several modules with **shared state** — multiple panels mounted in parallel, each reactive to a per-instance scoped store.
- **Journeys** when the screen is a **flow problem** — do A, then B, then maybe C, with typed handoffs between steps.

The three are complementary, not competing. A screen can use all of them: a route hosting a `<CompositionOutlet>` whose `inspector` zone hosts a `<JourneyOutlet>`, while the route itself contributes a `module.zones` chip to the shell header.
