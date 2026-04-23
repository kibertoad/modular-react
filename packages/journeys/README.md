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

| Role | Owns | Does NOT know about |
| --- | --- | --- |
| **Module** | Its entry components, input types, exit names, exit output types. | Journeys. Who opens it. What comes next. |
| **Journey** | The modules it composes (by type), transitions between entry/exit pairs, shared state. | Shell. Tabs. Routes. |
| **Shell** | Registering modules + journeys, mounting `<JourneyOutlet>` inside its container (tab, route, modal, panel). | Any specific journey's logic, state, or transitions. |

## Quickstart

### 1. Declare a module's entry and exit vocabulary

Modules import only from `@modular-react/core`:

```ts
// modules/account/src/exits.ts
import { defineExit } from '@modular-react/core';
import type { Debt } from './types.js';

export const accountExits = {
  noDebtFound:      defineExit<{ customerId: string }>(),
  wantsToNegotiate: defineExit<{ customerId: string; debts: Debt[] }>(),
  wantsToPayNow:    defineExit<{ customerId: string; amount: number }>(),
  cancelled:        defineExit(),
} as const;
export type AccountExits = typeof accountExits;
```

```tsx
// modules/account/src/ReviewAccount.tsx
import type { ModuleEntryProps } from '@modular-react/core';
import type { AccountExits } from './exits.js';

export function ReviewAccount({
  input,
  exit,
}: ModuleEntryProps<{ customerId: string }, AccountExits>) {
  const account = useAccount(input.customerId);

  if (account.debts.length === 0) {
    return <button onClick={() => exit('noDebtFound', { customerId: input.customerId })}>Done</button>;
  }
  return (
    <>
      <DebtSummary debts={account.debts} />
      <button onClick={() => exit('wantsToNegotiate', { customerId: input.customerId, debts: account.debts })}>
        Negotiate
      </button>
      <button onClick={() => exit('wantsToPayNow', { customerId: input.customerId, amount: sum(account.debts) })}>
        Collect now
      </button>
      <button onClick={() => exit('cancelled')}>Cancel</button>
    </>
  );
}
```

```ts
// modules/account/src/index.ts
import { defineModule, defineEntry, schema } from '@modular-react/core';
import { accountExits } from './exits.js';
import { ReviewAccount } from './ReviewAccount.js';

export default defineModule<AppDeps, AppSlots>()({
  id: 'account',
  version: '1.0.0',
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
import { defineJourney } from '@modular-react/journeys';
import type accountModule  from '@myorg/module-account';
import type debtsModule    from '@myorg/module-debts';
import type paymentsModule from '@myorg/module-payments';

type Modules = {
  readonly account:  typeof accountModule;
  readonly debts:    typeof debtsModule;
  readonly payments: typeof paymentsModule;
};

interface DebtState {
  customerId: string;
  debts: Debt[];
}

export const debtResolutionJourney = defineJourney<Modules, DebtState>()({
  id: 'debt-resolution',
  version: '1.0.0',
  initialState: ({ customerId }: { customerId: string }) => ({ customerId, debts: [] }),
  start:        (s) => ({ module: 'account', entry: 'review', input: { customerId: s.customerId } }),
  transitions: {
    account: {
      review: {
        noDebtFound:      () => ({ complete: { reason: 'no-debt' } }),
        wantsToNegotiate: ({ output, state }) => ({
          state: { ...state, debts: output.debts },
          next:  { module: 'debts', entry: 'negotiate', input: { customerId: state.customerId, debts: output.debts } },
        }),
        wantsToPayNow:    ({ output }) => ({
          next: { module: 'payments', entry: 'collect', input: { customerId: output.customerId, amount: output.amount } },
        }),
        cancelled:        () => ({ abort: { reason: 'agent-cancelled' } }),
      },
    },
    // …transitions for `debts` and `payments`…
  },
});
```

Module imports are `import type` — the journey never pulls a module into its bundle. Runtime resolution happens by id against the registry.

### 3. Register the journey in the shell

```ts
import { createRegistry } from '@react-router-modules/runtime'; // or @tanstack-react-modules/runtime
import { debtResolutionJourney } from '@myorg/journey-debt-resolution';

const registry = createRegistry<AppDeps, AppSlots>({ stores, services });
registry.register(accountModule);
registry.register(debtsModule);
registry.register(paymentsModule);

registry.registerJourney(debtResolutionJourney, {
  persistence: {
    keyFor: ({ input }) => `journey:${(input as { customerId: string }).customerId}:debt-resolution`,
    load:   (k) => backend.loadJourney(k),
    save:   (k, b) => backend.saveJourney(k, b),
    remove: (k) => backend.deleteJourney(k),
  },
});

export const manifest = registry.resolveManifest();
```

