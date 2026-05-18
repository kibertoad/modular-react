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
- [Persistence](#persistence) — adapters, key design, save debounce, version migration
- [Rendering — `CompositionOutlet`](#rendering--compositionoutlet) — props, render-prop, error policies, preload
- [Hooks for foreign panels](#hooks-for-foreign-panels) — `useCompositionState` / `Dispatch` / `Emit` / `Zone`, typed-bundle factory
- [Validation](#validation) — definition-time + resolve-time checks
- [Hydration](#hydration) — out-of-band blob attachment + version migration
- [Errors, races, and edge cases](#errors-races-and-edge-cases)
- [Limitations](#limitations)
- [API reference](#api-reference)
- [Comparison with journeys](#comparison-with-journeys)

## Installation

```bash
pnpm add @modular-react/compositions
```

Peer deps: `@modular-react/core`, `@modular-react/react`, `@modular-react/journeys`, `react`, `react-dom`.

`@modular-react/journeys` is a peer dependency because composition zones can host journey instances and the validator reuses the journey package's semver implementation. If you never declare a `kind: "journey"` resolution and never use `moduleCompat`, the journey runtime is still linked but unused.

## Mental model

Three roles, strictly separated:

1. **Modules** declare what they render (`entryPoints`) and what they emit (`exitPoints`). They know **nothing** about the composition that hosts them — a panel rendered as part of an "editor" composition is the same module that might be rendered standalone on a different route.
2. **The composition** owns a scoped store (`TState`), declares one **zone** per layout slot, and provides a pure **selector** per zone that maps state to "what should render here right now".
3. **The host** (a route Component, a tab, a modal, anywhere) calls `runtime.start(handle, input)` to get an `instanceId`, then renders `<CompositionOutlet instanceId={id}>` with a layout render-prop that arranges the zones however it wants.

The composition's store is the **orchestration bus**. Panels mutate it via `useCompositionDispatch`; sibling panels read the resulting state via `useCompositionState`. There is no other coupling between panels.

```
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
import { CompositionOutlet, CompositionsProvider } from "@modular-react/compositions";
import { editorHandle, type EditorState } from "@myorg/editor-composition";
import { manifest } from "../registry.js";

export function EditorRoute({ documentId }: { documentId: string }) {
  // Mint or resume the instance once per documentId. Wire to your route loader
  // / useMemo / state-store however your shell does it.
  const instanceId = useMemo(
    () => manifest.extensions.compositions.start(editorHandle, { documentId }),
    [documentId],
  );

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

### 5. Drive the composition from inside a panel

A panel that lives inside the composition reads state and dispatches changes via the hooks. The panel itself doesn't know which composition it's in — only that it's inside *some* composition.

```typescript
// contentful/src/SourcePanel.tsx
import {
  useCompositionDispatch,
  useCompositionEmit,
  useCompositionState,
} from "@modular-react/compositions";
import type { EditorState } from "@myorg/editor-composition";
import type { ModuleEntryProps } from "@modular-react/core";

export function ContentfulSourcePanel({ input }: ModuleEntryProps<{ documentId: string }>) {
  const selected = useCompositionState<EditorState, string | null>(
    (s) => s.selectedSourceItem,
  );
  const dispatch = useCompositionDispatch<EditorState>();
  const emit = useCompositionEmit();

  return (
    <ul>
      {items.map((it) => (
        <li
          key={it.id}
          aria-current={selected === it.id || undefined}
          onClick={() => dispatch({ selectedSourceItem: it.id })}
        >
          {it.title}
        </li>
      ))}
      <button onClick={() => emit({ kind: "open-diff", payload: { id: selected } })}>
        Compare
      </button>
    </ul>
  );
}
```

Pass typed hooks down per-composition with the `createCompositionContext<TState>()` factory if you don't want to spell `<EditorState>` at every call site — see [Hooks for foreign panels](#hooks-for-foreign-panels).

## Core concepts

### Zones

A zone is a named projection of state into one of three resolutions, declared per-render by the zone's `select(ctx)`:

```typescript
type ZoneResolution =
  | { kind: "module-entry"; module: string; entry: string; input?: unknown }
  | { kind: "journey"; handle: JourneyHandleRef; input?: unknown; instanceId?: string }
  | { kind: "empty" };
```

- **`module-entry`** — render the named module's entry. The runtime looks the entry up in the module map and calls it with `input` as `ModuleEntryProps.input`.
- **`journey`** — mount a `<JourneyOutlet>` for the referenced journey handle. The composition outlet caches the minted journey instance id per `(handle.id, structural hash of input)` so a state change that produces the same resolution does not re-mint.
- **`empty`** — render the zone's `fallback` (a React component) or `null`.

`TModules` constrains the `module` field to ids the composition's typed module map declares, so a typo is a compile error.

### Selectors are pure

Selectors run on every state change. They must be pure functions of `(state, deps)` — no I/O, no `setState`, no time-based behavior. The runtime reads the resolution and decides whether to remount the panel (when `module`/`entry` change), keep the existing panel and update `input` (when only `input` changes), or skip rendering (when the resolution is structurally identical to the previous one).

`deps` is the shared-dependency snapshot the plugin captures at registry resolve time. It is opaque to the runtime — use it for things like a logger, a feature-flag client, or any service the composition author wants in scope.

### Instance lifecycle and statuses

Three statuses:

| status     | meaning                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------- |
| `loading`  | only possible when persistence is wired — the runtime is awaiting `persistence.load(key)`          |
| `active`   | the instance is live; `dispatch`, `subscribe`, and outlet rendering all work normally              |
| `disposed` | the instance is torn down; subscribers receive one last `"disposed"` snapshot and `getInstance` returns `null` |

Disposal happens automatically when:

- the last `<CompositionOutlet>` for the instance unmounts AND no other `runtime.subscribe()` listeners are attached;
- the disposal microtask fires (so React 18/19 StrictMode mount/unmount/mount cycles do not tear an instance down on first visit).

Explicit `runtime.end(id, { reason })` short-circuits the auto-disposal and is the right path for programmatic teardown (e.g. a Cmd-K palette killing a stale instance).

### Lifecycle hooks fire order

For every instance, the runtime guarantees this sequence:

```
start(handle, input)
  ├── persistence.load() (if wired, async; status="loading")
  │     ├── on hit: blob is migrated through onHydrate (def, then registration)
  │     │   └── version-mismatch with no onHydrate → blob wiped, fresh start
  │     └── on miss: keep the input-derived initial state
  ├── status → "active"
  ├── lifecycle.onMount(state, deps)
  ├── options.onMount({ compositionId, instanceId, state })
  ├── buffered dispatches (issued during loading) replay in order
  └── persistence.save(key, blob)   // cold-start save, bypasses debounce

... live mutations ...

end(id) | last outlet detaches
  ├── cancel any pending debounce timer
  ├── status → "disposed"
  ├── lifecycle.onUnmount(state, deps)
  ├── options.onUnmount({ compositionId, instanceId, state })
  ├── definition.onDispose({ compositionId, instanceId, state, reason })
  └── persistence.remove(key)       // successor-aware (see Persistence)
```

`onError` is fired observation-only on throws from selectors, panel renders, lifecycle hooks, hydration migrations, and `onZoneEvent` callbacks.

### Idempotency: `start()` semantics

- **With persistence**: `start(handle, sameInput)` returns the existing `instanceId` if a live record's `keyFor({ compositionId, input })` matches. Two `start()` calls back-to-back with the same input return the same id.
- **Without persistence**: every `start()` mints a fresh instance. The caller is responsible for caching the id (e.g. `useMemo` keyed on `documentId`).

## Authoring patterns

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

The composition outlet renders `<JourneyOutlet instanceId={...}>` for journey-kind resolutions, reading the journey runtime from `<JourneyProvider>` above the composition. **Mount both providers** at the shell:

```tsx
<JourneyProvider runtime={manifest.extensions.journeys}>
  <CompositionsProvider runtime={manifest.extensions.compositions}>
    {/* …app routes… */}
  </CompositionsProvider>
</JourneyProvider>
```

Without `<JourneyProvider>`, a `journey`-kind resolution renders the zone's error fallback with a clear "no JourneyProvider" message.

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
}
```

### When to call which

| API                          | When                                                                |
| ---------------------------- | ------------------------------------------------------------------- |
| `start(handle, input)`       | Open an instance from a route loader, tab activation, or a button click |
| `getInstance(id)`            | Read state outside React (telemetry, analytics, command-handlers)   |
| `subscribe(id, listener)`    | External observers (Redux bridge, devtools)                         |
| `dispatch(id, updater)`      | Imperative writes from outside a panel (URL sync, keyboard shortcuts) |
| `end(id)`                    | Programmatic teardown that doesn't fit the "outlet unmount" trigger |

Inside panel components, prefer the React hooks — they handle subscription, dispatch, and instance binding for you.

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

## Persistence

A persistence adapter lets a composition instance survive page reloads, tab switches, and SSR hydration. Without one, instances live in memory only.

```typescript
import {
  createWebStorageCompositionPersistence,
  defineCompositionPersistence,
} from "@modular-react/compositions";

const persistence = defineCompositionPersistence<{ documentId: string }, EditorState>(
  createWebStorageCompositionPersistence({
    keyFor: ({ compositionId, input }) => `${compositionId}:${input.documentId}`,
  }),
);

registry.registerComposition(editorComposition, { persistence });
```

Three stock adapters ship in this package:

- **`createWebStorageCompositionPersistence`** — `localStorage` / `sessionStorage` (SSR-safe, corrupt entries lazily removed)
- **`createMemoryCompositionPersistence`** — Map-backed, for tests and SSR
- **`defineCompositionPersistence`** — identity helper that ties an arbitrary adapter to a composition's `TInput`

The adapter shape is structurally compatible with `JourneyPersistence` — one backend implementation can serve both with different blob shapes.

### Key design

`keyFor` is called at `start()` time with `{ compositionId, input }` and must be **deterministic**. The runtime uses it both to dedupe live instances (`start` with the same `keyFor` result returns the existing `instanceId`) and to address the persistence backend. A typical pattern:

```typescript
keyFor: ({ compositionId, input }) =>
  `${compositionId}:${input.tenantId}:${input.documentId}`,
```

The key is internally namespaced by `compositionId` so two compositions with the same `keyFor` cannot collide.

### Save pipeline

- **Without `saveDebounceMs`** (default): every dispatch triggers an async `persistence.save(key, blob)`. The runtime serializes saves per-instance (one in flight at a time), so adapters do not see out-of-order writes from the same instance.
- **With `saveDebounceMs > 0`**: dispatches within the window coalesce into a single trailing-edge save. Disposal cancels any pending timer — the trailing state is intentionally dropped, since disposal removes the blob anyway. Set ~150ms for high-frequency interactions (drag, controlled inputs); leave at 0 for durability-critical state.
- **Cold-start save**: when an instance starts and the persistence probe returns no blob (or returns a migratable one), the runtime fires one save immediately, **bypassing debounce**, so a refresh before any state change still finds the blob keyed under `userKey`.

### Successor-aware remove

If a fast end+restart cycle reuses the same key (e.g. close a doc, immediately re-open the same one), the runtime tracks who owns the persistence key. When a deferred remove (queued during a save-in-flight at disposal time) fires, it first checks whether a successor has claimed the slot — if so, the remove is suppressed. Without this guard, the deferred remove would wipe the successor's data.

### Version migration: `onHydrate`

When a loaded blob's `version` does not match the current `definition.version`, the runtime walks it through two optional hooks:

```typescript
defineComposition<EditorModules, EditorState>()({
  id: "editor",
  version: "2.0.0",
  // …
  onHydrate(blob) {
    // Definition-level migration — author owns the shape.
    if (blob.version === "1.0.0") {
      return {
        ...blob,
        version: "2.0.0",
        state: migrateV1ToV2(blob.state as V1State),
      };
    }
    throw new Error(`Unmigratable blob version ${blob.version}`);
  },
});
```

The registration-level `onHydrate` (on `CompositionRegisterOptions`) runs after the definition's — shells can layer environment-specific upgrades on top.

If no `onHydrate` is provided and the version drifts, the runtime:

1. Surfaces a `CompositionHydrationError` via `options.onError` with `phase: "lifecycle"`.
2. Wipes the stale blob (so the next start doesn't re-encounter it).
3. Falls back to the fresh `initialState(input)`.

The next save then writes a fresh v2 blob under the same key.

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

| prop                 | purpose                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `runtime`            | Optional — defaults to the runtime from `CompositionsProvider` context                   |
| `compositionId`      | Definition id (also resolvable via the instance, but the prop avoids a round-trip lookup) |
| `instanceId`         | The id returned from `runtime.start(...)`                                                |
| `modules`            | Optional override for the module descriptors (defaults to the runtime's module map)      |
| `children`           | Render-prop receiving `{ [zoneName]: ReactNode }` — one fully-wrapped element per zone   |
| `loadingFallback`    | Rendered while `status === "loading"` (i.e. waiting on persistence load)                 |
| `notFoundComponent` | Rendered when a `module-entry` resolution names a module/entry that isn't registered     |
| `errorComponent`     | Rendered when a zone's panel throws and `onZoneError` returns `"fallback"`                |
| `onZoneEvent`        | Receives `useCompositionEmit({ kind, payload })` calls with the zone name attached       |
| `retryLimit`         | Cap on `"retry"` policy responses before the zone falls back. Default `2`                |

The render-prop receives one `ReactNode` per declared zone. Each `ReactNode` is wrapped in:

1. `<CompositionInstanceContext.Provider>` — so the panel's hooks resolve to this instance
2. `<ZoneErrorBoundary>` — catches panel + selector throws, keyed on `(selectionKey, retryKey)`
3. `<Suspense fallback={entry.fallback ?? loadingFallback ?? null}>` — for lazy entries

The host is responsible for layout only; rendering is fully owned by the framework.

### Error policies (`onZoneError`)

The composition's `onZoneError(err, ctx)` returns one of three policies:

| policy     | behavior                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"retry"`  | Bumps the per-zone retry counter (capped by `retryLimit`) and remounts the boundary with a fresh key. Counter resets when the resolution changes successfully |
| `"fallback"` | Renders `errorComponent` (default: a red-bordered card). Stays visible until the resolution changes                                                       |
| `"ignore"` | Renders `null`. Useful for optional UI sugar (recommendation strip, ambient hints) whose failure shouldn't show error chrome                              |

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

## Hooks for foreign panels

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
- **`moduleCompat`** — every entry naming a registered module is checked with the semver subset shared with `@modular-react/journeys` (caret, tilde, x-range, bounded, hyphen, AND, OR). Empty/non-string ranges and parse errors are reported. Modules not registered in the assembly are silently skipped (typed-module catalogs may include environment-specific modules).
- **Zone contracts** — for every zone with a declared `contract`, the validator spot-checks that at least one registered module declares the same `ExitContract` (by reference identity) as an exit point. If none does, the registration fails.

The contract check is intentionally weak ("at least one"). Selectors are dynamic, so we cannot statically enumerate every reachable `module-entry` resolution. Pair contracts with `moduleCompat` to also enforce version-range agreement on each candidate module.

## Hydration

`hydrateComposition` attaches an out-of-band blob (e.g. a server-side dump, a snapshot test fixture, a debugging dump) without going through `start()`. Unlike the persistence-driven load:

- The original `blob.instanceId` is preserved (so cross-document references in dumps round-trip)
- `keyFor` / persistence probing is skipped
- The blob is run through both `onHydrate` hooks before being applied

```typescript
import { hydrateComposition, CompositionHydrationError } from "@modular-react/compositions";

try {
  const id = hydrateComposition(runtime, "editor", dumpBlob);
  // id === dumpBlob.instanceId
} catch (err) {
  if (err instanceof CompositionHydrationError) {
    // version mismatch with no onHydrate, or onHydrate returned an incompatible shape
  }
  throw err;
}
```

The function throws `UnknownCompositionError` if the composition id isn't registered, and `CompositionHydrationError` if the blob's `definitionId` doesn't match the supplied id, the blob's version doesn't match the definition after migration, or the supplied `instanceId` is already live.

The hydrated record carries `persistenceKey: null` — `runtime.end(id)` will NOT fire `persistence.remove` for hydrated instances. If you want hydration to participate in the keyIndex, dispatch a no-op to trigger a save, or use `start()` instead.

## Errors, races, and edge cases

### Throws are routed by phase

`options.onError(err, { zone, phase })` receives every caught throw with one of:

- `"select"` — the zone's `select` function threw (the zone renders its `errorComponent`)
- `"render"` — a panel's render or commit threw (the zone error boundary engages with `onZoneError`)
- `"lifecycle"` — `lifecycle.onMount`, `lifecycle.onUnmount`, `onDispose`, or hydration migration threw

Telemetry runs for **every** throw, regardless of the `onZoneError` policy.

### Loading-phase dispatch is buffered

A dispatch issued while `status === "loading"` is queued in `record.pendingDispatches` and replayed in arrival order once the load resolves. Hosts that fire-and-forget a `dispatch` right after `start()` (e.g. URL sync on route activation) do not lose writes.

### StrictMode tolerance

The runtime defers disposal one microtask so React 18/19 StrictMode's mount/unmount/mount cycle never tears an instance down on first visit. The microtask checks both `outletRefCount` and `listeners.size` before firing `endInstance`; if anything is still listening, disposal is skipped.

### Successor-aware persistence cleanup

A fast end → restart with the same `keyFor` result will preserve the new instance's blob — the deferred remove from the disposed instance is suppressed when a successor owns the keyIndex slot. See [Persistence](#persistence).

### Validation timing

- Definition-time (`registerComposition`) — synchronous, throws `CompositionValidationError` immediately on structural issues
- Resolve-time (`registry.resolve()`) — synchronous, throws `CompositionValidationError` on duplicate ids, `moduleCompat` mismatches, and contract gaps

If the plugin is bypassed (`createCompositionRuntime` called directly), only the runtime's duplicate-id check fires; structural and contract validation are skipped.

## Limitations

- **Selectors must be pure functions of (state, deps).** They run on every state change and on every parent re-render of the outlet. Side effects, time-based behavior, or `setState` from inside a selector will cause undefined behavior.
- **No transition graph.** Compositions express layout coordination, not flow. If you need "advance to next module on exit", reach for `@modular-react/journeys`.
- **No outlet-level error boundary.** The framework wraps each zone in its own boundary, not the entire outlet. A throw outside the zone-render path (e.g. from the host's render-prop body) is the host's responsibility.
- **No persistence migration runner.** A blob with a different `version` is migrated by your `onHydrate` callback — there is no built-in "run these migrations in sequence" helper. Most apps need only one or two version bumps over the composition's lifetime, so a single switch on `blob.version` is enough.
- **Composition panels' `exit` prop is a no-op stub.** Foreign panels rendered inside a composition zone cannot deliver exits to the host's exit dispatcher. Use `dispatch` for state changes and `emit` for cross-zone events instead. (Journeys hosted inside a zone deliver exits through the journey runtime normally.)
- **`React.memo` and `forwardRef`'d entry components are not supported.** `resolveEntryComponent` in `@modular-react/react` requires `typeof entry.component === "function"`. Panels can still memoize internally via `useMemo` / `useCallback`.
- **`saveDebounceMs` drops trailing state on disposal.** A pending debounced save is cancelled at disposal time; the corresponding blob is removed anyway. Browser-close (no clean disposal) does not flush the pending save — implement a `beforeunload` handler at the app level if that matters.

## API reference

### Authoring

```typescript
import {
  defineComposition,
  defineCompositionHandle,
  defineCompositionPersistence,
  createWebStorageCompositionPersistence,
  createMemoryCompositionPersistence,
  createCompositionContext,
} from "@modular-react/compositions";

import type {
  CompositionDefinition,
  CompositionDefinitionSummary,
  CompositionHandleRef,
  CompositionInstance,
  CompositionInstanceId,
  CompositionLifecycle,
  CompositionPersistence,
  CompositionRegisterOptions,
  CompositionRuntime,
  CompositionStatus,
  CompositionZoneErrorPolicy,
  CompositionZoneEvent,
  ZoneDescriptor,
  ZoneMap,
  ZoneResolution,
  ZoneSelector,
  ZoneSelectorCtx,
  SerializedComposition,
  SyncCompositionPersistence,
  TypedCompositionHooks,
  WebStorageCompositionPersistenceOptions,
  MemoryCompositionPersistenceOptions,
  MemoryCompositionPersistence,
} from "@modular-react/compositions";
```

### Runtime + plugin

```typescript
import {
  createCompositionRuntime,
  hydrateComposition,
  compositionsPlugin,
  CompositionHydrationError,
  CompositionValidationError,
  UnknownCompositionError,
  validateCompositionContracts,
  validateCompositionDefinition,
} from "@modular-react/compositions";

import type {
  CompositionRuntimeOptions,
  CompositionInstanceRecord,
  CompositionsPluginExtension,
  CompositionsPluginOptions,
} from "@modular-react/compositions";
```

### React surface

```typescript
import {
  CompositionOutlet,
  CompositionsProvider,
  CompositionInstanceContext,
  useCompositionState,
  useCompositionDispatch,
  useCompositionEmit,
  useCompositionZone,
  useCompositionsContext,
} from "@modular-react/compositions";

import type {
  CompositionOutletProps,
  CompositionOutletNotFoundProps,
  CompositionOutletErrorProps,
  CompositionsProviderProps,
  CompositionProviderValue,
  CompositionContextValue,
} from "@modular-react/compositions";
```

## Comparison with journeys

|                                | `@modular-react/compositions`                           | `@modular-react/journeys`                              |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------ |
| **Primary use**                | Multi-module screen layout with shared state             | Multi-module stepped workflow with typed transitions   |
| **State model**                | Scoped store; selectors project state into zones        | Step + accumulated state; transitions advance step     |
| **Flow**                       | No graph — any state can produce any resolution         | Directed graph of `(step, exit) → next step`           |
| **Authoring shape**            | `defineComposition({ zones, initialState })`            | `defineJourney({ start, transitions })`                |
| **Instance id prefix**         | `ci_*`                                                  | `ji_*`                                                 |
| **Persistence blob fields**    | `state` only                                             | `state`, `step`, `history`, `rollbackSnapshots`, `future`, `parentLink` |
| **Hooks inside panels**        | `useCompositionState/Dispatch/Emit/Zone`                | `useJourneyState`, `useJourneyInstance`, `useJourneyCallStack` |
| **Outlet**                     | `CompositionOutlet` (render-prop, multi-zone)            | `JourneyOutlet` (single step, leaf-walk)               |
| **Validation**                 | Zone contracts (spot-check) + `moduleCompat`             | Reachability + transition exhaustiveness + contracts   |
| **Composition with the other** | A zone can mount `<JourneyOutlet>` via `kind: "journey"` | A journey step can render `<CompositionOutlet>` like any other component |

Choose **compositions** when the screen is a layout problem (which modules go where, sharing state). Choose **journeys** when the screen is a flow problem (do A, then B, then maybe C). They're complementary, not competing.
