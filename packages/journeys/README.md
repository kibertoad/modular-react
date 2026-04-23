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

### Versioning

Every serialized blob carries the journey's `version`. On hydrate:

- **Default (strict):** throw `JourneyHydrationError` if `blob.version !== definition.version`.
- **With `onHydrate`:** the hook receives the loaded blob and returns the blob to use (possibly after migration). Throwing from `onHydrate` aborts the hydrate.

Always supply `onHydrate` in production apps that ship new journey versions over time.

## Rendering — `JourneyOutlet`

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

## API surface

Exports from `@modular-react/journeys`:

- Authoring: `defineJourney`, `defineJourneyPersistence`.
- Rendering: `JourneyOutlet`, `ModuleTab`, `JourneyProvider`, `useJourneyContext`.
- Runtime (usually called by the registry, not directly): `createJourneyRuntime`, `getInternals`.
- Validation: `validateJourneyContracts`, `validateJourneyDefinition`, `JourneyValidationError`, `JourneyHydrationError`.
- Types: `JourneyDefinition`, `TransitionMap`, `StepSpec`, `TransitionResult`, `JourneyInstance`, `SerializedJourney`, `JourneyRuntime`, `JourneyRegisterOptions`, `JourneyPersistence`, `ModuleTypeMap`, `TransitionEvent`, `AbandonCtx`, `TerminalCtx`, `TerminalOutcome`, `InstanceId`, `JourneyStatus`, `JourneyProviderProps`, `JourneyProviderValue`.

From `@modular-react/journeys/testing`: `simulateJourney`, `JourneySimulator`.

From `@modular-react/core` (consumed by modules): `defineEntry`, `defineExit`, `schema`, `ModuleEntryProps`, `ModuleEntryPoint`, `ExitPointSchema`, `ExitFn`, `EntryPointMap`, `ExitPointMap`, `InputSchema`.

From the router runtime packages: `registry.registerJourney(...)`, `manifest.journeys`, `manifest.moduleDescriptors`, `ResolveManifestOptions.onModuleExit`.

## Example project

A complete, runnable walk-through lives at [`examples/react-router/customer-onboarding-journey/`](../../examples/react-router/customer-onboarding-journey/). It demonstrates:

- `defineEntry` / `defineExit` across three modules,
- `defineJourney` composing them with typed transitions,
- `registry.registerJourney(...)` with a localStorage persistence adapter (reload mid-flow to see recovery),
- a minimal tabbed shell mounting `<JourneyOutlet>` and `<ModuleTab>` side-by-side,
- `WorkspaceActions.openTab({ kind: 'journey', … })` as the shell-facing API.