`registry.registerJourney` stores the definition as-is. It is validated against the registered modules at `resolveManifest()` / `resolve()` time — missing module ids, entry names, exit names, and `allowBack` mismatches all surface as a single aggregated `JourneyValidationError`.

### 4. Render the journey in a tab (or any container)

```tsx
import { JourneyOutlet, ModuleTab } from '@modular-react/journeys';

function TabContent({ tab, manifest }: { tab: Tab; manifest: ResolvedManifest }) {
  if (tab.kind === 'module') {
    return (
      <ModuleTab
        module={manifest.moduleDescriptors[tab.moduleId]}
        entry={tab.entry}
        input={tab.input}
        tabId={tab.tabId}
        onExit={(ev) => { workspace.closeTab(tab.tabId); manifest.onModuleExit?.(ev); }}
      />
    );
  }
  return (
    <JourneyOutlet
      runtime={manifest.journeys!}
      instanceId={tab.instanceId}
      modules={manifest.moduleDescriptors}
      loadingFallback={<LoadingSpinner />}
      onFinished={() => workspace.closeTab(tab.tabId)}
    />
  );
}
```

### 5. Open the journey

The shell typically exposes a single `openTab` service that covers both modules and journeys:

```ts
workspace.openTab({
  kind: 'journey',
  id: 'debt-resolution',
  input: { customerId },
  title: `Debt resolution — ${customerName}`,
});
```

Internally that calls `manifest.journeys.start('debt-resolution', { customerId })` and stores the returned `instanceId` on the tab record. See the [customer-onboarding-journey example](../../examples/react-router/customer-onboarding-journey/) for a complete working shell.

## Core concepts

### Entry points and exit points on a module

Two additive (optional) fields on `ModuleDescriptor`:

| Field | Shape | Purpose |
| --- | --- | --- |
| `entryPoints` | `{ [name]: { component, input?, allowBack? } }` | Typed ways to open the module. A module can expose several. |
| `exitPoints` | `{ [name]: { output? } }` | The module's full outcome vocabulary. |

`ModuleEntryProps<TInput, TExits>` typed props for the component — `{ input, exit, goBack? }`, with `exit(name, output)` cross-checked against `TExits` at compile time.

### `allowBack` — three values

Declared per entry on the module, opted-in per transition on the journey. Both must agree for `goBack` to appear.

| Value | What happens on goBack |
| --- | --- |
| `'preserve-state'` | History pops; journey state is untouched. |
| `'rollback'` | History pops AND journey state reverts to the snapshot taken before this step was entered (shallow clone — treat state as immutable). |
| `false` / absent | `goBack` is `undefined` in the component's props. Don't render the back button. |

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

Plug an adapter in at registration:

```ts
registry.registerJourney(journey, {
  persistence: {
    keyFor: ({ journeyId, input }) => string,
    load:   (key) => MaybePromise<SerializedJourney | null>,
    save:   (key, blob) => MaybePromise<void>,
    remove: (key) => MaybePromise<void>,
  },
});
```

Guarantees:

- **Idempotent `start`** — two `runtime.start(journeyId, input)` calls yielding the same `keyFor` return the same `instanceId`. Useful for reload recovery (same customer → same active journey).
- **Saves are serialized per instance** — at most one `save()` in flight; follow-up changes coalesce into a single pending save. Errors are logged but never block a transition.
- **Terminal cleanup** — `remove` is called once the instance reaches `completed` / `aborted`.

### Versioning

Every serialized blob carries the journey's `version`. On hydrate:

- **Default (strict):** throw `JourneyHydrationError` if `blob.version !== definition.version`.
- **With `onHydrate`:** the hook receives the loaded blob and returns the blob to use (possibly after migration). Throwing from `onHydrate` aborts the hydrate.

Always supply `onHydrate` in production apps that ship new journey versions over time.

## Rendering — `JourneyOutlet`

```tsx
<JourneyOutlet
  runtime={manifest.journeys}
  instanceId={tab.instanceId}
  modules={manifest.moduleDescriptors}
  loadingFallback={<LoadingSpinner />}
  onFinished={(outcome) => {
    // outcome = { status: 'completed' | 'aborted', payload: unknown }
    workspace.closeTab(tab.tabId);
  }}
  onStepError={(err, { step }) => 'abort' | 'retry' | 'ignore'}
  retryLimit={2}
/>
```

