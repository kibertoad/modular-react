# @modular-react/journeys

Typed, serializable workflows that compose several modules. A journey declares how one module's exit feeds the next module's entry; the modules themselves stay journey-unaware — they just declare what input they accept and what outcomes they can emit.

Use this package when a domain flow spans multiple modules with **shared state** (e.g. "open the customer's account → branch into debt negotiation → collect a payment"), and you want:

- typed end-to-end module boundaries,
- serializable state so a mid-flow reload or hand-off survives,
- a single place that owns transitions, instead of cross-cutting glue inside module stores.

Routes, slots, navigation, workspaces — none of that changes. Journeys sit **on top** of the existing framework. Apps that don't register a journey incur nothing beyond the package being statically linked.

## Prerequisite reading

- [Shell Patterns (Fundamentals)](../../docs/shell-patterns.md)
- [Workspace Patterns](../../docs/workspace-patterns.md)

## Contents

- [Installation](#installation)
- [Mental model](#mental-model)
- [Quickstart](#quickstart) — the 5-step path from zero to a running journey
- [Core concepts](#core-concepts) — entries, exits, `allowBack`, lifecycle, statuses, keys
- [Authoring patterns](#authoring-patterns) — module entries, exits, loading flows, `goBack` opt-in
- [Journey definition patterns](#journey-definition-patterns) — branching, terminals, state rewrites, bounded history
- [Runtime surface](#runtime-surface) — the `JourneyRuntime` you get back from `manifest.journeys`
- [`JourneyProvider` + context](#journeyprovider--context)
- [Persistence](#persistence) — adapters, key design, save queue, hydrate vs start, versioning
- [Rendering — `JourneyOutlet`](#rendering--journeyoutlet) — props, error policies, host rules
- [Hosting plain modules — `ModuleTab`](#hosting-plain-modules--moduletab)
- [Observation hooks](#observation-hooks)
- [Testing](#testing) — module-level, pure simulator, integration, persistence adapters
- [Integration patterns](#integration-patterns) — tabs, modals, routes, wizards, command palette
- [Debugging](#debugging) — dev-mode warnings and introspection
- [Errors, races, and edge cases](#errors-races-and-edge-cases)
- [Limitations (v1)](#limitations-v1)
- [TypeScript inference notes](#typescript-inference-notes)
- [API reference](#api-reference)
- [Example projects](#example-projects)

## Installation

The journey runtime is already a transitive dependency of `@react-router-modules/runtime` and `@tanstack-react-modules/runtime`. Install it directly only when the shell needs to type against journey types (usually it does):

```bash
pnpm add @modular-react/journeys
```

Peer deps: `@modular-react/core`, `@modular-react/react`, `react`, `react-dom`.

## Mental model

Three roles, strictly separated:

| Role        | Owns                                                                                                        | Does NOT know about                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Module**  | Its entry components, input types, exit names, exit output types.                                           | Journeys. Who opens it. What comes next.             |
| **Journey** | The modules it composes (by type), transitions between entry/exit pairs, shared state.                      | Shell. Tabs. Routes.                                 |
| **Shell**   | Registering modules + journeys, mounting `<JourneyOutlet>` inside its container (tab, route, modal, panel). | Any specific journey's logic, state, or transitions. |

## Quickstart

### 1. Declare a module's entry and exit vocabulary

Modules import only from `@modular-react/core`:

```ts
// modules/account/src/exits.ts
import { defineExit } from "@modular-react/core";
import type { Debt } from "./types.js";

export const accountExits = {
  noDebtFound: defineExit<{ customerId: string }>(),
  wantsToNegotiate: defineExit<{ customerId: string; debts: Debt[] }>(),
  wantsToPayNow: defineExit<{ customerId: string; amount: number }>(),
  cancelled: defineExit(),
} as const;
export type AccountExits = typeof accountExits;
```

```tsx
// modules/account/src/ReviewAccount.tsx
import type { ModuleEntryProps } from "@modular-react/core";
import type { AccountExits } from "./exits.js";

export function ReviewAccount({
  input,
  exit,
}: ModuleEntryProps<{ customerId: string }, AccountExits>) {
  const account = useAccount(input.customerId);

  if (account.debts.length === 0) {
    return (
      <button onClick={() => exit("noDebtFound", { customerId: input.customerId })}>Done</button>
    );
  }
  return (
    <>
      <DebtSummary debts={account.debts} />
      <button
        onClick={() =>
          exit("wantsToNegotiate", { customerId: input.customerId, debts: account.debts })
        }
      >
        Negotiate
      </button>
      <button
        onClick={() =>
          exit("wantsToPayNow", { customerId: input.customerId, amount: sum(account.debts) })
        }
      >
        Collect now
      </button>
      <button onClick={() => exit("cancelled")}>Cancel</button>
    </>
  );
}
```

```ts
// modules/account/src/index.ts
import { defineModule, defineEntry, schema } from "@modular-react/core";
import { accountExits } from "./exits.js";
import { ReviewAccount } from "./ReviewAccount.js";

export default defineModule<AppDeps, AppSlots>()({
  id: "account",
  version: "1.0.0",
  exitPoints: accountExits,
  entryPoints: {
    review: defineEntry({
      component: ReviewAccount,
      input: schema<{ customerId: string }>(),
    }),
  },
});
```

The `exits` const pattern (define once, share between component typing and module descriptor) is the canonical shape. `schema<T>()` is a **type-only** brand — zero runtime work.

### 2. Declare the journey

```ts
// journeys/debt-resolution/src/journey.ts
import { defineJourney } from "@modular-react/journeys";
import type accountModule from "@myorg/module-account";
import type debtsModule from "@myorg/module-debts";
import type paymentsModule from "@myorg/module-payments";

type Modules = {
  readonly account: typeof accountModule;
  readonly debts: typeof debtsModule;
  readonly payments: typeof paymentsModule;
};

interface DebtState {
  customerId: string;
  debts: Debt[];
}

export const debtResolutionJourney = defineJourney<Modules, DebtState>()({
  id: "debt-resolution",
  version: "1.0.0",
  initialState: ({ customerId }: { customerId: string }) => ({ customerId, debts: [] }),
  start: (s) => ({ module: "account", entry: "review", input: { customerId: s.customerId } }),
  transitions: {
    account: {
      review: {
        noDebtFound: () => ({ complete: { reason: "no-debt" } }),
        wantsToNegotiate: ({ output, state }) => ({
          state: { ...state, debts: output.debts },
          next: {
            module: "debts",
            entry: "negotiate",
            input: { customerId: state.customerId, debts: output.debts },
          },
        }),
        wantsToPayNow: ({ output }) => ({
          next: {
            module: "payments",
            entry: "collect",
            input: { customerId: output.customerId, amount: output.amount },
          },
        }),
        cancelled: () => ({ abort: { reason: "agent-cancelled" } }),
      },
    },
    // …transitions for `debts` and `payments`…
  },
});
```

Module imports are `import type` — the journey never pulls a module into its bundle. Runtime resolution happens by id against the registry.

### 3. Register the journey in the shell

```ts
import { createRegistry } from "@react-router-modules/runtime"; // or @tanstack-react-modules/runtime
import { debtResolutionJourney } from "@myorg/journey-debt-resolution";

const registry = createRegistry<AppDeps, AppSlots>({ stores, services });
registry.register(accountModule);
registry.register(debtsModule);
registry.register(paymentsModule);

registry.registerJourney(debtResolutionJourney, {
  persistence: defineJourneyPersistence<DebtInput, DebtState>({
    keyFor: ({ input }) => `journey:${input.customerId}:debt-resolution`,
    load: (k) => backend.loadJourney(k),
    save: (k, b) => backend.saveJourney(k, b),
    remove: (k) => backend.deleteJourney(k),
  }),
});

export const manifest = registry.resolveManifest();
```

`registry.registerJourney` validates the definition's **structural shape** right away (missing `id` / `version` / `transitions` etc. throw a `JourneyValidationError`). The deeper **contract check** — that every module id, entry name, exit name, and `allowBack` pairing actually matches the registered modules — runs at `resolveManifest()` / `resolve()` time.

`defineJourneyPersistence<TInput, TState>` is the recommended shape for the adapter: it ties `keyFor`'s `input` to the journey's `TInput` so the `as { customerId: string }` cast goes away, and typechecks `load` / `save` against the journey's state end-to-end. Plain objects matching `JourneyPersistence` still work if you prefer.

### 4. Render the journey in a tab (or any container)

Mount a single `<JourneyProvider>` at the top of the shell so descendant outlets and module tabs can read the runtime from context — no prop threading through every container. The explicit-prop form still works as an escape hatch when you need to reach a different runtime from the same tree.

```tsx
import { JourneyProvider, JourneyOutlet, ModuleTab } from "@modular-react/journeys";

function Shell({ manifest }: { manifest: ResolvedManifest }) {
  return (
    <JourneyProvider
      runtime={manifest.journeys}
      onModuleExit={manifest.onModuleExit}
    >
      {/* tabs, routes, … */}
    </JourneyProvider>
  );
}

function TabContent({ tab, manifest }: { tab: Tab; manifest: ResolvedManifest }) {
  if (tab.kind === "module") {
    return (
      <ModuleTab
        module={manifest.moduleDescriptors[tab.moduleId]}
        entry={tab.entry}
        input={tab.input}
        tabId={tab.tabId}
        // `onModuleExit` wired on <JourneyProvider> fires for every module tab
        // automatically — no need to forward it here unless you want a
        // per-tab override.
        onExit={(ev) => workspace.closeTab(tab.tabId)}
      />
    );
  }
  return (
    <JourneyOutlet
      instanceId={tab.instanceId}
      loadingFallback={<LoadingSpinner />}
      onFinished={(outcome) => workspace.closeTab(tab.tabId)}
    />
  );
}
```

`manifest.journeys` is always a runtime — even when no journey is registered it's a no-op runtime whose `listDefinitions()` / `listInstances()` return empty and whose `start()` throws the usual "unknown journey id" error. Shells don't need to null-guard it.

### 5. Open the journey

The shell typically exposes a single `openTab` service that covers both modules and journeys:

```ts
workspace.openTab({
  kind: "journey",
  id: "debt-resolution",
  input: { customerId },
  title: `Debt resolution — ${customerName}`,
});
```

Internally that calls `manifest.journeys.start('debt-resolution', { customerId })` and stores the returned `instanceId` on the tab record. See the [customer-onboarding-journey example](../../examples/react-router/customer-onboarding-journey/) for a complete working shell.

## Core concepts

### Entry points and exit points on a module

Two additive (optional) fields on `ModuleDescriptor`:

| Field         | Shape                                           | Purpose                                                     |
| ------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `entryPoints` | `{ [name]: { component, input?, allowBack? } }` | Typed ways to open the module. A module can expose several. |
| `exitPoints`  | `{ [name]: { output? } }`                       | The module's full outcome vocabulary.                       |

`ModuleEntryProps<TInput, TExits>` typed props for the component — `{ input, exit, goBack? }`, with `exit(name, output)` cross-checked against `TExits` at compile time.

### `allowBack` — three values

Declared per entry on the module, opted-in per transition on the journey. Both must agree for `goBack` to appear.

| Value              | What happens on goBack                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `'preserve-state'` | History pops; journey state is untouched.                                                                                             |
| `'rollback'`       | History pops AND journey state reverts to the snapshot taken before this step was entered (shallow clone — treat state as immutable). |
| `false` / absent   | `goBack` is `undefined` in the component's props. Don't render the back button.                                                       |

The journey's transition map matches with `allowBack: true` on the exit block:

```ts
transitions: {
  debts: {
    negotiate: {
      allowBack: true,
      agreedPayNow: …,
    },
  },
}
```

A `resolveManifest()` error surfaces if the two sides disagree.

### Transition handlers are pure and synchronous

- No `await`.
- No React hooks.
- No store/service access.
- No side effects.

If a transition needs to fetch data between steps, put the fetch inside a dedicated loading entry point on a module — the module fetches in `useEffect` and exits with the loaded data. Side effects live in the observation hooks (`onTransition`, `onAbandon`, `onComplete`, `onAbort`), which are free to be noisy.

### Journey lifecycle

```
user triggers exit('X', output)
  → runtime checks step token matches (stale callbacks are dropped)
  → runs transition handler (pure)
  → commits state + step + history atomically
  → fires onTransition (definition first, then registration option)
  → if terminal: fires onComplete / onAbort
  → schedules persistence.save (serialized per instance)
  → JourneyOutlet re-renders with new step or terminal state
```

A step-token counter guards against double-click and stale callbacks: any `exit()` / `goBack()` captured at mount time is dropped silently if the current step has moved on.

### Instance statuses

`JourneyInstance.status` runs through four values:

| Status        | When                                                                              | `step`                  | `<JourneyOutlet>` renders          |
| ------------- | --------------------------------------------------------------------------------- | ----------------------- | ---------------------------------- |
| `'loading'`   | Async `persistence.load()` is in flight (first paint after `start()`).            | `null`                  | `loadingFallback`                  |
| `'active'`    | The normal running state — `step` points at the module/entry currently on screen. | `{ moduleId, entry, … }`| The step component                 |
| `'completed'` | Terminal. A transition returned `{ complete }`.                                   | `null`                  | `null` (after firing `onFinished`) |
| `'aborted'`   | Terminal. A transition returned `{ abort }`, the outlet unmounted, or `runtime.end` was called. | `null`   | `null` (after firing `onFinished`) |

Terminal instances stay in memory (so late subscribers can read `terminalPayload`) until you call `runtime.forget(id)` / `runtime.forgetTerminal()`.

### Keys, idempotency, and "resume vs new"

When persistence is configured, `runtime.start(journeyId, input)` is **idempotent per persistence key**: two calls with inputs that resolve to the same `keyFor` return the same `instanceId`. This is the mechanism that turns "open the Alice onboarding tab" into "resume Alice's onboarding tab" on reload — no explicit `resume()` API is needed. See [Persistence](#persistence) for the probe rules.

Without persistence, every `start()` mints a fresh instance. Two calls = two independent journeys that happen to share a journey id.

## Authoring patterns

Patterns below are small, composable recipes — most real apps use two or three of them together.

### Pattern — an exits const shared between the component and the descriptor

The canonical module shape: define exits once, consume them from the component (for a typed `exit` prop) and from the descriptor (for validation). No duplication.

```ts
// modules/account/src/exits.ts
export const accountExits = {
  done: defineExit<{ customerId: string }>(),
  cancelled: defineExit(),
} as const;
export type AccountExits = typeof accountExits;
```

```tsx
// modules/account/src/ReviewAccount.tsx
export function ReviewAccount({
  input,
  exit,
}: ModuleEntryProps<{ customerId: string }, AccountExits>) {
  /* exit('done', { customerId: input.customerId }) is type-checked */
}
```

```ts
// modules/account/src/index.ts
export default defineModule({
  id: "account",
  version: "1.0.0",
  exitPoints: accountExits,
  entryPoints: {
    review: defineEntry({ component: ReviewAccount, input: schema<{ customerId: string }>() }),
  },
});
```

Note: `defineModule` is called **without** shell-level generics in this example. That keeps the descriptor's literal type (including the narrow `entryPoints` / `exitPoints` keys) preserved so the journey definition can cross-check transitions against `typeof moduleDescriptor`. A typed shell can still enforce `AppDependencies` / `AppSlots` via `defineModule<AppDeps, AppSlots>()` at the call site if desired — the tradeoff is that the narrow entry/exit types must be recovered via `typeof` in the journey's module map either way.

### Pattern — a module exposing several entries

```ts
export default defineModule({
  id: "billing",
  version: "1.0.0",
  exitPoints: billingExits,
  entryPoints: {
    collect: defineEntry({ component: CollectPayment, input: schema<CollectInput>() }),
    startTrial: defineEntry({ component: StartTrial, input: schema<TrialInput>() }),
  },
});
```

The journey's transition map targets `{ module: 'billing', entry: 'collect' }` or `'startTrial'` — the discriminated `StepSpec` enforces that `input` matches the chosen entry.

### Pattern — a loading entry point for async work

Transitions are pure and synchronous. When a step needs to fetch data between user actions, put the fetch inside a **loading entry** on the next module; that module fires an exit with the loaded data, and the journey transitions from that exit as usual.

```tsx
// modules/risk/src/LoadRiskReport.tsx
export function LoadRiskReport({ input, exit }: ModuleEntryProps<{ customerId: string }, RiskExits>) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const report = await api.fetchRiskReport(input.customerId);
        if (!cancelled) exit("reportReady", { report });
      } catch (err) {
        if (!cancelled) exit("failed", { reason: String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [input.customerId]);

  return <LoadingSpinner label="Computing risk…" />;
}
```

```ts
// journey
transitions: {
  account: {
    review: {
      needsRiskCheck: ({ output }) => ({
        next: { module: "risk", entry: "load", input: { customerId: output.customerId } },
      }),
    },
  },
  risk: {
    load: {
      reportReady: ({ output, state }) => ({
        state: { ...state, risk: output.report },
        next: { module: "decisions", entry: "choose", input: { risk: output.report } },
      }),
      failed: ({ output }) => ({ abort: { reason: "risk-check-failed", detail: output.reason } }),
    },
  },
}
```

The cancellation flag matters: if the user clicks `goBack` before the fetch resolves, the component unmounts and the step token advances. A stale `exit('reportReady', …)` would be dropped by the runtime anyway (see [step tokens](#errors-races-and-edge-cases)), but explicit cancellation avoids the race and spurious network work.

### Pattern — optional exits (entries that don't emit every exit)

A module's `exitPoints` declares its **full** vocabulary. Individual entries don't have to emit every exit, and individual journeys don't have to handle every exit. If an entry fires an exit that has no handler in the current journey, the call is ignored and a dev-mode warning is logged — useful during refactors but usually a bug. Keep the exit vocabulary tight and prune unused exits.

### Pattern — `allowBack` on an entry, `allowBack: true` on the transition

For `goBack` to appear in the component's props, **both sides** must opt in:

```ts
// module
entryPoints: {
  choose: defineEntry({ component: ChoosePlan, input: schema<ChooseInput>(), allowBack: "preserve-state" }),
}

// journey
transitions: {
  plan: {
    choose: {
      allowBack: true,   // journey-side opt-in
      // …exit handlers…
    },
  },
}
```

Mismatched declarations are caught at `resolveManifest()` / `resolve()` time via `validateJourneyContracts` — the journey's `allowBack: true` with an entry that declared `allowBack: false` (or omitted it) is an aggregated validation error, not a runtime surprise.

## Journey definition patterns

### Pattern — branching on exit name

Most journeys branch by picking a different `next` step per exit name. `StepSpec`'s discriminated union means `input` on each branch is type-checked against the target entry:

```ts
account: {
  review: {
    wantsToNegotiate: ({ output, state }) => ({
      next: { module: "debts", entry: "negotiate", input: { customerId: state.customerId, debts: output.debts } },
    }),
    wantsToPayNow: ({ output }) => ({
      next: { module: "payments", entry: "collect", input: { customerId: output.customerId, amount: output.amount } },
    }),
  },
},
```

### Pattern — branching on state/output inside a handler

Handlers are plain functions — branch with `if` / `switch` on output or state. Return whichever `TransitionResult` makes sense.

```ts
review: {
  done: ({ output, state }) =>
    output.needsKyc
      ? { next: { module: "kyc", entry: "collect", input: { customerId: state.customerId } } }
      : { complete: { reason: "ok" } },
}
```

### Pattern — terminal with structured payload

`complete` and `abort` both take `unknown` — pass any shape you want. Consumers read it via `instance.terminalPayload` or the `outcome.payload` arg to `onFinished`.

```ts
paid: ({ output }) => ({ complete: { kind: "paid", reference: output.reference, amount: output.amount } }),
```

### Pattern — overriding `state` during a transition

Every handler is free to rewrite state:

```ts
choseStandard: ({ output, state }) => ({
  state: { ...state, selectedPlan: output.plan },
  next: { module: "billing", entry: "collect", input: { customerId: state.customerId, amount: output.plan.monthly } },
}),
```

If you omit `state`, the incoming state is preserved. Writing `state: undefined` is treated as an explicit write (for state types that allow it) — the key `"state"` being *present* is what signals intent.

### Pattern — keeping state immutable

Snapshots captured for `allowBack: 'rollback'` are **shallow clones**. Deep mutation of nested values corrupts the snapshot. Treat state as immutable — return a new object every time. In dev mode the runtime shallow-freezes the snapshot so a top-level mutation throws loudly.

### Pattern — bounded history (`maxHistory`)

Register with a cap to prevent unbounded growth in long-running journeys:

```ts
registry.registerJourney(journey, { maxHistory: 50 });
```

Caveat: a cap smaller than the deepest reachable back-chain silently breaks `goBack` past the trim point (the rollback snapshot `goBack` would restore is among the dropped entries). Size it to at least the longest user-reachable back chain, or treat it as a hard "no-one will navigate back this far" window.

## Runtime surface

`manifest.journeys` implements `JourneyRuntime`:

```ts
interface JourneyRuntime {
  /**
   * Start a fresh instance, or — if a persistence key matches a live/stored
   * active blob — return the existing instance's id. Idempotent per key.
   */
  start<TInput>(journeyId: string, input: TInput): InstanceId;

  /**
   * Explicit hydrate from a caller-supplied blob. Persistence-unlinked:
   * the hydrated instance doesn't claim a persistence key and won't be
   * saved back. Useful for read-only audit/replay views.
   */
  hydrate<TState>(journeyId: string, blob: SerializedJourney<TState>): InstanceId;

  getInstance(id: InstanceId): JourneyInstance | null;
  listInstances(): readonly InstanceId[];
  listDefinitions(): readonly JourneyDefinitionSummary[];

  /** Subscribe to changes on one instance. Returns unsubscribe. */
  subscribe(id: InstanceId, listener: () => void): () => void;

  /**
   * Force-terminate an instance. Fires `onAbandon` if still active;
   * no-op if already terminal or unknown.
   */
  end(id: InstanceId, reason?: unknown): void;

  /** Drop a terminal instance from memory. No-op on active/loading. */
  forget(id: InstanceId): void;

  /** Drop every terminal instance in one call. Returns the drop count. */
  forgetTerminal(): number;
}
```

### When to call which

| Situation                                                                             | Use                                                 |
| ------------------------------------------------------------------------------------- | --------------------------------------------------- |
| User clicks "start customer onboarding".                                              | `runtime.start(journeyId, { customerId })`          |
| Reloading the shell and restoring tabs from localStorage.                             | `runtime.start(…)` again — persistence resumes.     |
| Read-only "show me what this journey looked like in audit log #1234".                 | `runtime.hydrate(journeyId, blob)` — no persistence.|
| Shell wants to react to state changes (tab title, breadcrumb).                        | `runtime.subscribe(id, listener)`                   |
| User closes a journey tab before it completes.                                        | Let `<JourneyOutlet>` unmount — it calls `end()`.   |
| Shell explicitly cancels (e.g. "end shift").                                          | `runtime.end(id, { reason: 'end-of-shift' })`       |
| Long-running workspace accumulated finished journeys; free memory.                    | `runtime.forgetTerminal()`                          |
| After `onFinished`, prune this specific terminal instance.                            | `runtime.forget(id)`                                |

### `listDefinitions()` and `listInstances()`

Primarily useful for diagnostics, command palettes, or admin tooling. A "launch journey" picker can render `runtime.listDefinitions()` directly; a "which journeys are open for this user" debug panel can walk `runtime.listInstances()` and `getInstance(id)`.

## `JourneyProvider` + context

`JourneyProvider` supplies the runtime (and an optional `onModuleExit` fallback) to descendant `<JourneyOutlet>` and `<ModuleTab>` nodes via context. Mount it once at the top of the shell:

```tsx
<JourneyProvider runtime={manifest.journeys} onModuleExit={manifest.onModuleExit}>
  <AppRoutes />
</JourneyProvider>
```

Explicit `runtime` / `modules` props on `<JourneyOutlet>` still win — useful when a single tree needs to reach two distinct runtimes (split-screen agents, multi-tenant dashboards). `useJourneyContext()` exposes the current value (or `null` when no provider is mounted) for shells that need the runtime for non-React-rendering work — e.g. opening a new tab from a command-palette handler.

## Persistence

Plug an adapter in at registration. The preferred shape is `defineJourneyPersistence<TInput, TState>` — it types `keyFor`'s `input` against the journey's `TInput` and `load` / `save` against its `TState`, so there's no `as` cast at the call site:

```ts
import { defineJourneyPersistence } from "@modular-react/journeys";

registry.registerJourney(journey, {
  persistence: defineJourneyPersistence<DebtInput, DebtState>({
    keyFor: ({ journeyId, input }) => `journey:${input.customerId}:${journeyId}`,
    load: (key) => backend.loadJourney(key),
    save: (key, blob) => backend.saveJourney(key, blob),
    remove: (key) => backend.deleteJourney(key),
  }),
});
```

A plain object matching `JourneyPersistence<TState>` still works if you'd rather not use the helper.

Guarantees:

- **Idempotent `start`** — two `runtime.start(journeyId, input)` calls yielding the same `keyFor` return the same `instanceId`. Useful for reload recovery (same customer → same active journey). The key is namespaced internally by `journeyId`, so two journeys whose `keyFor` happens to return the same string can't alias onto the same instance.
- **Saves are serialized per instance** — at most one `save()` in flight; follow-up changes coalesce into a single pending save. Errors are logged but never block a transition.
- **Automatic cleanup of dead blobs** — when `start()` reads a terminal / corrupt / unmigrateable blob, the runtime calls `remove(key)` before minting a fresh instance. `remove` is also called when an active instance transitions to `completed` / `aborted`.
- **Bulk terminal cleanup** — `runtime.forgetTerminal()` drops every terminal instance from memory in one call. Useful for long-running workspaces that accumulate finished journeys over a session.

### Key design — picking the right `keyFor`

`keyFor({ journeyId, input })` is the **only** identity contract the runtime has with your storage. Get it right and reload recovery is automatic; get it wrong and journeys alias onto each other's state.

Common shapes:

| Scope                         | `keyFor`                                                           | Effect                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| One journey per customer      | `` `journey:${input.customerId}:${journeyId}` ``                   | Reload resumes. Opening the same customer's journey twice = same tab/instance.                          |
| One journey per session       | include a session id in `input` and the key                        | Each agent shift gets a fresh slate; different shifts don't collide.                                    |
| One journey per (customer, matter) | `` `journey:${input.customerId}:${input.matterId}:${journeyId}` `` | Supports concurrent journeys for the same customer on distinct matters.                                 |
| Strictly per start            | include a `nonce` in `input` and the key                           | Never resumes; every `start()` is a new journey. Use when the semantic is "new flow every time".        |

`keyFor` deliberately does **not** receive `instanceId` — probing happens before one exists, and mixing the two forms has historically produced subtle key mismatches.

### Sync vs async `load`

`load()` may return `SerializedJourney | null` synchronously **or** a `Promise<SerializedJourney | null>`. The runtime accommodates both:

- **Sync** (the onboarding example's localStorage adapter): the instance transitions straight from the initial state to `active` on the same tick. `<JourneyOutlet>`'s `loadingFallback` is never visible.
- **Async** (backend adapters): the instance is minted in `status: 'loading'` with state seeded from `initialState(input)` (so consumers never see `undefined` state), then either hydrated from the resolved blob or transitioned to a fresh start if the probe returns `null` / a terminal / a corrupt blob.

### Save queue

`save()` is serialized **per instance**:

- At most one `save()` in flight per instance.
- Concurrent state changes during a save coalesce into a single "next save" slot (later changes overwrite earlier pending saves).
- `remove()` on a terminal transition cancels any queued save.
- Errors are caught and logged; the instance stays in memory and continues accepting transitions.

This guarantees your backend never sees out-of-order writes for one journey, even with rapid clicks and slow IO.

### Explicit `runtime.hydrate` vs `runtime.start`

They serve different purposes:

| You want to…                                                              | Call                               |
| ------------------------------------------------------------------------- | ---------------------------------- |
| Open / resume a live journey for a user, with persistence wiring.         | `runtime.start(id, input)`         |
| Render a **read-only** audit/replay view of a stored blob.                | `runtime.hydrate(id, blob)`        |
| Inspect a completed journey from an audit log without resuming it.        | `runtime.hydrate(id, blob)` — terminal blobs are accepted here. |

`hydrate` is **persistence-unlinked**: the instance is created with no persistence key, so no save happens when its state changes (there's nothing for state to change into anyway on a terminal blob). If you genuinely want to resume a non-live blob, delete the storage record and let `start()` mint a fresh one.

### Versioning

Every serialized blob carries the journey's `version`. On hydrate:

- **Default (strict):** throw `JourneyHydrationError` if `blob.version !== definition.version`.
- **With `onHydrate`:** the hook receives the loaded blob and returns the blob to use (possibly after migration). Throwing from `onHydrate` aborts the hydrate.

Always supply `onHydrate` in production apps that ship new journey versions over time. A minimal pattern:

```ts
onHydrate: (blob) => {
  switch (blob.version) {
    case "1.0.0": return blob;
    case "0.9.0": return migrateFrom09(blob);
    default:      throw new JourneyHydrationError(`unknown version ${blob.version}`);
  }
}
```

If migration would be destructive or the blob is no longer trusted, let `onHydrate` throw — the runtime discards the blob via `persistence.remove(key)` and mints a fresh instance under the same key. That's usually preferable to resuming into a malformed state.

## Rendering — `JourneyOutlet`

### Props

```ts
interface JourneyOutletProps {
  /** Runtime override — usually inherited from <JourneyProvider>. */
  runtime?: JourneyRuntime;
  /** The instance to render. Required. */
  instanceId: InstanceId;
  /** Module descriptors override — usually inherited from the runtime. */
  modules?: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  /** Shown while status === 'loading'. */
  loadingFallback?: ReactNode;
  /** Fired once when the instance terminates. */
  onFinished?: (outcome: TerminalOutcome) => void;
  /** Error policy for the step's component. Default: 'abort'. */
  onStepError?: (err: unknown, ctx: { step: JourneyStep }) => 'abort' | 'retry' | 'ignore';
  /** Global retry cap per instance (retries do NOT reset on step change). Default: 2. */
  retryLimit?: number;
}

interface TerminalOutcome {
  status: 'completed' | 'aborted';
  payload: unknown;       // value passed to complete(…) or abort(…)
  instanceId: InstanceId;
  journeyId: string;
}
```

### Typical usage

With a `<JourneyProvider>` mounted above, `instanceId` is the only required prop:

```tsx
<JourneyOutlet
  instanceId={tab.instanceId}
  loadingFallback={<LoadingSpinner />}
  onFinished={(outcome) => {
    // outcome = { status, payload, instanceId, journeyId }
    workspace.closeTab(tab.tabId);
  }}
  onStepError={(err, { step }) => "abort" | "retry" | "ignore"}
  retryLimit={2}
/>
```

Without the provider (or when you want to point at a different runtime), pass `runtime` and optionally `modules` explicitly — they always win over context:

```tsx
<JourneyOutlet
  runtime={manifest.journeys}
  instanceId={tab.instanceId}
  modules={manifest.moduleDescriptors}
  // …
/>
```

What it does:

1. Subscribes to the instance via `useSyncExternalStore`.
2. Renders `loadingFallback` while the async persistence `load` is in flight.
3. Resolves `step.module` + `step.entry` against the module map (prop, or the one the runtime was built with) and renders its component with a freshly bound `{ input, exit, goBack? }`.
4. Wraps the step in an error boundary and applies `onStepError` policy. Retries count against `retryLimit` globally per instance (the counter does **not** reset when a retry advances the step), so a throwing component can't bypass the cap by bumping the step token.
5. Fires `onFinished` exactly once when the instance terminates; the outcome carries `{ status, payload, instanceId, journeyId }` so analytics can correlate without re-reading props.
6. On unmount while still `active` **or** `loading`, abandons the instance via `runtime.end({ reason: 'unmounted' })`. Two defenses keep the instance alive when it should stay: StrictMode's simulated mount/unmount/remount cycle (same component, same `mountedRef`) and back-to-back independent outlets that hand off to each other (checked via `record.listeners.size`).

### Error policies in depth

`onStepError` runs on every thrown error during a step's render or effects. Pick a policy per error:

| Policy     | Behavior                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `'abort'`  | Default. The outlet calls `runtime.end(id, { reason: 'component-error', error })`.                |
| `'retry'`  | Re-mount the step with a fresh React key. Counted against `retryLimit` per instance (not per step).|
| `'ignore'` | Keep the module error boundary UI in place until the user transitions away via another action.    |

The retry counter is deliberately per-instance: a step that throws, auto-retries, transitions, and the next step also throws cannot bypass the cap by resetting via a step-token bump. When you truly need per-step retries, increment `retryLimit` and live with the larger overall budget, or classify errors in `onStepError` and `'abort'` on everything except a specific retryable pattern.

### Outlet hosts — rules of thumb

- Render the outlet wherever the step should live — tab body, modal body, route element, panel, wizard card. It doesn't care.
- A tab that represents a journey should be the outlet's **only** long-lived mount. Unmounting = abandon. Don't swap an outlet for a placeholder and expect the journey to survive.
- For wizards that live inside a single always-mounted container (no tab changes), you can mount the outlet inside a `<details>` or a collapsed panel and the instance stays alive even when visually hidden.

## Hosting plain modules — `ModuleTab`

`<ModuleTab>` is the non-journey counterpart: it renders a single module entry outside a route, and forwards exits to a shell-provided callback (plus the provider-level `onModuleExit`).

### Props

```ts
interface ModuleTabProps<TInput = unknown> {
  module: ModuleDescriptor<any, any, any, any>;
  entry?: string;     // defaults to the module's sole entry when unambiguous
  input?: TInput;
  tabId?: string;     // opaque passthrough for the onExit callback
  onExit?: (event: { moduleId: string; entry: string; exit: string; output: unknown; tabId?: string }) => void;
}
```

### Behavior

- If `entry` is omitted and the module has **one** entry, it's used automatically. If it has several, an error notice is rendered asking for the `entry` prop.
- `exit(name, output)` calls `onExit` first (for the per-tab override — typically "close this tab"), then the provider-level `onModuleExit` (for analytics / global telemetry).
- When a module predates entry points and only declares a legacy `component`, `<ModuleTab>` renders that — entry/exit contracts are strictly opt-in.

```tsx
function TabContent({ tab, moduleDescriptors, workspace }: Props) {
  if (tab.kind === "module") {
    return (
      <ModuleTab
        module={moduleDescriptors[tab.moduleId]}
        entry={tab.entry}
        input={tab.input}
        tabId={tab.tabId}
        onExit={(ev) => workspace.closeTab(tab.tabId)}
      />
    );
  }
  return <JourneyOutlet instanceId={tab.instanceId} onFinished={() => workspace.closeTab(tab.tabId)} />;
}
```

## Observation hooks

```ts
defineJourney<…>()({
  onTransition: (ev)         => analytics.track('journey.step', ev),
  onAbandon:    ({ step })   => step?.module === 'payments'
    ? { abort: { reason: 'payment-abandoned' } }
    : { abort: { reason: 'abandoned' } },
  onComplete:   (ctx, result)=> analytics.track('journey.complete', { ctx, result }),
  onAbort:      (ctx, reason)=> analytics.track('journey.abort', { ctx, reason }),
  onHydrate:    (blob)       => migrateIfNeeded(blob),
});
```

`onAbandon` is the only observation hook that returns a `TransitionResult` — the runtime uses it to decide the terminal state after `runtime.end(id, reason)`. Default: `{ abort: { reason: 'abandoned' } }`. Exceptions from any hook are caught and logged; they never block the transition.

Registration options can supply an extra `onTransition` that fires after the definition's — handy when the shell wants host-level analytics without coupling it into the journey module.

## Testing

### Module-level — `renderModule({ entry, exit })`

No journey runtime involved; the `exit` callback is a test spy.

```ts
import { renderModule } from "@react-router-modules/testing"; // or @tanstack-react-modules/testing

const exit = vi.fn();
await renderModule(accountModule, {
  entry: "review",
  input: { customerId: "C-1" },
  exit,
  deps: {
    /* … */
  },
});
// assert UI, click buttons, assert exit was called with the right (name, output)
```

### Journey-level pure — `simulateJourney`

Headless. No React. Fires exits against the transition graph and exposes state / step / history / status plus a recorded `transitions` stream for assertions on analytics rules without wiring an `onTransition` by hand.

```ts
import { simulateJourney } from "@modular-react/journeys/testing";

const sim = simulateJourney(debtResolutionJourney, { customerId: "C-1" });
expect(sim.step?.moduleId).toBe("account");

sim.fireExit("wantsToNegotiate", { customerId: "C-1", debts: [{ id: "D-1", amount: 100 }] });
expect(sim.step?.moduleId).toBe("debts");
expect(sim.state.debts).toHaveLength(1);

sim.fireExit("agreedPayNow", { amount: 100 });
expect(sim.step?.moduleId).toBe("payments");

// Every transition the runtime fired since the simulator started.
expect(sim.transitions).toHaveLength(3);
expect(sim.transitions.at(-1)!.to?.moduleId).toBe("payments");
```

### Integration — `renderJourney`

Mounts `<JourneyOutlet>` inside a minimal registry.

```ts
import { renderJourney } from "@react-router-modules/testing";

const { getByText, runtime, instanceId } = renderJourney(debtResolutionJourney, {
  modules: [accountModule, debtsModule, paymentsModule],
  input: { customerId: "C-1" },
  deps: {
    /* … */
  },
});
```

### Common assertion shapes

```ts
// A journey finishes with a specific payload
sim.fireExit("paid", { reference: "PAY-123", amount: 100 });
expect(sim.status).toBe("completed");
expect(sim.state.outcome).toEqual({ kind: "paid", reference: "PAY-123", amount: 100 });

// An abandon path
sim.end({ reason: "shift-ended" });
expect(sim.status).toBe("aborted");

// goBack restores state (allowBack: 'rollback')
sim.fireExit("choseStandard", { plan: PRO });
expect(sim.state.selectedPlan).toEqual(PRO);
sim.goBack();
expect(sim.state.selectedPlan).toBeNull();

// Analytics ordering
expect(sim.transitions.map((t) => t.exit)).toEqual(["profileComplete", "choseStandard", "paid"]);
```

### Testing persistence adapters

Drive the adapter with a fake storage map:

```ts
const store = new Map<string, string>();
const persistence = defineJourneyPersistence<MyInput, MyState>({
  keyFor: ({ journeyId, input }) => `journey:${input.customerId}:${journeyId}`,
  load:   (k) => { const raw = store.get(k); return raw ? JSON.parse(raw) : null; },
  save:   (k, b) => { store.set(k, JSON.stringify(b)); },
  remove: (k) => { store.delete(k); },
});

// assert `store` entries after key transitions
```

For the full integration — including reload recovery — mount `renderJourney` with the adapter wired into registration, fire exits, then unmount + remount and check the state resumed.

## Integration patterns

Journeys are container-agnostic. Four common integration shapes:

### Pattern — tabbed workspace (recommended)

Shell maintains a list of open tabs. A tab either renders `<ModuleTab>` (plain module) or `<JourneyOutlet>` (journey). Closing a tab unmounts the outlet → abandons the journey. Completion fires `onFinished` → shell closes the tab.

```tsx
function TabContent({ tab }: { tab: Tab }) {
  if (tab.kind === "journey") {
    return (
      <JourneyOutlet
        instanceId={tab.instanceId}
        loadingFallback={<Spinner />}
        onFinished={() => workspace.closeTab(tab.tabId)}
      />
    );
  }
  return <ModuleTab module={descriptors[tab.moduleId]} entry={tab.entry} input={tab.input} tabId={tab.tabId} onExit={() => workspace.closeTab(tab.tabId)} />;
}
```

See [`examples/react-router/customer-onboarding-journey/`](../../examples/react-router/customer-onboarding-journey/) and [`examples/tanstack-router/customer-onboarding-journey/`](../../examples/tanstack-router/customer-onboarding-journey/) for end-to-end implementations.

### Pattern — modal-hosted journey

For a one-shot flow that should block the rest of the UI (KYC top-up, mandatory re-auth):

```tsx
function JourneyModal({ journeyId, input, onClose }: Props) {
  const runtime = useJourneyContext()!.runtime;
  const [instanceId] = useState(() => runtime.start(journeyId, input));

  return (
    <Dialog open onClose={onClose}>
      <JourneyOutlet
        instanceId={instanceId}
        loadingFallback={<Spinner />}
        onFinished={onClose}
      />
    </Dialog>
  );
}
```

Dismissing the dialog unmounts the outlet → `onAbandon` fires. If you'd rather persist the journey across dismissals, keep the outlet mounted inside a hidden element and toggle dialog visibility only.

### Pattern — full-page route

Mount `<JourneyOutlet>` as a route element. The journey lives as long as the user stays on that route — a route change unmounts it and abandons the instance. Combine with `runtime.hydrate(blob)` to resume from a URL-bound audit blob.

```tsx
// react-router element:
<Route path="/onboarding/:customerId" element={<OnboardingPage />} />

// OnboardingPage:
function OnboardingPage() {
  const { customerId } = useParams();
  const runtime = useJourneyContext()!.runtime;
  const [instanceId] = useState(() => runtime.start("customer-onboarding", { customerId }));
  return <JourneyOutlet instanceId={instanceId} onFinished={() => nav("/")} />;
}
```

### Pattern — embedded wizard panel

A journey driven inside an always-mounted panel (e.g. a side drawer). The outlet stays mounted even when the panel is collapsed — the instance survives toggle.

```tsx
<aside style={{ display: collapsed ? "none" : "block" }}>
  <JourneyOutlet instanceId={instanceId} />
</aside>
```

Only unmount the outlet when you truly want to abandon.

### Pattern — command-palette launcher

No extra React — the runtime is accessible anywhere via `useJourneyContext()` or a shell-level reference. Command handlers call `runtime.start(…)` and the shell's tab service mounts the outlet:

```ts
palette.register("onboarding:start", async ({ customerId }) => {
  workspace.openTab({ kind: "journey", id: "customer-onboarding", input: { customerId } });
});
```

## Debugging

The runtime enables dev-mode logs automatically when `process.env.NODE_ENV !== 'production'`. Signals to watch for:

| Message                                                                                                   | Meaning                                                                                                                         |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Stale exit("X") dropped on instance <id>`                                                                | A captured `exit` callback fired after the step advanced. Expected after double-clicks; suspicious if it floods the console.    |
| `No transition for exit("X") on <module>.<entry>`                                                         | The component fired an exit the journey doesn't map. Usually a missing transition handler, or a refactor left a dead exit.     |
| `Transition handler for <module>.<entry>."X" returned a Promise`                                          | A handler returned a thenable — illegal. The runtime aborts the journey. Move async into a loading entry.                       |
| `Journey "<id>" declares allowBack for <module>.<entry> but the runtime was created without the module…` | `createJourneyRuntime` was called without `modules` wired, so the back button can't be resolved. Use the registry-built runtime. |
| `onTransition / onAbandon / onComplete / onAbort threw`                                                   | Observation hook exception. Caught; the transition still commits. Fix the hook.                                                 |
| `persistence.load / save / remove rejected / threw`                                                       | Storage error. Transitions continue in memory; the last good blob stays on disk.                                                |
| `hydrate after async load failed`                                                                         | Stored blob could not be hydrated (version mismatch without migrator, rollbackSnapshots length mismatch). The runtime discards the blob and starts fresh. |

To introspect a running journey by hand:

```ts
const runtime = manifest.journeys;
const ids = runtime.listInstances();
for (const id of ids) {
  const inst = runtime.getInstance(id);
  console.log(id, inst?.status, inst?.step, inst?.history.length);
}
```

For a fully-headless trace, drive a scenario through `simulateJourney` and inspect `sim.transitions`.

## Errors, races, and edge cases

- **Two exits in rapid succession** — step tokens guarantee the first wins; later calls are dropped.
- **Exit fired from an unmounted component** — same mechanism: token mismatch, drop.
- **Component throws during render or effect** — wrapped in an error boundary; `onStepError` decides (`'abort' | 'retry' | 'ignore'`). `'retry'` is capped by `retryLimit` (default 2) counted globally per instance; a throwing step that advances into another throwing step cannot reset the budget.
- **Async transition handler** — illegal. A handler that returns a `Promise` aborts the journey with `{ reason: 'transition-returned-promise' }` and logs an error in dev. Put async work inside a loading entry point on a module instead.
- **User closes the tab mid-journey** — `JourneyOutlet` unmounts → `runtime.end(id, { reason: 'unmounted' })` → `onAbandon` fires → instance becomes `aborted`. If the unmount happens while the instance is still in `loading` (persistence probe hasn't settled), the instance is transitioned straight to `aborted` without firing `onAbandon` — the journey never actually started.
- **Same journey, same persistence key, different input** — the persisted blob wins. The new input is discarded. Apps that want new inputs to reset should `runtime.end(oldId)` (and optionally clear the persistence key) first, or include a nonce in the key.
- **Terminal or corrupt persisted blob** — `start()` deletes it via `persistence.remove(key)` before minting a fresh instance, so stale blobs don't pile up in storage across reloads.
- **Hydrate blob whose `rollbackSnapshots` length disagrees with `history`** — rejected with `JourneyHydrationError`. Use `onHydrate` to migrate or pad the blob.
- **Duplicate `instanceId` on hydrate** — `runtime.hydrate()` throws if an instance with that id is already live. Call `forget(id)` first if the replace-in-place is intentional.
- **Circular transitions** — allowed; `history` grows. Long-running journeys should use `maxHistory` or be designed to terminate.

## Limitations (v1)

These are intentional and documented so you know what's out of scope today.

- Transitions are synchronous and pure. Async lives inside modules.
- History grows unbounded by default. Set `maxHistory` at registration or terminate the journey.
- **`maxHistory` and `allowBack` interact.** A cap smaller than the deepest reachable back chain silently loses the rollback snapshot that `goBack` would restore — the trim drops oldest entries including their snapshots. Size the cap to at least the longest user-reachable back chain if you need both.
- Exit vocabulary is module-level, not per-entry. Transitions decide which exits a given entry actually uses.
- No URL reflection of journey state — journeys are route-agnostic. Deep-linking into mid-journey steps is an app-level concern (read URL → `runtime.hydrate` → mount outlet).
- No sub-journeys in v1. Branches only.
- Rollback snapshots are **shallow clones**. Deep mutation of nested state still corrupts snapshots — treat state as immutable. In development the runtime shallow-freezes each captured snapshot, so a top-level mutation throws immediately; deep mutation still slips through.
- No built-in runtime input validation. `schema<T>()` is type-only. Wire zod/valibot yourself where it matters.

## TypeScript inference notes

The journey type surface is designed so a handful of explicit generics produce end-to-end checking across modules, journey, and persistence. A few things to know:

### `defineJourney` is curried

```ts
export const journey = defineJourney<MyModules, MyState>()({
  initialState: (input: { customerId: string }) => ({ /* … */ }),
  // ^^^^^ TInput is inferred from `initialState`'s parameter
});
```

`TModules` and `TState` are supplied explicitly; `TInput` is inferred from `initialState` so you don't repeat the shape. If you ever need to constrain `TInput` explicitly (e.g. for a shared starter-input type), annotate the `initialState` parameter.

### The module type map is per-journey, not global

```ts
type OnboardingModules = {
  readonly profile: typeof profileModule;
  readonly plan:    typeof planModule;
  readonly billing: typeof billingModule;
};
```

All imports are `import type` — modules are **not** pulled into the journey's bundle. Don't hoist a shared `AppModules` across every journey in the app: unrelated journeys pay each other's type-check cost and churn together on unrelated changes.

### `StepSpec` is a discriminated union

`StepSpec<TModules>` expands to `{ module: 'profile'; entry: 'review'; input: {…} } | { module: 'plan'; entry: 'choose'; input: {…} } | …`. Every transition result that returns `{ next: … }` narrows the `input` type against the target entry. You cannot type-check your way into passing a wrong-shaped input — but only if the modules in the type map expose narrow `entryPoints` / `exitPoints` literals (i.e. the module descriptor was typed via `const` + `as const` or via `defineModule` called without shell-level generics — the canonical authoring pattern in [Authoring patterns](#authoring-patterns)).

### `schema<T>()` is a type brand, not a validator

```ts
input: schema<{ customerId: string }>()
```

Returns an empty object whose type carries `T`. Zero runtime cost and zero validation. For runtime validation, wire zod/valibot inside the component (or at the `workspace.openTab` boundary) until `validateInput` lands in core.

### `defineJourneyPersistence<TInput, TState>` ties the adapter to the journey

```ts
const persistence = defineJourneyPersistence<OnboardingInput, OnboardingState>({
  keyFor: ({ input }) => `journey:${input.customerId}:onboarding`, // input typed as OnboardingInput
  save:   (k, b) => api.save(k, b),                                // b typed as SerializedJourney<OnboardingState>
  load:   (k)    => api.load(k),
  remove: (k)    => api.remove(k),
});
```

Without the helper, `input` on `keyFor` is `unknown`; with it, every callback is end-to-end typed.

## API reference

Every export you're likely to call, grouped by role.

### From `@modular-react/core` (module authors)

| Export                 | Signature                                                                                                                                      | Purpose                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `defineEntry`          | `<T>(e: ModuleEntryPoint<T>) => ModuleEntryPoint<T>`                                                                                           | Identity helper for an entry-point literal. Zero runtime cost.            |
| `defineExit`           | `<T = void>(s?: ExitPointSchema<T>) => ExitPointSchema<T>`                                                                                     | Identity helper for an exit-point literal. Zero runtime cost.             |
| `schema`               | `<T>() => InputSchema<T>`                                                                                                                      | Type-only brand used to carry an input/output shape. Zero runtime cost.   |
| `ModuleEntryProps`     | `<TInput, TExits extends ExitPointMap = {}>`                                                                                                   | Typed props for an entry component: `{ input, exit, goBack? }`.           |
| `ModuleEntryPoint`     | `{ component, input?, allowBack? }`                                                                                                            | Entry-point descriptor shape.                                             |
| `ExitPointSchema`      | `{ output? }`                                                                                                                                  | Exit-point descriptor shape.                                              |
| `ExitFn`               | `<TExits>(name, output?) => void`                                                                                                              | The function signature `exit` gets on an entry component.                 |
| `EntryPointMap` / `ExitPointMap` | `Record<string, ModuleEntryPoint<any>>` / `Record<string, ExitPointSchema<any>>`                                                     | Map shapes on `ModuleDescriptor`.                                         |

### Authoring (`@modular-react/journeys`)

| Export                       | Signature                                                                                                                         | Purpose                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `defineJourney`              | `<TModules, TState>() => <TInput>(def: JourneyDefinition<TModules, TState, TInput>) => def`                                       | Identity helper with full inference on transitions and state. Curried so `TInput` infers from `initialState`. |
| `defineJourneyPersistence`   | `<TInput, TState>(adapter) => JourneyPersistence<TState>`                                                                         | Types `keyFor`'s `input` against `TInput`, `load`/`save` against `TState`.                              |

### Rendering + context (`@modular-react/journeys`)

| Export               | Purpose                                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JourneyProvider`    | Context provider for the runtime and optional `onModuleExit`. Mount once at the shell root.                                                                                                          |
| `useJourneyContext`  | Reads the current provider value, or `null`.                                                                                                                                                         |
| `JourneyOutlet`      | Renders the current step of a journey instance. Handles loading, error boundary, terminal, and abandon-on-unmount.                                                                                   |
| `ModuleTab`          | Renders a single module entry outside a route. Non-journey counterpart to `JourneyOutlet`.                                                                                                           |

### Runtime + validation (`@modular-react/journeys`)

| Export                        | Purpose                                                                                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createJourneyRuntime`        | Low-level runtime factory. Normally called by the registry; exported for advanced use (test harnesses, custom hosts).                                            |
| `getInternals`                | Internals accessor for `<JourneyOutlet>`-style hosts that need to bind step callbacks directly. Stable surface but rarely needed — the outlet uses it.           |
| `validateJourneyContracts`    | Cross-checks a journey's transitions against registered modules. Runs automatically at `resolveManifest()` / `resolve()`; exported for custom validation flows.  |
| `validateJourneyDefinition`   | Structural sanity check on a definition's own shape. Runs automatically in `registerJourney`.                                                                    |
| `JourneyValidationError`      | Aggregated validation error. `.issues: readonly string[]`.                                                                                                       |
| `JourneyHydrationError`       | Thrown from `hydrate` / async-load when the blob is unusable.                                                                                                    |

### Runtime methods (the `JourneyRuntime` returned as `manifest.journeys`)

| Method                                        | Description                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `start(journeyId, input)`                     | Start or resume an instance. Idempotent per persistence key. Returns `InstanceId`.                            |
| `hydrate(journeyId, blob)`                    | Explicit read-only hydrate. Persistence-unlinked. Returns `InstanceId`.                                       |
| `getInstance(id)`                             | Current snapshot of an instance, or `null`. Stable-identity between changes (for `useSyncExternalStore`).     |
| `listInstances()` / `listDefinitions()`       | Enumerate. Useful for admin tooling.                                                                          |
| `subscribe(id, listener)`                     | Subscribe to change notifications for one instance. Returns unsubscribe.                                      |
| `end(id, reason?)`                            | Force-terminate. Fires `onAbandon` if active; treats `loading` as a direct abort without firing `onAbandon`.  |
| `forget(id)` / `forgetTerminal()`             | Drop terminal instances from memory. `forget` is a no-op on active/loading; `forgetTerminal` batches them all.|

### Registration options (passed to `registry.registerJourney`)

```ts
interface JourneyRegisterOptions<TState = unknown> {
  onTransition?: (ev: TransitionEvent) => void;
  persistence?:  JourneyPersistence<TState>;
  maxHistory?:   number;
}
```

### Serialized shape (persistence)

```ts
interface SerializedJourney<TState> {
  definitionId: string;
  version:      string;
  instanceId:   string;
  status:       'active' | 'completed' | 'aborted';
  step:         { moduleId: string; entry: string; input: unknown } | null;
  history:      ReadonlyArray<{ moduleId: string; entry: string; input: unknown }>;
  /** Index-aligned with `history`; `null` for entries without a rollback snapshot. */
  rollbackSnapshots?: ReadonlyArray<TState | null>;
  /** Present only on terminal blobs — mirrors the transition's `complete`/`abort` payload. */
  terminalPayload?: unknown;
  state:       TState;
  startedAt:   string;
  updatedAt:   string;
}
```

### Testing (`@modular-react/journeys/testing`)

| Export               | Purpose                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `simulateJourney`    | Headless simulator: fires exits / goBack, exposes `step` / `state` / `history` / `status` / `transitions`, no React.            |
| `JourneySimulator`   | Type for the object returned by `simulateJourney`.                                                                              |

### From the router runtime packages

| Export                                           | Purpose                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `registry.registerJourney(def, options?)`        | Adds a journey to the registry. Structural check runs immediately; contract check at resolve time.             |
| `manifest.journeys`                              | The `JourneyRuntime` bound to the resolved registry. Always non-null (no-op when no journey is registered).    |
| `manifest.moduleDescriptors`                     | Map of module id → descriptor. Consumed by `<ModuleTab>` and by any code rendering a module entry directly.    |
| `ResolveManifestOptions.onModuleExit`            | Shell-level fallback for module exits fired through `<ModuleTab>`. Wire to analytics or global tab-close.      |

### Exported types (for annotations and adapters)

`JourneyDefinition`, `TransitionMap`, `EntryTransitions`, `StepSpec`, `TransitionResult`, `ExitCtx`, `JourneyInstance`, `JourneyStatus`, `JourneyStep`, `SerializedJourney`, `JourneyRuntime`, `JourneyRegisterOptions`, `JourneyPersistence`, `ModuleTypeMap`, `EntryInputOf`, `EntryNamesOf`, `ExitNamesOf`, `ExitOutputOf`, `TransitionEvent`, `AbandonCtx`, `TerminalCtx`, `TerminalOutcome`, `InstanceId`, `AnyJourneyDefinition`, `RegisteredJourney`, `MaybePromise`, `JourneyProviderProps`, `JourneyProviderValue`, `JourneyOutletProps`, `JourneyStepErrorPolicy`, `ModuleTabProps`, `ModuleTabExitEvent`.

## Example projects

Complete, runnable walk-throughs live under `examples/`:

- [`examples/react-router/customer-onboarding-journey/`](../../examples/react-router/customer-onboarding-journey/) — React Router integration.
- [`examples/tanstack-router/customer-onboarding-journey/`](../../examples/tanstack-router/customer-onboarding-journey/) — TanStack Router integration with the same modules and journey.

Each example demonstrates:

- `defineEntry` / `defineExit` across three modules (profile, plan, billing).
- `defineJourney` composing them with typed transitions and a shared state.
- `registry.registerJourney(...)` with a localStorage persistence adapter — reload the page mid-flow and the tab resumes at the last step.
- A minimal tabbed shell mounting `<JourneyOutlet>` and `<ModuleTab>` side-by-side.
- `WorkspaceActions.openTab({ kind: 'journey', … })` as the shell-facing API, with `openModuleTab` kept as a `@deprecated` shim.