What it does:

1. Subscribes to the instance via `useSyncExternalStore`.
2. Renders `loadingFallback` while the async persistence `load` is in flight.
3. Resolves `step.module` + `step.entry` against `modules` and renders its component with a freshly bound `{ input, exit, goBack? }`.
4. Wraps the step in an error boundary and applies `onStepError` policy.
5. Fires `onFinished` exactly once when the instance terminates.
6. On unmount while still active, abandons the instance via `runtime.end({ reason: 'unmounted' })` — StrictMode's simulated mount/unmount/remount cycle is handled correctly.

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
import { renderModule } from '@react-router-modules/testing'; // or @tanstack-react-modules/testing

const exit = vi.fn();
await renderModule(accountModule, {
  entry: 'review',
  input: { customerId: 'C-1' },
  exit,
  deps: { /* … */ },
});
// assert UI, click buttons, assert exit was called with the right (name, output)
```

### Journey-level pure — `simulateJourney`

Headless. No React. Fires exits against the transition graph and exposes state / step / history / status for assertions.

```ts
import { simulateJourney } from '@modular-react/journeys/testing';

const sim = simulateJourney(debtResolutionJourney, { customerId: 'C-1' });
expect(sim.step?.moduleId).toBe('account');

sim.fireExit('wantsToNegotiate', { customerId: 'C-1', debts: [{ id: 'D-1', amount: 100 }] });
expect(sim.step?.moduleId).toBe('debts');
expect(sim.state.debts).toHaveLength(1);

sim.fireExit('agreedPayNow', { amount: 100 });
expect(sim.step?.moduleId).toBe('payments');
```

### Integration — `renderJourney`

Mounts `<JourneyOutlet>` inside a minimal registry.

```ts
import { renderJourney } from '@react-router-modules/testing';

const { getByText, runtime, instanceId } = renderJourney(debtResolutionJourney, {
  modules: [accountModule, debtsModule, paymentsModule],
  input: { customerId: 'C-1' },
  deps: { /* … */ },
});
```

## Errors, races, and edge cases

- **Two exits in rapid succession** — step tokens guarantee the first wins; later calls are dropped.
- **Exit fired from an unmounted component** — same mechanism: token mismatch, drop.
- **Component throws during render or effect** — wrapped in an error boundary; `onStepError` decides (`'abort' | 'retry' | 'ignore'`). `'retry'` is capped by `retryLimit` (default 2) before falling back to `abort`.
- **User closes the tab mid-journey** — `JourneyOutlet` unmounts → `runtime.end(id, { reason: 'unmounted' })` → `onAbandon` fires → instance becomes `aborted`.
- **Same journey, same persistence key, different input** — the persisted blob wins. The new input is discarded. Apps that want new inputs to reset should `runtime.end(oldId)` (and optionally clear the persistence key) first, or include a nonce in the key.
- **Circular transitions** — allowed; `history` grows. Long-running journeys should use `maxHistory` or be designed to terminate.

## Limitations (v1)

These are intentional and documented so you know what's out of scope today.

- Transitions are synchronous and pure. Async lives inside modules.
- History grows unbounded by default. Set `maxHistory` at registration or terminate the journey.
- Exit vocabulary is module-level, not per-entry. Transitions decide which exits a given entry actually uses.
- No URL reflection of journey state — journeys are route-agnostic. Deep-linking into mid-journey steps is an app-level concern (read URL → `runtime.hydrate` → mount outlet).
- No sub-journeys in v1. Branches only.
- Rollback snapshots are **shallow clones**. Deep mutation of nested state still corrupts snapshots — treat state as immutable.
- No built-in runtime input validation. `schema<T>()` is type-only. Wire zod/valibot yourself where it matters.

## API surface

Exports from `@modular-react/journeys`:

- Authoring: `defineJourney`.
- Rendering: `JourneyOutlet`, `ModuleTab`.
- Runtime (usually called by the registry, not directly): `createJourneyRuntime`, `getInternals`.
- Validation: `validateJourneyContracts`, `validateJourneyDefinition`, `JourneyValidationError`, `JourneyHydrationError`.
- Types: `JourneyDefinition`, `TransitionMap`, `StepSpec`, `TransitionResult`, `JourneyInstance`, `SerializedJourney`, `JourneyRuntime`, `JourneyRegisterOptions`, `JourneyPersistence`, `ModuleTypeMap`, `TransitionEvent`, `AbandonCtx`, `TerminalCtx`, `TerminalOutcome`, `InstanceId`, `JourneyStatus`.

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
