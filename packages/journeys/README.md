# @modular-react/journeys

Typed, serializable workflows that compose several modules. A journey declares how one module's exit feeds the next module's entry; the modules themselves stay journey-unaware - they just declare what input they accept and what outcomes they can emit.

Use this package when a domain flow spans multiple modules with **shared state** (e.g. "confirm the customer's profile → branch into plan selection → collect a payment or activate a free trial"), and you want:

- typed end-to-end module boundaries,
- serializable state so a mid-flow reload or hand-off survives,
- a single place that owns transitions, instead of cross-cutting glue inside module stores.

Routes, slots, navigation, workspaces - none of that changes. Journeys sit **on top** of the existing framework. Apps that don't register a journey incur nothing beyond the package being statically linked.

## Prerequisite reading

- [Shell Patterns (Fundamentals)](../../docs/shell-patterns.md)
- [Workspace Patterns](../../docs/workspace-patterns.md)

## Contents

- [Installation](#installation)
- [Mental model](#mental-model)
- [Quickstart shortcut: scaffold the journey package](#quickstart-shortcut-scaffold-the-journey-package) - `create journey` if you bootstrapped with the modular-react CLI
- [Quickstart](#quickstart) - the 5-step path from zero to a running journey
- [Core concepts](#core-concepts) - entries, exits, `allowBack`, lifecycle, statuses, keys
- [Authoring patterns](#authoring-patterns) - module entries, exits, loading flows, `goBack` opt-in
- [Journey definition patterns](#journey-definition-patterns) - branching, `selectModule` dispatch, terminals, state rewrites, bounded history, module compatibility
- [Composing journeys (invoke / resume)](#composing-journeys-invoke--resume) - call out to a child journey mid-flow and resume on its outcome
  - [Cycle and recursion safety](#cycle-and-recursion-safety) - cycle / depth / undeclared-child / bounce-limit guards and how to tune them
- [Runtime surface](#runtime-surface) - the `JourneyRuntime` you get back from `manifest.journeys`
- [Journey handles](#journey-handles) - typed tokens for `runtime.start(handle, input)`
- [`JourneyProvider` + context](#journeyprovider--context)
- [Persistence](#persistence) - adapters, key design, save queue, hydrate vs start, versioning
- [Rendering - `JourneyOutlet`](#rendering--journeyoutlet) - props, error policies, host rules
- [Hosting plain modules - `ModuleTab`](#hosting-plain-modules--moduletab)
- [Observation hooks](#observation-hooks)
- [Testing](#testing) - module-level, pure simulator, integration, persistence adapters
- [Integration patterns](#integration-patterns) - tabs, modals, routes, wizards, command palette
- [Debugging](#debugging) - dev-mode warnings and introspection
- [Errors, races, and edge cases](#errors-races-and-edge-cases)
- [Limitations](#limitations)
- [TypeScript inference notes](#typescript-inference-notes)
- [API reference](#api-reference)
- [Example projects](#example-projects)

## Installation

The journey runtime is already a transitive dependency of `@react-router-modules/runtime` and `@tanstack-react-modules/runtime`. Install it directly only when the shell needs to type against journey types (usually it does):

```bash
pnpm add @modular-react/journeys
```

Peer deps: `@modular-react/core`, `@modular-react/react`, `react`, `react-dom`.

If you scaffolded your project with the modular-react CLI, you can scaffold a journey package the same way - see [§ Quickstart shortcut: scaffold the journey package](#quickstart-shortcut-scaffold-the-journey-package) below.

## Mental model

Three roles, strictly separated:

| Role        | Owns                                                                                                        | Does NOT know about                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Module**  | Its entry components, input types, exit names, exit output types.                                           | Journeys. Who opens it. What comes next.             |
| **Journey** | The modules it composes (by type), transitions between entry/exit pairs, shared state.                      | Shell. Tabs. Routes.                                 |
| **Shell**   | Registering modules + journeys, mounting `<JourneyOutlet>` inside its container (tab, route, modal, panel). | Any specific journey's logic, state, or transitions. |

## Quickstart shortcut: scaffold the journey package

If you used the modular-react CLI to bootstrap your project, you can skip writing the journey package boilerplate by hand. Run:

```bash
# React Router
npx @react-router-modules/cli create journey customer-onboarding \
  --modules profile,plan,billing --persistence

# TanStack Router
npx @tanstack-react-modules/cli create journey customer-onboarding \
  --modules profile,plan,billing --persistence
```

That generates `journeys/customer-onboarding/` with a typed `defineJourney` definition, a `defineJourneyHandle` token, type-only imports for each named module, and (with `--persistence`) a `createWebStoragePersistence` adapter at `shell/src/customer-onboarding-persistence.ts`. It also installs `journeysPlugin()` on the shell's registry and adds `registry.registerJourney(...)`. The `start` step and per-module `transitions` map are left as `// TODO` comments - fill those in by working through the steps below.

If you're not using the CLI (or you want to understand the moving parts before reaching for it), the manual walkthrough follows.

## Quickstart

### 1. Declare a module's entry and exit vocabulary

Modules import only from `@modular-react/core`:

```ts
// modules/profile/src/exits.ts
// Each key here is an *exit name* the profile module can emit. The generic on
// `defineExit<T>()` declares the `output` payload shape that exit ships. The
// journey's transition map (see step 2) keys handlers off these exact names.
import { defineExit } from "@modular-react/core";
import type { PlanHint } from "./types.js";

export const profileExits = {
  profileComplete: defineExit<{ customerId: string; hint: PlanHint }>(),
  readyToBuy: defineExit<{ customerId: string; amount: number }>(),
  needsMoreDetails: defineExit<{ customerId: string; missing: string }>(),
  cancelled: defineExit(), // no output payload
} as const;
export type ProfileExits = typeof profileExits;
```

```tsx
// modules/profile/src/ReviewProfile.tsx
import type { ModuleEntryProps } from "@modular-react/core";
import type { ProfileExits } from "./exits.js";

export function ReviewProfile({
  input,
  exit,
}: ModuleEntryProps<{ customerId: string }, ProfileExits>) {
  const customer = useCustomer(input.customerId);
  const hint = suggestPlan(customer);

  if (customer.readiness === "needs-details") {
    return (
      <button
        onClick={() =>
          exit("needsMoreDetails", {
            customerId: input.customerId,
            missing: customer.readinessDetail,
          })
        }
      >
        Flag for back-office
      </button>
    );
  }
  return (
    <>
      <ProfileSummary customer={customer} hint={hint} />
      <button onClick={() => exit("profileComplete", { customerId: input.customerId, hint })}>
        Pick a plan
      </button>
      {customer.readiness === "self-serve" && (
        <button
          onClick={() =>
            exit("readyToBuy", {
              customerId: input.customerId,
              amount: selfServeAmount(customer),
            })
          }
        >
          Skip ahead - charge now
        </button>
      )}
      <button onClick={() => exit("cancelled")}>Cancel</button>
    </>
  );
}
```

```ts
// modules/profile/src/index.ts
import { defineModule, defineEntry, schema } from "@modular-react/core";
import { profileExits } from "./exits.js";
import { ReviewProfile } from "./ReviewProfile.js";

export default defineModule({
  id: "profile", // module id - referenced by journeys as `module: "profile"`
  version: "1.0.0",
  exitPoints: profileExits, // the full exit vocabulary shared by every entry on this module
  entryPoints: {
    // Each key here is an *entry name* - a typed way to open this module.
    // Journeys reference it as `entry: "review"`.
    review: defineEntry({
      component: ReviewProfile,
      input: schema<{ customerId: string }>(), // `input` shape passed when the entry is opened
    }),
  },
});
```

The `exits` const pattern (define once, share between component typing and module descriptor) is the canonical shape. `schema<T>()` is a **type-only** brand - zero runtime work.

### 2. Declare the journey

```ts
// journeys/customer-onboarding/src/journey.ts
import { defineJourney } from "@modular-react/journeys";
import type profileModule from "@myorg/module-profile";
import type planModule from "@myorg/module-plan";
import type billingModule from "@myorg/module-billing";

type Modules = {
  readonly profile: typeof profileModule;
  readonly plan: typeof planModule;
  readonly billing: typeof billingModule;
};

interface OnboardingState {
  customerId: string;
  hint: PlanHint | null;
  selectedPlan: SubscriptionPlan | null;
}

export const customerOnboardingJourney = defineJourney<Modules, OnboardingState>()({
  id: "customer-onboarding",
  version: "1.0.0",
  initialState: ({ customerId }: { customerId: string }) => ({
    customerId,
    hint: null,
    selectedPlan: null,
  }),
  start: (s) => ({ module: "profile", entry: "review", input: { customerId: s.customerId } }),
  // The `transitions` map is nested three levels deep:
  //   1. module id   - which composed module (matches a key in `Modules` above)
  //   2. entry name  - which entry on that module the handler covers
  //   3. exit name   - which exit fired by that entry triggers the handler
  // Each leaf is a pure function returning the next step, a state rewrite,
  // a `complete`, or an `abort`.
  transitions: {
    profile: {
      // module id - matches the `profile` key in `Modules` above
      review: {
        // entry name on the `profile` module - see `entryPoints.review` in modules/profile/src/index.ts
        // Exit names below are the keys of `profileExits` declared in modules/profile/src/exits.ts.
        profileComplete: ({ output, state }) => ({
          state: { ...state, hint: output.hint },
          next: {
            module: "plan",
            entry: "choose",
            input: { customerId: state.customerId, hint: output.hint },
          },
        }),
        readyToBuy: ({ output }) => ({
          next: {
            module: "billing",
            entry: "collect",
            input: { customerId: output.customerId, amount: output.amount },
          },
        }),
        needsMoreDetails: ({ output }) => ({
          abort: { reason: "profile-incomplete", missing: output.missing },
        }),
        cancelled: () => ({ abort: { reason: "rep-cancelled" } }),
      },
    },
    // …transitions for `plan` and `billing` follow the same module -> entry -> exit shape.
  },
});
```

Module imports are `import type` - the journey never pulls a module into its bundle. Runtime resolution happens by id against the registry.

### 3. Register the journey in the shell

Attach the journeys plugin to enable `registry.registerJourney`. Without `.use(journeysPlugin())` the method isn't on the base registry:

```ts
import { createRegistry } from "@react-router-modules/runtime"; // or @tanstack-react-modules/runtime
import { journeysPlugin } from "@modular-react/journeys";
import { customerOnboardingJourney } from "@myorg/journey-customer-onboarding";

const registry = createRegistry<AppDeps, AppSlots>({ stores, services }).use(
  // Call once per registry - the plugin closes over its own registration
  // list. The optional `onModuleExit` is the shell-wide dispatcher for
  // module exits fired outside a journey step (see "`JourneyProvider` +
  // context" below).
  journeysPlugin({
    onModuleExit: (ev) => workspace.closeTab(ev.tabId),
  }),
);

registry.register(profileModule);
registry.register(planModule);
registry.register(billingModule);

// All registration options shown below are optional - a bare
// `registry.registerJourney(customerOnboardingJourney)` is valid and
// gives you an in-memory journey with no reload recovery.
registry.registerJourney(customerOnboardingJourney, {
  persistence: defineJourneyPersistence<OnboardingInput, OnboardingState>({
    keyFor: ({ input }) => `journey:${input.customerId}:customer-onboarding`,
    load: (k) => backend.loadJourney(k),
    save: (k, b) => backend.saveJourney(k, b),
    remove: (k) => backend.deleteJourney(k),
  }),
  // Cap `history` growth for long-running journeys. See the caveat in
  // [Bounded history (`maxHistory`)](#pattern--bounded-history-maxhistory).
  // maxHistory: 50,
});

export const manifest = registry.resolveManifest();
```

`registry.registerJourney` validates the definition's **structural shape** right away (missing `id` / `version` / `transitions` etc. throw a `JourneyValidationError`). The deeper **contract check** - that every module id, entry name, exit name, and `allowBack` pairing actually matches the registered modules - runs at `resolveManifest()` / `resolve()` time.

`defineJourneyPersistence<TInput, TState>` is the recommended shape for the adapter: it ties `keyFor`'s `input` to the journey's `TInput` so no `as { customerId: string }` cast is needed, and typechecks `load` / `save` against the journey's state end-to-end. Plain objects matching `JourneyPersistence` still work if you prefer.

### 4. Render the journey in a tab (or any container)

The plugin mounts `<JourneyProvider>` automatically - descendant `<JourneyOutlet>` / `<ModuleTab>` nodes read the runtime (and the plugin-level `onModuleExit`) from context with no extra wiring. Just render the outlet wherever the step should live:

```tsx
import { JourneyOutlet, ModuleTab } from "@modular-react/journeys";

function TabContent({ tab, manifest }: { tab: Tab; manifest: ResolvedManifest }) {
  if (tab.kind === "module") {
    return (
      <ModuleTab
        module={manifest.moduleDescriptors[tab.moduleId]}
        entry={tab.entry}
        input={tab.input}
        tabId={tab.tabId}
        // The plugin's `onModuleExit` fires automatically for every module
        // tab; pass `onExit` only for a per-tab override (typically "close
        // this tab").
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

If the shell needs to reach a different runtime from the same tree (multi-tenant dashboards, split-screen agents), mount an explicit `<JourneyProvider runtime={otherRuntime}>` locally - the explicit prop wins over the plugin's provider. The manual-mount path is also still how you'd wire journeys in a shell that doesn't use `@react-router-modules/runtime` / `@tanstack-react-modules/runtime` at all.

`manifest.journeys` is always a runtime - even when no journey is registered it's a no-op runtime whose `listDefinitions()` / `listInstances()` return empty and whose `start()` throws the usual "unknown journey id" error. Shells don't need to null-guard it.

### 5. Open the journey

Export a **handle** alongside the journey definition so callers can open it with a typed `input` without importing the journey's runtime code:

```ts
// journeys/customer-onboarding/src/index.ts
import { defineJourneyHandle } from "@modular-react/journeys";
export const customerOnboardingHandle = defineJourneyHandle(customerOnboardingJourney);
```

The shell (or any module) then passes the handle to `runtime.start`. Typically this lives inside an `openTab`-style service so the workspace bookkeeping and the journey start are one call-site:

```ts
// In the shell, with `manifest.journeys` in scope:
const instanceId = manifest.journeys.start(customerOnboardingHandle, { customerId });
workspace.addJourneyTab({
  instanceId,
  journeyId: customerOnboardingHandle.id,
  input: { customerId },
  title: `Onboarding - ${customerName}`,
});
```

See the [customer-onboarding-journey example](../../examples/react-router/customer-onboarding-journey/) for a complete working shell, including the dispatcher that also handles the string-id form used by plugin-contributed navbar actions.

## Core concepts

### Entry points and exit points on a module

Two additive (optional) fields on `ModuleDescriptor`:

| Field         | Shape                                           | Purpose                                                     |
| ------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `entryPoints` | `{ [name]: { component, input?, allowBack? } }` | Typed ways to open the module. A module can expose several. |
| `exitPoints`  | `{ [name]: { output? } }`                       | The module's full outcome vocabulary.                       |

`ModuleEntryProps<TInput, TExits>` typed props for the component - `{ input, exit, goBack? }`, with `exit(name, output)` cross-checked against `TExits` at compile time.

Exits are **module-level, not per-entry** - every entry on a module shares the same `exitPoints` vocabulary. The journey's transition map (not the module) decides which exits a given entry actually uses, so two entries on the same module can map the same exit name to entirely different next steps.

### `allowBack` - three values

Declared per entry on the module, opted-in per transition on the journey. Both must agree for `goBack` to appear.

| Value              | What happens on goBack                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `'preserve-state'` | History pops; journey state is untouched.                                                                                             |
| `'rollback'`       | History pops AND journey state reverts to the snapshot taken before this step was entered (shallow clone - treat state as immutable). |
| `false` / absent   | `goBack` is `undefined` in the component's props. Don't render the back button.                                                       |

The journey's transition map matches with `allowBack: true` on the exit block:

```ts
transitions: {
  plan: {                 // module id
    choose: {             // entry name on the `plan` module
      allowBack: true,    // journey-side opt-in (paired with the entry's `allowBack` declaration)
      choseStandard: …,   // exit name -> handler (omitted)
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

If a transition needs to fetch data between steps, put the fetch inside a dedicated loading entry point on a module - the module fetches in `useEffect` and exits with the loaded data. Side effects live in the observation hooks (`onTransition`, `onAbandon`, `onComplete`, `onAbort`), which are free to be noisy.

### Journey lifecycle

```text
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

| Status        | When                                                                                            | `step`                   | `<JourneyOutlet>` renders          |
| ------------- | ----------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------- |
| `'loading'`   | Async `persistence.load()` is in flight (first paint after `start()`).                          | `null`                   | `loadingFallback`                  |
| `'active'`    | The normal running state - `step` points at the module/entry currently on screen.               | `{ moduleId, entry, … }` | The step component                 |
| `'completed'` | Terminal. A transition returned `{ complete }`.                                                 | `null`                   | `null` (after firing `onFinished`) |
| `'aborted'`   | Terminal. A transition returned `{ abort }`, the outlet unmounted, or `runtime.end` was called. | `null`                   | `null` (after firing `onFinished`) |

Terminal instances stay in memory (so late subscribers can read `terminalPayload`) until you call `runtime.forget(id)` / `runtime.forgetTerminal()`.

### Keys, idempotency, and "resume vs new"

When persistence is configured, `runtime.start(journeyId, input)` is **idempotent per persistence key**: two calls with inputs that resolve to the same `keyFor` return the same `instanceId`. This is the mechanism that turns "open the Alice onboarding tab" into "resume Alice's onboarding tab" on reload - no explicit `resume()` API is needed. See [Persistence](#persistence) for the probe rules.

Without persistence, every `start()` mints a fresh instance. Two calls = two independent journeys that happen to share a journey id.

## Authoring patterns

Patterns below are small, composable recipes - most real apps use two or three of them together.

### Pattern - an exits const shared between the component and the descriptor

The canonical module shape: define exits once, consume them from the component (for a typed `exit` prop) and from the descriptor (for validation). No duplication.

```ts
// modules/profile/src/exits.ts
export const profileExits = {
  profileComplete: defineExit<{ customerId: string; hint: PlanHint }>(),
  cancelled: defineExit(),
} as const;
export type ProfileExits = typeof profileExits;
```

```tsx
// modules/profile/src/ReviewProfile.tsx
export function ReviewProfile({
  input,
  exit,
}: ModuleEntryProps<{ customerId: string }, ProfileExits>) {
  /* exit('profileComplete', { customerId: input.customerId, hint }) is type-checked */
}
```

```ts
// modules/profile/src/index.ts
export default defineModule({
  id: "profile",
  version: "1.0.0",
  exitPoints: profileExits,
  entryPoints: {
    review: defineEntry({ component: ReviewProfile, input: schema<{ customerId: string }>() }),
  },
});
```

Note: `defineModule` is called **without** shell-level generics in this example. That keeps the descriptor's literal type (including the narrow `entryPoints` / `exitPoints` keys) preserved so the journey definition can cross-check transitions against `typeof moduleDescriptor`. A typed shell can still enforce `AppDependencies` / `AppSlots` via `defineModule<AppDeps, AppSlots>()` at the call site if desired - the tradeoff is that the narrow entry/exit types must be recovered via `typeof` in the journey's module map either way.

### Pattern - a module exposing several entries

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

The journey's transition map targets `{ module: 'billing', entry: 'collect' }` or `'startTrial'` - the discriminated `StepSpec` enforces that `input` matches the chosen entry.

### Pattern - a loading entry point for async work

Transitions are pure and synchronous. When a step needs to fetch data between user actions, put the fetch inside a **loading entry** on the next module; that module fires an exit with the loaded data, and the journey transitions from that exit as usual.

```tsx
// modules/risk/src/LoadRiskReport.tsx
export function LoadRiskReport({
  input,
  exit,
}: ModuleEntryProps<{ customerId: string }, RiskExits>) {
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
// journey - same module -> entry -> exit nesting as the Quickstart example.
transitions: {
  account: {                  // `account` module id
    review: {                 // `review` entry on the account module
      needsRiskCheck: ({ output }) => ({   // exit fired by ReviewAccount when a risk check is needed
        next: { module: "risk", entry: "load", input: { customerId: output.customerId } },
      }),
    },
  },
  risk: {                     // `risk` module id
    load: {                   // `load` entry - the LoadRiskReport component shown above
      reportReady: ({ output, state }) => ({   // exit fired when the async fetch resolves
        state: { ...state, risk: output.report },
        next: { module: "decisions", entry: "choose", input: { risk: output.report } },
      }),
      failed: ({ output }) => ({ abort: { reason: "risk-check-failed", detail: output.reason } }),
    },
  },
}
```

The cancellation flag matters: if the user clicks `goBack` before the fetch resolves, the component unmounts and the step token advances. A stale `exit('reportReady', …)` would be dropped by the runtime anyway (see [step tokens](#errors-races-and-edge-cases)), but explicit cancellation avoids the race and spurious network work.

### Pattern - optional exits (entries that don't emit every exit)

A module's `exitPoints` declares its **full** vocabulary. Individual entries don't have to emit every exit, and individual journeys don't have to handle every exit. If an entry fires an exit that has no handler in the current journey, the call is ignored and a dev-mode warning is logged - useful during refactors but usually a bug. Keep the exit vocabulary tight and prune unused exits.

### Pattern - `allowBack` on an entry, `allowBack: true` on the transition

For `goBack` to appear in the component's props, **both sides** must opt in:

```ts
// module - declares the entry's back behaviour
entryPoints: {
  choose: defineEntry({ component: ChoosePlan, input: schema<ChooseInput>(), allowBack: "preserve-state" }),
}

// journey - opts that entry into back navigation
transitions: {
  plan: {                  // module id
    choose: {              // entry name on `plan` (matches the entry above)
      allowBack: true,     // journey-side opt-in
      // …exit handlers keyed by exit name…
    },
  },
}
```

Mismatched declarations are caught at `resolveManifest()` / `resolve()` time via `validateJourneyContracts` - the journey's `allowBack: true` with an entry that declared `allowBack: false` (or omitted it) is an aggregated validation error, not a runtime surprise.

## Journey definition patterns

### Pattern - branching on exit name

Most journeys branch by picking a different `next` step per exit name. `StepSpec`'s discriminated union means `input` on each branch is type-checked against the target entry:

```ts
profile: {                                    // module id
  review: {                                   // entry name on `profile`
    profileComplete: ({ output, state }) => ({   // exit name -> branch into the `plan` module
      state: { ...state, hint: output.hint },
      next: { module: "plan", entry: "choose", input: { customerId: state.customerId, hint: output.hint } },
    }),
    readyToBuy: ({ output }) => ({               // different exit -> branch into `billing` instead
      next: { module: "billing", entry: "collect", input: { customerId: output.customerId, amount: output.amount } },
    }),
  },
},
```

### Pattern - branching on state/output inside a handler

Handlers are plain functions - branch with `if` / `switch` on output or state. Return whichever `TransitionResult` makes sense.

```ts
review: {                                  // entry name (the surrounding module key is omitted for brevity)
  done: ({ output, state }) =>             // exit name fired by the `review` entry
    output.needsKyc
      ? { next: { module: "kyc", entry: "collect", input: { customerId: state.customerId } } }
      : { complete: { reason: "ok" } },
}
```

### Pattern - exhaustive state-driven module dispatch (`selectModule`)

When a transition needs to dispatch to one of N modules based on a discriminator (a value picked earlier in the flow, a kind from the previous module's output, etc.), a hand-written `switch` works but loses two things: exhaustiveness when the discriminator's union grows, and per-branch input narrowing without per-branch ceremony. `selectModule<TModules>()` collapses both into one declarative call:

```ts
import { selectModule } from "@modular-react/journeys";

const select = selectModule<IntegrationModules>();

chooser: {                                  // module id - the picker module
  pick: {                                   // entry name on `chooser` - renders the integration list
    chosen: ({ output, state }) => ({       // exit fired when the user picks an integration
      state: { ...state, selected: output.kind },
      next: select(output.kind, {
        // Each key below is a target module id; `entry` / `input` are checked against that module.
        github:     { entry: "configure", input: { workspaceId: state.workspaceId, repo: output.repo } },
        strapi:     { entry: "configure", input: { workspaceId: state.workspaceId, url: output.url } },
        contentful: { entry: "configure", input: { workspaceId: state.workspaceId, spaceId: output.spaceId } },
      }),
    }),
  },
},
```

The cases object is `Record<TKey, …>`, so adding a new value to the discriminator's union without a matching branch is a compile error. Each case's `entry` is type-narrowed against that module's `entryPoints`; `input` is checked against that entry - pasting a `strapi`-shaped input under the `github` key fails at the call site.

**Limit.** The discriminator key must equal the target module id. When they differ (e.g. `tier: "free" | "paid"` dispatching to module ids `trial-onboarding` / `billing-onboarding`), fall back to a `switch` returning `next` per branch - the helper's value is the exhaustiveness + per-branch typing, not the lookup itself.

### Pattern - fallback dispatch (`selectModuleOrDefault`)

When most discriminator values funnel into a generic module and only a few warrant their own dedicated step, use the sibling `selectModuleOrDefault` - it accepts a partial cases map plus an explicit fallback `StepSpec`:

```ts
import { selectModuleOrDefault } from "@modular-react/journeys";

const select = selectModuleOrDefault<IntegrationModules>();

chooser: {                                  // module id - the picker module
  pick: {                                   // entry name on `chooser`
    chosen: ({ output, state }) => ({       // exit fired with the chosen integration kind
      state: { ...state, selected: output.kind },
      next: select(
        output.kind,
        {
          // Keys are target module ids. Only github + strapi earn dedicated configure steps.
          github: { entry: "configure", input: { workspaceId: state.workspaceId, repo: "..." } },
          strapi: { entry: "configure", input: { workspaceId: state.workspaceId } },
        },
        // contentful, notion, future kinds - all flow through the
        // generic configure step.
        { module: "generic", entry: "configure", input: { workspaceId: state.workspaceId, kind: output.kind } },
      ),
    }),
  },
},
```

It's a separate function, not a third argument on `selectModule`, so the _exhaustive_ call site is visually distinct from the _fallback-allowed_ one - adding a third argument later can't silently disable the missing-branch compile error.

**When to prefer which.** Pick `selectModule` (exhaustive) if every discriminator value gets its own dedicated module - the missing-case error is the whole point. Pick `selectModuleOrDefault` (fallback) when you have a real catch-all module: most kinds funnel through generic shape, only a handful warrant tailored UI. A third-party plugin system that lets new integration kinds appear at runtime always wants the fallback form, since the journey can't know every kind ahead of time.

#### Pairing with slot-driven discovery

`selectModule` / `selectModuleOrDefault` plays well with the slots system for the common "chooser → specific" shape:

- Each module contributes itself to a shared slot (e.g. `slots: { integrations: [{ id: "github", label: "GitHub", … }] }`).
- The chooser module reads `useSlots<AppSlots>().integrations` and renders one row per contribution - staying agnostic of which integrations exist.
- The journey's `chosen` transition uses `selectModule(Or)` to dispatch on the picked id.

Slots drive presentation (dynamic, discoverable); the journey owns dispatch (typed, statically declared). See [`examples/react-router/integration-setup-journey/`](../../examples/react-router/integration-setup-journey/) for an end-to-end example with both forms exercised by Playwright.

### Pattern - terminal with structured payload

`complete` and `abort` both take `unknown` - pass any shape you want. Consumers read it via `instance.terminalPayload` or the `outcome.payload` arg to `onFinished`.

```ts
// `paid` here is an exit name (the surrounding `<module>: { <entry>: { … } }` keys are omitted).
paid: ({ output }) => ({ complete: { kind: "paid", reference: output.reference, amount: output.amount } }),
```

### Pattern - overriding `state` during a transition

Every handler is free to rewrite state:

```ts
// `choseStandard` is an exit name on some <module>.<entry> (keys omitted for brevity).
choseStandard: ({ output, state }) => ({
  state: { ...state, selectedPlan: output.plan },
  next: { module: "billing", entry: "collect", input: { customerId: state.customerId, amount: output.plan.monthly } },
}),
```

If you omit `state`, the incoming state is preserved. Writing `state: undefined` is treated as an explicit write (for state types that allow it) - the key `"state"` being _present_ is what signals intent.

### Pattern - keeping state immutable

Snapshots captured for `allowBack: 'rollback'` are **shallow clones**. Deep mutation of nested values corrupts the snapshot. Treat state as immutable - return a new object every time. In dev mode the runtime shallow-freezes the snapshot so a top-level mutation throws loudly.

### Pattern - bounded history (`maxHistory`)

Register with a cap to prevent unbounded growth in long-running journeys:

```ts
registry.registerJourney(journey, { maxHistory: 50 });
```

Caveat: a cap smaller than the deepest reachable back-chain silently breaks `goBack` past the trim point (the rollback snapshot `goBack` would restore is among the dropped entries). Size it to at least the longest user-reachable back chain, or treat it as a hard "no-one will navigate back this far" window.

Omitting `maxHistory`, or passing `0` or a negative number, leaves history unbounded.

### Pattern - module compatibility (`moduleCompat`)

A journey is implicitly coupled to the **exit names**, **input shapes**, and **`allowBack` semantics** of every module it references in `transitions`. When those modules ship from other teams, a backwards-incompatible bump on the other side ("we renamed `success` to `done`") would otherwise only surface at runtime — when the user actually navigated to the now-broken step.

`moduleCompat` is a registration-time guard: declare the npm-style version range your journey was authored against, and the journeys plugin checks it against each module's `version` field at `resolveManifest()` time. An incompatible deployment refuses to come up at all instead of silently breaking one user mid-flow.

```ts
defineJourney<OnboardingModules, OnboardingState>()({
  id: "customer-onboarding",
  version: "1.0.0",
  moduleCompat: {
    profile: "^1.0.0",
    plan: ">=1.5.0 <2.0.0",
    // multiple major lines accepted explicitly
    billing: "^2.0.0 || ^3.0.0",
  },
  initialState: () => ({
    /* ... */
  }),
  start: () => ({
    module: "profile",
    entry: "review",
    input: {
      /* ... */
    },
  }),
  transitions: {
    /* ... */
  },
});
```

What the validator does at `resolveManifest()` time:

| Situation                                      | Result                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| Range admits the registered module's `version` | OK.                                                                  |
| Range does not admit it                        | `JourneyValidationError` listing journey id, module, range, version. |
| Range names a module that isn't registered     | `JourneyValidationError` ("not registered").                         |
| Range string is malformed                      | `JourneyValidationError` echoing the offending input.                |
| Module's own `version` is malformed            | `JourneyValidationError` ("unparseable version").                    |

All issues are accumulated and reported in one error so a deployment with several mismatched teams sees the full list in one CI run, not one bug at a time.

**Range syntax.** A subset of npm semver: caret (`^1.2.3`), tilde (`~1.2.3`), x-range (`1.x`, `1.2.x`, `*`), comparators (`>=1.2.3`, `<2.0.0`, `=1.2.3`), AND (whitespace-separated), OR (`||`-separated), and hyphen ranges (`1.2.3 - 2.0.0`). Pre-release tags and build metadata are not supported — module versions in this framework are stable releases by contract.

**Why a custom semver implementation?** The full `semver` package handles a much wider grammar than this use-case needs and parses regex-heavy on every call. The journeys-internal subset was originally cross-checked against `semver@7.7.4` and ran ~5× faster on the cached path and ~1.7× faster on one-shot parses on a representative grid; see [`bench/semver.bench.ts`](bench/semver.bench.ts) for the historic numbers and a self-contained benchmark of the local implementation. The cross-checked outcomes are frozen as a fixture grid in [`src/semver.test.ts`](src/semver.test.ts) so any regression in our implementation is caught without keeping `semver` as a devDependency. If a range or version is outside the supported subset the parser throws synchronously, so an untested edge case fails loudly at registration rather than as a silent "no match."

**When to omit it.** Modules that you and the journey ship together (same team, same release cadence, same monorepo) gain nothing from a compat declaration — the structural validators (`transitions` referencing real modules / entries / exits) already catch shape drift. The compat check earns its keep when the journey and a module are versioned independently.

## Composing journeys (invoke / resume)

Sometimes mid-flow you need to detour into a _different_ journey — e.g. inside checkout the customer needs to verify identity, or inside an integration setup the user needs to add a new credential. The parent journey suspends, the child runs to a terminal, the parent picks up where it left off with the child's terminal payload in hand, and continues. Modular-react models this as a **subroutine**: one new transition primitive (`invoke`) plus a **named resume** handler that fires when the child terminates.

The model is deliberately narrow: a parent can have at most one in-flight child per step, the parent's step doesn't change while the child runs, the parent advances only via the resume, and end-ing the parent cascades to the child. If you genuinely need parallel sub-flows (rare), call `runtime.start()` directly and own the bookkeeping — that path remains available.

### The shape

A transition handler returns an `{ invoke: { handle, input, resume } }` arm instead of `{ next | complete | abort }`. Build it with the typed `invoke()` helper — a bare object literal **does not** cross-check `input` against the handle's `TInput` (the discriminated-union arm declares `InvokeSpec<unknown, unknown>` so the runtime can dispatch on any handle). The parent's journey definition declares a sibling `resumes` map mirroring `transitions`:

```ts
import { defineJourney, defineJourneyHandle, invoke } from "@modular-react/journeys";
import { verifyIdentityHandle } from "verify-identity-journey";
//        ^ exported from the child's package via defineJourneyHandle.

defineJourney<CheckoutModules, CheckoutState, { token: string }>()({
  id: "checkout",
  version: "1.0.0",
  initialState: (input: { orderId: string }) => ({ orderId: input.orderId, token: null }),
  start: (s) => ({ module: "checkout", entry: "review", input: { orderId: s.orderId } }),
  transitions: {
    checkout: {
      review: {
        // Exit handler dispatches an invoke instead of next. `invoke()`
        // threads the handle's TInput / TOutput through to `input` and
        // the resume so a wrong-shaped `input` is a compile error.
        requestPayment: ({ state }) =>
          invoke({
            handle: verifyIdentityHandle, // typed handle, see "Journey handles"
            input: { customerId: state.customerId },
            resume: "afterIdentity", // names the resume below
          }),
      },
    },
  },
  resumes: {
    checkout: {
      review: {
        // outcome is ChildOutcome<TVerifyOutput> — completed has a typed
        // payload; aborted carries reason. Both are surfaced; you decide.
        afterIdentity: ({ state, outcome }) =>
          outcome.status === "completed"
            ? {
                state: { ...state, token: outcome.payload.token },
                next: {
                  module: "billing",
                  entry: "collect",
                  input: { orderId: state.orderId, token: outcome.payload.token },
                },
              }
            : { abort: { reason: "identity-failed", cause: outcome.reason } },
      },
    },
  },
});
```

The child journey is a totally normal `defineJourney` — it doesn't know it's being invoked. It declares its `TInput` (input from the parent) and its `TOutput` (the third generic on `defineJourney<TModules, TState, TOutput>()`, narrowing the type of `complete` payloads). Its handle, exported via `defineJourneyHandle(childJourney)`, carries both as phantom types so `invoke()` checks `input` and the parent's resume sees `outcome.payload` typed end-to-end.

### Why named resumes (and not closures)

You might expect `invoke` to take a `resume: (ctx) => ...` closure. We deliberately don't — closures don't survive a persistence reload. Naming the resume keeps everything serializable: the parent's blob records `pendingInvoke.resumeName`, the runtime looks up `def.resumes[mod][entry][name]` on hydrate, and the call chain restores exactly. See the persistence section below for the round-trip details.

Resume names live in their own keyspace from exit names — the lookup tables are siblings, not the same map. **One authoring rule, enforced at registration time:** a resume name must not collide with any exit name on the **same module** (not the same entry — the broader scope catches the typical "I meant a transition handler, not a resume" mistake). `validateJourneyContracts` rejects the registration with an explicit message naming the offender, so a typo at authoring time fails loudly instead of becoming a silent `invoke-unknown-resume` later.

### Lifecycle and edge cases

| Situation                                                                             | Behavior                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Child completes                                                                       | Parent's named resume fires with `{ status: "completed", payload }` (typed).                                                                                                                                                                                                          |
| Child aborts (its own `{ abort }` or `runtime.end`)                                   | Parent's named resume fires with `{ status: "aborted", reason }`. Author decides whether to recover or propagate.                                                                                                                                                                     |
| Parent ended while child active                                                       | Cascade — link is severed first, then the child is ended with terminal payload `{ reason: "parent-ended", parentId, cause: <end-reason> }`, then the parent runs its own `onAbandon` and aborts independently. The resume does **not** fire (the link was nulled before the cascade). |
| Child invokes a grandchild                                                            | Same machinery; the resume bubbles up the chain. The runtime maintains parent links and a reverse map; nothing special.                                                                                                                                                               |
| Parent fires an exit while child is in flight                                         | Dropped with a debug warn — the parent advances only via resume.                                                                                                                                                                                                                      |
| Invoke names an unknown journey id                                                    | Parent aborts immediately with reason `invoke-unknown-journey`. `onError` fires with `phase: "invoke"`.                                                                                                                                                                               |
| Invoke names a resume that isn't declared on the current step                         | Parent aborts with reason `invoke-unknown-resume`. `onError` fires with `phase: "invoke"`.                                                                                                                                                                                            |
| Resume name vanished between invoke and child terminal (definition upgraded mid-flow) | Parent aborts with reason `resume-missing` (carrying `resume` and `childJourneyId`). `onError` fires with `phase: "resume"`.                                                                                                                                                          |
| Resume handler throws                                                                 | Parent aborts with reason `resume-threw`, `error` carries the throw. `onError` fires with `phase: "resume"`.                                                                                                                                                                          |
| Resume handler returns a Promise                                                      | Parent aborts with reason `resume-returned-promise`. Resumes must be sync and pure, like exit handlers.                                                                                                                                                                               |
| Hydrate: child blob missing on reload                                                 | Parent stays `active` with `activeChildId` set; exits remain blocked. The shell decides whether to load the child later or `runtime.end` the parent to give up.                                                                                                                       |

### Outlet behavior

`<JourneyOutlet>` walks the active call chain by default and renders the _leaf_. If the parent has invoked a child, the parent's component disappears and the child's component takes over the same outlet — matching the subroutine intuition. The chain re-renders when any link changes.

For a layered presentation (parent visible underneath, child in a modal), pass `leafOnly={false}` on the outer outlet to keep it on the parent's step, and mount a sibling outlet against `instance.activeChildId` (or use `useJourneyCallStack`) for the child:

```tsx
import { JourneyOutlet, useJourneyCallStack } from "@modular-react/journeys";

function CheckoutPanel({ instanceId }: { instanceId: InstanceId }) {
  const chain = useJourneyCallStack(runtime, instanceId);
  // `chain[length - 1]` is the active *leaf*. For shallow nesting that's
  // the immediate child; for parent → child → grandchild the modal will
  // surface the grandchild instead. Use `instance.activeChildId` directly
  // if you specifically want the immediate child.
  const leafId = chain.length > 1 ? chain[chain.length - 1] : null;
  return (
    <>
      <JourneyOutlet runtime={runtime} instanceId={instanceId} leafOnly={false} />
      {leafId ? (
        <Modal>
          <JourneyOutlet runtime={runtime} instanceId={leafId} />
        </Modal>
      ) : null}
    </>
  );
}
```

`onFinished` on a `<JourneyOutlet>` fires for the **root** instance only — it's the journey the caller mounted. Child terminations are observed via the parent's resume handler, not the outer outlet.

### Persistence (round-tripping invoke state)

When a parent has an in-flight child, `serialize()` emits `pendingInvoke` on the parent and `parentLink` on the child:

```jsonc
// parent blob
{
  // ...standard fields
  "pendingInvoke": {
    "childJourneyId": "verify-identity",
    "childInstanceId": "ji_abc",
    "childPersistenceKey": "verify-identity:cust-42",
    "resumeName": "afterIdentity"
  }
}

// child blob
{
  // ...standard fields
  "parentLink": { "parentInstanceId": "ji_xyz", "resumeName": "afterIdentity" }
}
```

`childPersistenceKey` is `string | null` — it's `null` when the child journey has no persistence adapter configured. The parent still tracks `childInstanceId` in memory, but on a process restart the child can't be reloaded from storage and the parent will land in the "child blob missing" state described in the lifecycle table.

**Auto-rehydrate.** Calling `runtime.start(parentHandle, input)` on a fresh runtime against the same persistence backing will pull the parent blob, see the `pendingInvoke.childPersistenceKey`, and load the child blob automatically — recursing into grandchildren if the child blob carries its own `pendingInvoke`. Shells only need to `start()` the root; the leaf comes back along with its parents.

After every hydrate path (sync start, async start, explicit `runtime.hydrate`), the runtime relinks every in-memory pair via the `parent` / `activeChildId` fields. Order doesn't matter — hydrate the parent first, then the child, or vice versa; the link reconciles either way. A parent whose `activeChildId` references a not-yet-loaded child stays `active` (exits blocked) until the child arrives.

If the child's blob is gone for good (TTL expired, manual remove, or no persistence configured on the child), the shell decides recovery: keep the parent suspended, or `runtime.end(parent)` to give up. The runtime does not auto-abort, because that would race with multi-step hydrates that legitimately load the parent first.

### Telemetry: `TransitionEvent.kind`

Every event a registered `onTransition` hook receives now carries a `kind` discriminator:

```ts
onTransition: (ev) => {
  if (ev.kind === "step") metrics.record("journey.hop", { id: ev.journeyId });
  if (ev.kind === "invoke")
    metrics.record("journey.invoke", { id: ev.journeyId, child: ev.child?.journeyId });
  if (ev.kind === "resume")
    metrics.record("journey.resume", { id: ev.journeyId, resume: ev.resume });
};
```

A consumer that only cares about top-level steps filters `kind === "step"`. Otherwise read `ev.child` on invokes and `ev.outcome` / `ev.resume` on resumes.

### Testing

The simulator drives both modes:

```ts
import { simulateJourney } from "@modular-react/journeys";

// Drive a real child sub-simulator end-to-end:
const sim = simulateJourney(
  parentJourney,
  { orderId: "O-1" },
  {
    children: [verifyIdentityJourney],
  },
);
sim.fireExit("requestPayment");
sim.activeChild!.fireExit("verified", { token: "T" }); // child runs to terminal
expect(sim.currentStep.entry).toBe("collect"); // parent has resumed

// Or mock the child's outcome to unit-test the parent's resume in isolation:
const sim2 = simulateJourney(
  parentJourney,
  { orderId: "O-2" },
  {
    children: [verifyIdentityJourney],
  },
);
sim2.fireExit("requestPayment");
sim2.completeChild({ token: "T-MOCK" }); // synthesize completed
expect(sim2.state.token).toBe("T-MOCK");

sim2.abortChild({ code: "denied" }); // synthesize aborted — reason reaches the resume as-is, no wrap
```

`completeChild` uses the runtime's standard transition machinery — `onComplete`, `onTransition`, persistence, and the parent's resume hook all fire as they would for a real `{ complete }`.

### What this is _not_

- **Not shared state.** Each journey owns its `TState`; communication is exclusively via `input` (down) and `outcome.payload` (up). Preserves the mental-model boundary.
- **Not concurrent spawn.** A parent has at most one active invocation. If you need parallel children, call `runtime.start()` directly and store ids in state — but you give up the typed resume linking, the persisted `pendingInvoke` / `parentLink` round-trip, the `activeChildId` chain that `<JourneyOutlet>` walks, and the cascade-end semantics. Everything becomes shell-managed.
- **Not back-navigation across the boundary.** `goBack` stays scoped to a journey's own history. To return from a child without completing, fire an exit that maps to `{ abort }`; the parent's resume handler decides what to do.

### Cycle and recursion safety

Composing journeys creates a _call graph_ — A invokes B, which invokes C, possibly back into A. Without guards, a cycle becomes either an infinite chain that exhausts memory or a same-step bouncing resume that pegs the CPU. Modular-react ships **four layered guards**, three at runtime (always on) plus an opt-in static check at registration time. Every guard surfaces through the existing `onError` channel with `phase: "invoke"` (or `"resume"`) and aborts the offending parent with a discoverable reason — same vocabulary as the other validation aborts.

| Guard                       | When it fires                                                                                                                                                                                                                            | Abort reason              | Default                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------ |
| **Static cycle detection**  | Registration time, when every journey on the cycle path declares its `invokes` set. Throws `JourneyValidationError` listing the cycle path (e.g. `cycle detected: "A" → "B" → "A"`).                                                     | (registration error)      | always on when `invokes` is declared |
| **invoke-undeclared-child** | Runtime invoke time, when the parent journey declared an `invokes` array but the dispatched handle id is not in it. Catches dynamic-dispatch typos.                                                                                      | `invoke-undeclared-child` | always on when `invokes` is declared |
| **invoke-cycle**            | Runtime invoke time, when the target journey id already appears on the active parent chain. Catches cycles that the static check missed (because some journey on the cycle omitted `invokes`).                                           | `invoke-cycle`            | always on                            |
| **invoke-stack-overflow**   | Runtime invoke time, when admitting the new child would push the chain depth past the resolved cap. The cap is the **minimum** of every non-undefined `maxCallStackDepth` across the active chain (ancestors + parent + would-be child). | `invoke-stack-overflow`   | `maxCallStackDepth: 16`              |
| **resume-bounce-limit**     | Runtime resume time, when a resume returns `{ invoke }` for the Nth consecutive time at the _same parent step_ (the counter resets when the parent's step actually advances).                                                            | `resume-bounce-limit`     | `maxResumeBouncesPerStep: 8`         |

#### Declaring the call set (`invokes`)

The strongest line of defense is opt-in: list every child handle the journey can dispatch to.

```ts
import { defineJourney, defineJourneyHandle, invoke } from "@modular-react/journeys";
import { verifyIdentityHandle } from "verify-identity-journey";
import { addPaymentMethodHandle } from "add-payment-method-journey";

defineJourney<CheckoutModules, CheckoutState>()({
  id: "checkout",
  version: "1.0.0",
  // Closed set — the runtime rejects any other handle at invoke time, and
  // the registry runs cycle detection across the declared graph at boot.
  invokes: [verifyIdentityHandle, addPaymentMethodHandle],
  // ...transitions / resumes that may dispatch invoke() to either handle.
});
```

When **every** journey in a registration declares `invokes`, the registry's `validateJourneyContracts` (which calls `validateJourneyGraph` internally before its own structural checks) builds the full directed graph and rejects the whole registration on a cycle:

```
JourneyValidationError: Invalid journey registration:
  - journey invoke cycle detected: "checkout" → "verify-identity" → "checkout"
```

The cycle check is **already part of the standard registry validation pipeline** — you do not need to opt in. Authors who want to run the graph check by hand (e.g. while composing registrations across plugin boundaries before handing them to the registry) can call `validateJourneyGraph(journeys)` directly; both functions throw `JourneyValidationError` with the same per-cycle message format.

When some journeys omit `invokes`, the static check is incomplete (their out-edges are unknown), so the runtime guards remain the safety net. There is no penalty for omitting `invokes`; it's purely a confidence dial.

#### Tuning `maxCallStackDepth`

Set on the journey's registration options. Any journey in the chain can lower the cap; none can raise it. Setting it to `1` blocks `invoke` from this journey outright (useful for "leaf" journeys that should never spawn children).

```ts
registry.registerJourney(checkoutJourney, {
  maxCallStackDepth: 4, // checkout is happy to host up to 3 nested children
  persistence: ...,
});
```

The resolved cap on each `invoke` is `min(non-undefined options across [ancestors..., parent, child])`, falling back to `16`. The strictest journey in the chain wins, which means a cautious utility journey can lower the cap for any composition that includes it without coordinating with the other journeys.

`0`, negative, or non-finite values are treated as "no opinion" (consistent with `maxHistory`) so a misconfigured `0` cannot silently disable the guard.

#### Tuning `maxResumeBouncesPerStep`

A "bounce" is a resume that returns `{ invoke }` instead of advancing the parent's step. Counted per-parent, scoped to the parent's current step (not the parent's instance) — so a flow that legitimately retries a sub-flow several times in a row is fine, as long as the parent eventually advances. The counter resets whenever the parent's step actually changes (`{ next | complete | abort }` from any source).

```ts
registry.registerJourney(checkoutJourney, {
  maxResumeBouncesPerStep: 3, // verify, fail, retry, fail, retry → abort
});
```

The bounce cap is per-parent — only the parent's own option governs (children don't see the parent's resumes and have no business voting). The counter is **persisted on the parent's blob** as `resumeBouncesAtStep`, so a hostile or accidental reload-bounce-reload-bounce sequence cannot reset the budget through storage. `0`, negative, or non-finite values fall through to the library default of `8`.

#### Failure surface

All four guards abort the offending parent with a structured `terminalPayload` that's safe to log. The shapes:

```ts
// invoke-undeclared-child
{ reason: "invoke-undeclared-child", parentJourneyId: "...", childJourneyId: "...", exit: "..." }

// invoke-cycle (chain mirrors the printed warning — cycle portion only,
// pre-cycle prefix dropped, duplicate target id appears at both ends)
{ reason: "invoke-cycle", childJourneyId: "B", chain: ["B", "C", "D", "B"], exit: "..." }

// invoke-stack-overflow (chain is the full ancestors → parent → child)
{ reason: "invoke-stack-overflow", depth: 17, cap: 16, chain: ["a", "b", ..., "p"], exit: "..." }

// resume-bounce-limit
{ reason: "resume-bounce-limit", cap: 8, count: 9, resume: "afterChild" }
```

Each one fires the registration's `onError` first (with `phase: "invoke"` for the first three, `phase: "resume"` for the last), so telemetry still observes the underlying control-plane failure even when the abort itself is what reaches the user.

**Typed narrowing.** The four guards above plus every other runtime-emitted abort (`invoke-unknown-journey`, `invoke-unknown-resume`, `resume-missing`, `resume-threw`, `transition-error`, …) share a single discriminated union, `JourneySystemAbortReason`. Pair it with the `isJourneySystemAbort` predicate to narrow against author-supplied aborts (`{ abort: "user-cancelled" }`, `{ abort: { reason: "user-thing" } }`, etc.), which the predicate excludes by checking the `reason` against the closed set of system codes:

```ts
import { isJourneySystemAbort } from "@modular-react/journeys";

resumes: {
  checkout: {
    review: {
      afterIdentity: ({ outcome }) => {
        if (outcome.status !== "aborted") return /* ... */;
        if (isJourneySystemAbort(outcome.reason)) {
          // outcome.reason is now the discriminated union — switch on `reason`
          // for typed access to per-arm fields:
          switch (outcome.reason.reason) {
            case "invoke-cycle":
              metrics.record("invoke_cycle", { chain: outcome.reason.chain });
              break;
            case "resume-bounce-limit":
              metrics.record("bounce_limit", { cap: outcome.reason.cap });
              break;
          }
        } else {
          // author-supplied abort (e.g. `{ abort: { code: "denied" } }`) —
          // narrow as you would any other unknown payload.
        }
        return { abort: outcome.reason };
      },
    },
  },
},
```

The `JourneySystemAbortReasonCode` literal-string union is also exported if you only need the code list (e.g. for a `Set` membership check or a switch over an external classification).

## Runtime surface

`manifest.journeys` implements `JourneyRuntime`:

```ts
interface JourneyRuntime {
  /**
   * Handle form (preferred) - `input` is type-checked against the handle's
   * phantom `TInput`. See "Journey handles" below for the pattern.
   */
  start<TId extends string, TInput>(
    handle: JourneyHandleRef<TId, TInput>,
    input: TInput,
  ): InstanceId;
  /**
   * String-id form - accepts any `input`. Useful for dynamic dispatch
   * where the id only exists at runtime (e.g. a navbar action carrying
   * `{ kind: "journey-start", journeyId }`).
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

  /**
   * Cheap predicate for "is this journey id known to this runtime?"
   * Useful when rehydrating persisted shell state (tabs, task queue, …)
   * to drop entries for journeys renamed or removed between deploys -
   * avoids routing expected drops through the `UnknownJourneyError`
   * exception channel.
   */
  isRegistered(journeyId: string): boolean;

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

Both `start` overloads resolve to the same runtime call; the handle form only exists to type-check `input`. Prefer handles in new code - see [Journey handles](#journey-handles) for the full pattern.

### When to call which

| Situation                                                             | Use                                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| User clicks "start customer onboarding".                              | `runtime.start(onboardingHandle, { customerId })` - handle form. |
| Dynamic dispatch (navbar action / command palette with an opaque id). | `runtime.start(action.journeyId, input)` - string-id form.       |
| Reloading the shell and restoring tabs from localStorage.             | `runtime.start(…)` again - persistence resumes.                  |
| Filter persisted shell state before calling `start()`.                | `runtime.isRegistered(journeyId)` - cheap pre-check.             |
| Read-only "show me what this journey looked like in audit log #1234". | `runtime.hydrate(journeyId, blob)` - no persistence.             |
| Shell wants to react to state changes (tab title, breadcrumb).        | `runtime.subscribe(id, listener)`                                |
| User closes a journey tab before it completes.                        | Let `<JourneyOutlet>` unmount - it calls `end()`.                |
| Shell explicitly cancels (e.g. "end shift").                          | `runtime.end(id, { reason: 'end-of-shift' })`                    |
| Long-running workspace accumulated finished journeys; free memory.    | `runtime.forgetTerminal()`                                       |
| After `onFinished`, prune this specific terminal instance.            | `runtime.forget(id)`                                             |

### `listDefinitions()` and `listInstances()`

Primarily useful for diagnostics, command palettes, or admin tooling. A "launch journey" picker can render `runtime.listDefinitions()` directly; a "which journeys are open for this user" debug panel can walk `runtime.listInstances()` and `getInstance(id)`.

### Journey handles

A **journey handle** is a typed token a journey package exports so shells and modules can open it with a correctly-shaped `input` without importing the journey's runtime code. Export one per journey:

```ts
// journeys/customer-onboarding/src/customer-onboarding.ts
import { defineJourney, defineJourneyHandle } from "@modular-react/journeys";

export const customerOnboardingJourney = defineJourney<Modules, State>()({
  id: "customer-onboarding",
  version: "1.0.0",
  initialState: ({ customerId }: { customerId: string }) => ({
    /* … */
  }),
  /* … */
});

// Publish a handle alongside the journey definition - same package, same file.
export const customerOnboardingHandle = defineJourneyHandle(customerOnboardingJourney);
```

At the call site, pass the handle to `runtime.start`:

```ts
import { customerOnboardingHandle } from "@myorg/journey-customer-onboarding";

const instanceId = runtime.start(customerOnboardingHandle, { customerId: "C-1" });
// input is type-checked end-to-end - wrong shape = compile error.
```

`defineJourneyHandle(def)` returns `{ id: def.id }` at runtime; the input-type check lives entirely in the type system (the `__input` field is phantom - no value, never read). This is why modules and shells can `import type`-only from a journey package and still get full `input` checking without pulling the journey definition into their bundle.

Why handles exist:

- **No runtime coupling.** A module that launches a journey imports the handle via `import type` - the journey's transition code never enters the module's bundle.
- **Type-safe `input`.** The handle carries `TInput` as a phantom; `runtime.start(handle, input)` is the overload that type-checks it. The string-id form accepts any input and is the right call only for dynamic dispatch (e.g. a nav action carrying an opaque `journeyId`).
- **Single canonical id.** `handle.id === def.id` at runtime; dedup/lookup code can compare handles or ids interchangeably without casing on which one it received.

The string-id `start()` overload stays supported precisely because plugin-contributed nav items carry `{ kind: "journey-start", journeyId }` - a dispatcher can't hold a handle reference for every registered journey, so it falls back to the string form.

## `JourneyProvider` + context

`JourneyProvider` supplies the runtime (and an optional `onModuleExit` fallback) to descendant `<JourneyOutlet>` and `<ModuleTab>` nodes via context. Mount it once at the top of the shell:

```tsx
<JourneyProvider runtime={manifest.journeys} onModuleExit={manifest.onModuleExit}>
  <AppRoutes />
</JourneyProvider>
```

Explicit `runtime` / `modules` props on `<JourneyOutlet>` still win - useful when a single tree needs to reach two distinct runtimes (split-screen agents, multi-tenant dashboards). `useJourneyContext()` exposes the current value (or `null` when no provider is mounted) for shells that need the runtime for non-React-rendering work - e.g. opening a new tab from a command-palette handler.

Because `useJourneyContext()` can return `null`, examples that use the non-null assertion (`useJourneyContext()!.runtime`) are only safe **inside a tree where the provider is guaranteed to be mounted** - typically the subtree below `<JourneyProvider>` in your shell. In code paths that can legitimately run outside the provider (e.g. a shared utility callable from both journey-aware and journey-unaware hosts), null-check the return value instead and fall back to whatever the caller supplied.

## Persistence

**Persistence is optional.** Skip it and journeys live in memory only - every `runtime.start()` mints a fresh instance and nothing is written to storage. Add an adapter when you want reload recovery (resuming after a refresh) or idempotent `start` (the same input returning the same `instanceId`).

When you do want it, plug an adapter in at registration. The preferred shape is `defineJourneyPersistence<TInput, TState>` - it types `keyFor`'s `input` against the journey's `TInput` and `load` / `save` against its `TState`, so there's no `as` cast at the call site:

```ts
import { defineJourneyPersistence } from "@modular-react/journeys";

registry.registerJourney(journey, {
  persistence: defineJourneyPersistence<OnboardingInput, OnboardingState>({
    keyFor: ({ journeyId, input }) => `journey:${input.customerId}:${journeyId}`,
    load: (key) => backend.loadJourney(key),
    save: (key, blob) => backend.saveJourney(key, blob),
    remove: (key) => backend.deleteJourney(key),
  }),
});
```

A plain object matching `JourneyPersistence<TState>` still works if you'd rather not use the helper.

### Stock adapters: `createWebStoragePersistence` and `createMemoryPersistence`

Two factories ship with the package so common setups don't have to reimplement the same 20 lines of SSR guards and JSON handling. Both return values satisfying `JourneyPersistence<TState, TInput>` - pass them directly to `registerJourney({ persistence })`.

**`createWebStoragePersistence` - the 80% case (localStorage / sessionStorage).** Backed by the synchronous Web Storage API, SSR-safe, cleans up corrupt entries on read. Matches the sizing profile of most journey state (a few KB of JSON, per user, read-on-mount):

```ts
import { createWebStoragePersistence } from "@modular-react/journeys";

// Defaults to localStorage (or no-ops under SSR).
export const journeyPersistence = createWebStoragePersistence<OnboardingInput, OnboardingState>({
  keyFor: ({ journeyId, input }) => `journey:${input.customerId}:${journeyId}`,
});

registry.registerJourney(customerOnboardingJourney, { persistence: journeyPersistence });
```

Under the hood: `load` runs `JSON.parse` with a catch that calls `removeItem(key)` so a single bad write doesn't wedge future loads; `save` runs `JSON.stringify` and lets `QuotaExceededError` bubble so the app can surface it; all three methods no-op when `storage` resolves to `null`.

You can swap the backing store by passing a `storage` option:

```ts
// Tab-scoped - state dies with the tab.
createWebStoragePersistence<MyInput, MyState>({
  keyFor: ({ journeyId, input }) => `s:${input.id}:${journeyId}`,
  storage: typeof sessionStorage !== "undefined" ? sessionStorage : null,
});

// Lazy getter - re-evaluated per call. Useful when storage availability can
// flip after hydration (feature-detect then flip a flag).
createWebStoragePersistence<MyInput, MyState>({
  keyFor: ({ journeyId, input }) => `j:${input.id}:${journeyId}`,
  storage: () => (canUseStorage() ? localStorage : null),
});
```

Pick this adapter unless your state is large (>~1 MB per origin), you need offline-first guarantees, or **concurrent tabs writing the same key** is a correctness concern - the synchronous Web Storage API has no cross-tab write coordination, so the last `save` wins and can silently clobber a concurrent transition from another tab. For those cases, write a custom IndexedDB adapter against the same `JourneyPersistence` interface.

**`createMemoryPersistence` - for tests and SSR.** `Map`-backed, zero IO. The primary use case is tests: a fresh store per test avoids bleed between cases, and the runtime's persistence code paths stay exercised without `localStorage` mocks.

```ts
import { createMemoryPersistence } from "@modular-react/journeys";

const store = createMemoryPersistence<OnboardingInput, OnboardingState>({
  keyFor: ({ journeyId, input }) => `${journeyId}:${input.customerId}`,
});

// Pre-seed for a resume test - the runtime finds the blob on first start():
const seeded = createMemoryPersistence<OnboardingInput, OnboardingState>({
  keyFor: ({ journeyId, input }) => `${journeyId}:${input.customerId}`,
  initial: [["onboarding:C-1", existingBlob]],
});

// Test-only helpers (not on JourneyPersistence) - useful for assertions:
expect(store.size()).toBe(1);
expect(store.entries()).toMatchObject([...]);
store.clear();
```

Blobs are deep-cloned on both `save` and `load` by default so mutating the stored or returned object can't corrupt the other. Pass `clone: false` only in hot test loops where you've verified nobody mutates the blob.

Also valid as an SSR "persistence is configured but nothing survives the request" mode: no server state leaks into rendered HTML, and `start()` on the client re-probes from scratch. For an SSR shell that wants real client-side persistence, pick the adapter based on where the code runs - `createMemoryPersistence` on the server, `createWebStoragePersistence` on the client - so the server render produces no cross-request state and the client picks up from `localStorage` as normal.

Guarantees:

- **Idempotent `start`** - two `runtime.start(journeyId, input)` calls yielding the same `keyFor` return the same `instanceId`. Useful for reload recovery (same customer → same active journey). The key is namespaced internally by `journeyId`, so two journeys whose `keyFor` happens to return the same string can't alias onto the same instance.
- **Saves are serialized per instance** - at most one `save()` in flight; follow-up changes coalesce into a single pending save. Errors are logged but never block a transition.
- **Automatic cleanup of dead blobs** - when `start()` reads a terminal / corrupt / unmigrateable blob, the runtime calls `remove(key)` before minting a fresh instance. `remove` is also called when an active instance transitions to `completed` / `aborted`.
- **`remove` waits for in-flight `save`** - a terminal transition that fires while a `save()` is still in flight defers the `remove()` until the save settles, so adapters that don't serialize their own ops can't see a `save` land _after_ a `remove` and leave an orphaned blob.
- **Bulk terminal cleanup** - `runtime.forgetTerminal()` drops every terminal instance from memory in one call. Useful for long-running workspaces that accumulate finished journeys over a session.

### Key design - picking the right `keyFor`

`keyFor({ journeyId, input })` is the **only** identity contract the runtime has with your storage. Get it right and reload recovery is automatic; get it wrong and journeys alias onto each other's state.

Common shapes:

| Scope                              | `keyFor`                                                           | Effect                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| One journey per customer           | `` `journey:${input.customerId}:${journeyId}` ``                   | Reload resumes. Opening the same customer's journey twice = same tab/instance.                   |
| One journey per session            | include a session id in `input` and the key                        | Each agent shift gets a fresh slate; different shifts don't collide.                             |
| One journey per (customer, matter) | `` `journey:${input.customerId}:${input.matterId}:${journeyId}` `` | Supports concurrent journeys for the same customer on distinct matters.                          |
| Strictly per start                 | include a `nonce` in `input` and the key                           | Never resumes; every `start()` is a new journey. Use when the semantic is "new flow every time". |

`keyFor` deliberately does **not** receive `instanceId` - probing happens before one exists, and mixing the two forms has historically produced subtle key mismatches.

The runtime namespaces keys internally by `journeyId`, so two **different** journeys whose `keyFor` happens to return the same string still resolve to distinct instances - a journey you register in a shared shell can't be aliased onto an unrelated journey's storage by accident. The adapter sees only the user-defined portion of the key; the internal namespace never reaches your storage calls.

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

| You want to…                                                       | Call                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------- |
| Open / resume a live journey for a user, with persistence wiring.  | `runtime.start(id, input)`                                      |
| Render a **read-only** audit/replay view of a stored blob.         | `runtime.hydrate(id, blob)`                                     |
| Inspect a completed journey from an audit log without resuming it. | `runtime.hydrate(id, blob)` - terminal blobs are accepted here. |

`hydrate` is **persistence-unlinked**: the instance is created with no persistence key, so no save happens when its state changes (there's nothing for state to change into anyway on a terminal blob). If you genuinely want to resume a non-live blob, delete the storage record and let `start()` mint a fresh one.

`hydrate` of a terminal blob also **does not fire `onComplete` / `onAbort`** - those already fired on the original live run when the blob was produced, and firing them again on audit replay would double-count analytics. `onTransition` is silent for the same reason. If you need a signal that a terminal hydrate occurred, observe `runtime.getInstance(id).status` directly after the call returns.

### Versioning

Every serialized blob carries the journey's `version`. On hydrate:

- **Default (strict):** throw `JourneyHydrationError` if `blob.version !== definition.version`. The error message names "version mismatch".
- **With `onHydrate`:** the hook receives the loaded blob and returns the blob to use (possibly after migration). Throwing from `onHydrate` aborts the hydrate. The wrapped error names `onHydrate` (so callers can distinguish a migrator bug from a true version mismatch) and the original throw is preserved on `.cause` for logging / re-raising.

`runtime.start()` (the persistence-aware path) treats both failure modes the same: the stale blob is discarded via `persistence.remove(key)` and a fresh instance is minted under the same key. The distinction matters for `runtime.hydrate()`, where the caller is the one deciding what to do with the error.

Always supply `onHydrate` in production apps that ship new journey versions over time. A minimal pattern:

```ts
onHydrate: (blob) => {
  switch (blob.version) {
    case "1.0.0":
      return blob;
    case "0.9.0":
      return migrateFrom09(blob);
    default:
      throw new JourneyHydrationError(`unknown version ${blob.version}`);
  }
};
```

If migration would be destructive or the blob is no longer trusted, let `onHydrate` throw - the runtime discards the blob via `persistence.remove(key)` and mints a fresh instance under the same key. That's usually preferable to resuming into a malformed state.

### Rehydrating shell-level work (tabs, task queues, drafts)

Shells that persist user work outside the journey (tabs pointing at journey instances, a task queue, a draft list) need a rehydration pass on boot. The shape is inherently app-specific - every shell has a different "persisted work" concept - so the runtime doesn't ship a helper. Write the loop yourself, but discriminate failure modes:

```ts
import { UnknownJourneyError } from "@modular-react/journeys";

for (const tab of persistedTabs) {
  if (!journeys.isRegistered(tab.journeyId)) {
    // The journey was renamed or removed between deploys. Expected after
    // version skew; drop the tab cleanly.
    tabsStore.getState().removeTab(tab.tabId);
    continue;
  }
  try {
    const resolvedId = journeys.start(tab.journeyId, tab.input);
    if (resolvedId !== tab.instanceId) {
      tabsStore.getState().updateTab(tab.tabId, { instanceId: resolvedId });
    }
  } catch (err) {
    if (err instanceof UnknownJourneyError) {
      // Raced with a concurrent unregister; same policy as the pre-check.
      tabsStore.getState().removeTab(tab.tabId);
      continue;
    }
    // A real bug (corrupted input, throwing onHydrate, invariant violation).
    // Drop so the shell still boots, but warn loudly and surface it to the user.
    notifyUser(`We couldn't restore tab "${tab.title}"`, err);
    tabsStore.getState().removeTab(tab.tabId);
  }
}
```

Two things worth underlining:

- `runtime.isRegistered(id)` is a cheap pre-filter. It's not sufficient on its own (a tab might rehydrate fine past the id check and still fail on validation or a user `onHydrate` throw), but it keeps the expected-drop path out of the exception channel so real bugs stand out in logs.
- **Don't silently drop in production.** The example shells in this repo use `console.warn` only because they're examples. A real shell should surface the drop to the user - an in-app banner ("We couldn't restore N tab(s)"), an affordance to report the offending blob, or a quarantine store so support can replay it. Users lose trust fast when work vanishes without explanation.

## Rendering - `JourneyOutlet`

### Props

```ts
interface JourneyOutletProps {
  /** Runtime override - usually inherited from <JourneyProvider>. */
  runtime?: JourneyRuntime;
  /** The instance to render. Required. */
  instanceId: InstanceId;
  /** Module descriptors override - usually inherited from the runtime. */
  modules?: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  /** Shown while status === 'loading'. */
  loadingFallback?: ReactNode;
  /** Fired once when the instance terminates. */
  onFinished?: (outcome: TerminalOutcome) => void;
  /** Error policy for the step's component. Default: 'abort'. */
  onStepError?: (err: unknown, ctx: { step: JourneyStep }) => "abort" | "retry" | "ignore";
  /** Global retry cap per instance (retries do NOT reset on step change). Default: 2. */
  retryLimit?: number;
  /**
   * Replaces the default red notice when the current step points at a
   * `(moduleId, entry)` pair the runtime doesn't resolve to a registered
   * module+entry. Shells almost always want to brand this.
   */
  notFoundComponent?: ComponentType<JourneyOutletNotFoundProps>;
  /**
   * Replaces the default red notice when a step component throws.
   * Receives the raw error so shells can route it through their own
   * error-reporting pipeline.
   */
  errorComponent?: ComponentType<JourneyOutletErrorProps>;
}

interface JourneyOutletNotFoundProps {
  readonly moduleId: string;
  readonly entry: string;
}

interface JourneyOutletErrorProps {
  readonly moduleId: string;
  readonly error: unknown;
}

interface TerminalOutcome {
  status: "completed" | "aborted";
  payload: unknown; // value passed to complete(…) or abort(…)
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

Without the provider (or when you want to point at a different runtime), pass `runtime` and optionally `modules` explicitly - they always win over context:

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

| Policy     | Behavior                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `'abort'`  | Default. The outlet calls `runtime.end(id, { reason: 'component-error', error })`.                  |
| `'retry'`  | Re-mount the step with a fresh React key. Counted against `retryLimit` per instance (not per step). |
| `'ignore'` | Keep the module error boundary UI in place until the user transitions away via another action.      |

The retry counter is deliberately per-instance: a step that throws, auto-retries, transitions, and the next step also throws cannot bypass the cap by resetting via a step-token bump. When you truly need per-step retries, increment `retryLimit` and live with the larger overall budget, or classify errors in `onStepError` and `'abort'` on everything except a specific retryable pattern.

### Outlet hosts - rules of thumb

- Render the outlet wherever the step should live - tab body, modal body, route element, panel, wizard card. It doesn't care.
- A tab that represents a journey should be the outlet's **only** long-lived mount. Unmounting = abandon. Don't swap an outlet for a placeholder and expect the journey to survive.
- For wizards that live inside a single always-mounted container (no tab changes), you can mount the outlet inside a `<details>` or a collapsed panel and the instance stays alive even when visually hidden.

## Hosting plain modules - `ModuleTab`

`<ModuleTab>` is the non-journey counterpart: it renders a single module entry outside a route, and forwards exits to a shell-provided callback (plus the provider-level `onModuleExit`).

### Props

```ts
interface ModuleTabProps<TInput = unknown> {
  module: ModuleDescriptor<any, any, any, any>;
  entry?: string; // defaults to the module's sole entry when unambiguous
  input?: TInput;
  tabId?: string; // opaque passthrough for the onExit callback
  onExit?: (event: {
    moduleId: string;
    entry: string;
    exit: string;
    output: unknown;
    tabId?: string;
  }) => void;
}
```

### Behavior

- If `entry` is omitted and the module has **one** entry, it's used automatically. If it has several, an error notice is rendered asking for the `entry` prop.
- `exit(name, output)` calls `onExit` first (for the per-tab override - typically "close this tab"), then the provider-level `onModuleExit` (for analytics / global telemetry).
- When a module predates entry points and only declares a legacy `component`, `<ModuleTab>` renders that - entry/exit contracts are strictly opt-in.

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
  return (
    <JourneyOutlet instanceId={tab.instanceId} onFinished={() => workspace.closeTab(tab.tabId)} />
  );
}
```

## Observation hooks

```ts
defineJourney<…>()({
  onTransition: (ev)         => analytics.track('journey.step', ev),
  onAbandon:    ({ step })   => step?.moduleId === 'billing'
    ? { abort: { reason: 'payment-abandoned' } }
    : { abort: { reason: 'abandoned' } },
  onComplete:   (ctx, result)=> analytics.track('journey.complete', { ctx, result }),
  onAbort:      (ctx, reason)=> analytics.track('journey.abort', { ctx, reason }),
  onHydrate:    (blob)       => migrateIfNeeded(blob),
});
```

`onAbandon` is the only observation hook that returns a `TransitionResult` - the runtime uses it to decide the terminal state after `runtime.end(id, reason)`. Default: `{ abort: { reason: 'abandoned' } }`. The hook is also allowed to return `{ complete: … }` (rare, usually for "save a partial outcome on shutdown") or `{ next: … }` to reroute into another module entry instead of terminating - `runtime.end(id)` then keeps the journey alive on the rerouted step. Treat the reroute branch as an escape hatch: it can surprise callers that expect `end()` to be, well, an end. Exceptions from any hook are caught and logged; they never block the transition.

Registration options can supply an extra `onTransition` that fires after the definition's - handy when the shell wants host-level analytics without coupling it into the journey module.

Every `TransitionEvent` carries a `kind: "step" | "invoke" | "resume"` discriminator plus optional `child` / `outcome` / `resume` fields. Hooks that only care about top-level steps should filter on `kind === "step"`; consumers that want the full picture read the extra fields. See [Telemetry: `TransitionEvent.kind`](#telemetry-transitioneventkind) for the full breakdown. The registration-level `onError` carries a `phase: "step" | "invoke" | "resume" | "abandon"` discriminator on its `ctx` so a control-plane failure (a thrown resume, an unknown invoke handle) is distinguishable from a step-component throw.

## Testing

### Module-level - `renderModule({ entry, exit })`

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

### Journey-level pure - `simulateJourney`

Headless. No React. Fires exits against the transition graph and exposes state / step / history / status plus a recorded `transitions` stream for assertions on analytics rules without wiring an `onTransition` by hand.

```ts
import { simulateJourney } from "@modular-react/journeys/testing";

const sim = simulateJourney(customerOnboardingJourney, { customerId: "C-1" });
// `currentStep` is `step` with a non-null assertion baked in: throws if the
// journey has terminated, so test assertions on the live path stay terse.
// Use `sim.step` (which is `JourneyStep | null`) when a null is expected.
expect(sim.currentStep.moduleId).toBe("profile");

sim.fireExit("profileComplete", {
  customerId: "C-1",
  hint: { suggestedTier: "pro", rationale: "12 seats" },
});
expect(sim.currentStep.moduleId).toBe("plan");
expect(sim.state.hint?.suggestedTier).toBe("pro");

sim.fireExit("choseStandard", { plan: { tier: "pro", monthly: 79 } });
expect(sim.currentStep.moduleId).toBe("billing");

// Initial start + two hops since the simulator started.
expect(sim.transitions).toHaveLength(3);
expect(sim.transitions.at(-1)!.to?.moduleId).toBe("billing");

// Once the journey terminates, `sim.terminalPayload` mirrors the value
// passed to `complete` / `abort`; `sim.serialize()` returns the exact blob
// shape a persistence adapter would see (useful for pinning round-trip
// invariants without reaching into runtime internals).
sim.fireExit("paid", { reference: "PAY-1", amount: 79 });
expect(sim.terminalPayload).toEqual({ kind: "paid", reference: "PAY-1", amount: 79 });
expect(sim.serialize().status).toBe("completed");
```

### Integration - `renderJourney`

Mounts `<JourneyOutlet>` inside a minimal registry.

```ts
import { renderJourney } from "@react-router-modules/testing";

const { getByText, runtime, instanceId } = renderJourney(customerOnboardingJourney, {
  modules: [profileModule, planModule, billingModule],
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
  load: (k) => {
    const raw = store.get(k);
    return raw ? JSON.parse(raw) : null;
  },
  save: (k, b) => {
    store.set(k, JSON.stringify(b));
  },
  remove: (k) => {
    store.delete(k);
  },
});

// assert `store` entries after key transitions
```

For the full integration - including reload recovery - mount `renderJourney` with the adapter wired into registration, fire exits, then unmount + remount and check the state resumed.

## Integration patterns

Journeys are container-agnostic. Four common integration shapes:

### Pattern - tabbed workspace (recommended)

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
  return (
    <ModuleTab
      module={descriptors[tab.moduleId]}
      entry={tab.entry}
      input={tab.input}
      tabId={tab.tabId}
      onExit={() => workspace.closeTab(tab.tabId)}
    />
  );
}
```

See [`examples/react-router/customer-onboarding-journey/`](../../examples/react-router/customer-onboarding-journey/) and [`examples/tanstack-router/customer-onboarding-journey/`](../../examples/tanstack-router/customer-onboarding-journey/) for end-to-end implementations.

### Pattern - modal-hosted journey

For a one-shot flow that should block the rest of the UI (KYC top-up, mandatory re-auth):

```tsx
function JourneyModal({ journeyId, input, onClose }: Props) {
  const runtime = useJourneyContext()!.runtime;
  const [instanceId] = useState(() => runtime.start(journeyId, input));

  return (
    <Dialog open onClose={onClose}>
      <JourneyOutlet instanceId={instanceId} loadingFallback={<Spinner />} onFinished={onClose} />
    </Dialog>
  );
}
```

Dismissing the dialog unmounts the outlet → `onAbandon` fires. If you'd rather persist the journey across dismissals, keep the outlet mounted inside a hidden element and toggle dialog visibility only.

### Pattern - full-page route

Mount `<JourneyOutlet>` as a route element. The journey lives as long as the user stays on that route - a route change unmounts it and abandons the instance. Combine with `runtime.hydrate(blob)` to resume from a URL-bound audit blob.

```tsx
// react-router element:
<Route path="/onboarding/:customerId" element={<OnboardingPage />} />;

// OnboardingPage:
function OnboardingPage() {
  const { customerId } = useParams();
  const runtime = useJourneyContext()!.runtime;
  const [instanceId] = useState(() => runtime.start("customer-onboarding", { customerId }));
  return <JourneyOutlet instanceId={instanceId} onFinished={() => nav("/")} />;
}
```

### Pattern - embedded wizard panel

A journey driven inside an always-mounted panel (e.g. a side drawer). The outlet stays mounted even when the panel is collapsed - the instance survives toggle.

```tsx
<aside style={{ display: collapsed ? "none" : "block" }}>
  <JourneyOutlet instanceId={instanceId} />
</aside>
```

Only unmount the outlet when you truly want to abandon.

### Pattern - command-palette launcher

No extra React - the runtime is accessible anywhere via `useJourneyContext()` or a shell-level reference. Command handlers call `runtime.start(…)` and the shell's tab service mounts the outlet:

```ts
palette.register("onboarding:start", async ({ customerId }) => {
  workspace.openTab({ kind: "journey", id: "customer-onboarding", input: { customerId } });
});
```

## Debugging

The runtime enables dev-mode logs automatically when `process.env.NODE_ENV !== 'production'`. Signals to watch for:

| Message                                                                                                  | Meaning                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Stale exit("X") dropped on instance <id>`                                                               | A captured `exit` callback fired after the step advanced. Expected after double-clicks; suspicious if it floods the console.                              |
| `No transition for exit("X") on <module>.<entry>`                                                        | The component fired an exit the journey doesn't map. Usually a missing transition handler, or a refactor left a dead exit.                                |
| `Transition handler for <module>.<entry>."X" returned a Promise`                                         | A handler returned a thenable - illegal. The runtime aborts the journey. Move async into a loading entry.                                                 |
| `Journey "<id>" declares allowBack for <module>.<entry> but the runtime was created without the module…` | `createJourneyRuntime` was called without `modules` wired, so the back button can't be resolved. Use the registry-built runtime.                          |
| `onTransition / onAbandon / onComplete / onAbort threw`                                                  | Observation hook exception. Caught; the transition still commits. Fix the hook.                                                                           |
| `persistence.load / save / remove rejected / threw`                                                      | Storage error. Transitions continue in memory; the last good blob stays on disk.                                                                          |
| `hydrate after async load failed`                                                                        | Stored blob could not be hydrated (version mismatch without migrator, rollbackSnapshots length mismatch). The runtime discards the blob and starts fresh. |

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

- **Two exits in rapid succession** - step tokens guarantee the first wins; later calls are dropped.
- **Exit fired from an unmounted component** - same mechanism: token mismatch, drop.
- **Component throws during render or effect** - wrapped in an error boundary; `onStepError` decides (`'abort' | 'retry' | 'ignore'`). `'retry'` is capped by `retryLimit` (default 2) counted globally per instance; a throwing step that advances into another throwing step cannot reset the budget.
- **Async transition handler** - illegal. A handler that returns a `Promise` aborts the journey with `{ reason: 'transition-returned-promise' }` and logs an error in dev. Put async work inside a loading entry point on a module instead.
- **User closes the tab mid-journey** - `JourneyOutlet` unmounts → `runtime.end(id, { reason: 'unmounted' })` → `onAbandon` fires → instance becomes `aborted`. If the unmount happens while the instance is still in `loading` (persistence probe hasn't settled), the instance is transitioned straight to `aborted` without firing `onAbandon` - the journey never actually started.
- **Same journey, same persistence key, different input** - the persisted blob wins. The new input is discarded. Apps that want new inputs to reset should `runtime.end(oldId)` (and optionally clear the persistence key) first, or include a nonce in the key.
- **Terminal or corrupt persisted blob** - `start()` deletes it via `persistence.remove(key)` before minting a fresh instance, so stale blobs don't pile up in storage across reloads.
- **Hydrate blob whose `rollbackSnapshots` length disagrees with `history`** - rejected with `JourneyHydrationError`. Use `onHydrate` to migrate or pad the blob.
- **Duplicate `instanceId` on hydrate** - `runtime.hydrate()` throws if an instance with that id is already live. Call `forget(id)` first if the replace-in-place is intentional.
- **Circular transitions** - allowed; `history` grows. Long-running journeys should use `maxHistory` or be designed to terminate.
- **Circular invocations across journeys** - guarded. The four-layer safety net (static cycle check + runtime same-id, depth-cap, and resume-bounce-cap) aborts the offending parent with `invoke-cycle`, `invoke-stack-overflow`, `invoke-undeclared-child`, or `resume-bounce-limit` — see [Cycle and recursion safety](#cycle-and-recursion-safety) for tuning the caps and declaring the call set up-front.
- **Deep mutation of journey state corrupts rollback snapshots** - snapshots are **shallow clones**, so a mutation that reaches into nested objects updates the snapshot too. Treat state as immutable; produce new objects rather than mutating in place. In development the runtime shallow-freezes each captured snapshot, so a top-level mutation throws immediately - deep mutations still slip through.
- **Runtime input validation is not built in** - `schema<T>()` is type-only and gives you compile-time checking on entry inputs. The runtime does not validate at the boundary. If `start()` / `hydrate()` inputs come from untrusted sources (URL params, server payloads), wire `zod` / `valibot` / your validator of choice in front of them.
- **A module bumped past the journey's `moduleCompat` range** - `resolveManifest()` throws `JourneyValidationError` listing every mismatched (journey, module, range, registered version) tuple at once. The deployment refuses to come up; bump the journey's `moduleCompat`, downgrade the module, or fix the journey's transitions to match the module's new contract. See [Pattern - module compatibility (`moduleCompat`)](#pattern---module-compatibility-modulecompat).

## Limitations

Things that aren't implemented today but may land later - these are gaps, not architectural choices.

- **No URL reflection of journey state.** Journeys are route-agnostic by design. Deep-linking into a mid-journey step is currently an app-level concern (read URL → `runtime.hydrate` → mount outlet).

Cross-references for things that are sometimes mistaken for limitations:

- _"Transitions can't be async."_ True, by design - see [Transition handlers are pure and synchronous](#transition-handlers-are-pure-and-synchronous).
- _"Exits are module-level, not per-entry."_ Same - see [Entry points and exit points on a module](#entry-points-and-exit-points-on-a-module).
- _"`history` grows unbounded by default."_ Configurable - see [Pattern - bounded history (`maxHistory`)](#pattern--bounded-history-maxhistory) and the rollback-snapshot caveat there.
- _"State mutation can corrupt rollback snapshots."_ Treat state as immutable - see the snapshot bullet in [Errors, races, and edge cases](#errors-races-and-edge-cases).
- _"There's no runtime input validation."_ `schema<T>()` is type-only - see the validation bullet in [Errors, races, and edge cases](#errors-races-and-edge-cases).

## TypeScript inference notes

The journey type surface is designed so a handful of explicit generics produce end-to-end checking across modules, journey, and persistence. A few things to know:

### `defineJourney` is curried

```ts
export const journey = defineJourney<MyModules, MyState>()({
  initialState: (input: { customerId: string }) => ({
    /* … */
  }),
  // ^^^^^ TInput is inferred from `initialState`'s parameter
});

// Add TOutput as the third generic to narrow `complete` payloads (and the
// type a parent's resume sees on `outcome.payload` when this journey is
// invoked):
export const childJourney = defineJourney<ChildModules, ChildState, { token: string }>()({
  /* …complete: { token: ... } is type-checked against { token: string } */
});
```

`TModules` and `TState` are supplied explicitly; the optional third generic `TOutput` narrows the journey's terminal payload (defaults to `unknown`); `TInput` is inferred from `initialState` so you don't repeat the shape. If you ever need to constrain `TInput` explicitly (e.g. for a shared starter-input type), annotate the `initialState` parameter.

### The module type map is per-journey, not global

```ts
type OnboardingModules = {
  readonly profile: typeof profileModule;
  readonly plan: typeof planModule;
  readonly billing: typeof billingModule;
};
```

All imports are `import type` - modules are **not** pulled into the journey's bundle. Don't hoist a shared `AppModules` across every journey in the app: unrelated journeys pay each other's type-check cost and churn together on unrelated changes.

### `StepSpec` is a discriminated union

`StepSpec<TModules>` expands to `{ module: 'profile'; entry: 'review'; input: {…} } | { module: 'plan'; entry: 'choose'; input: {…} } | …`. Every transition result that returns `{ next: … }` narrows the `input` type against the target entry. You cannot type-check your way into passing a wrong-shaped input - but only if the modules in the type map expose narrow `entryPoints` / `exitPoints` literals (i.e. the module descriptor was typed via `const` + `as const` or via `defineModule` called without shell-level generics - the canonical authoring pattern in [Authoring patterns](#authoring-patterns)).

### `schema<T>()` is a type brand, not a validator

```ts
input: schema<{ customerId: string }>();
```

Returns an empty object whose type carries `T`. Zero runtime cost and zero validation. For runtime validation, wire zod/valibot inside the component (or at the `workspace.openTab` boundary) until `validateInput` lands in core.

### `defineJourneyPersistence<TInput, TState>` ties the adapter to the journey

```ts
const persistence = defineJourneyPersistence<OnboardingInput, OnboardingState>({
  keyFor: ({ input }) => `journey:${input.customerId}:onboarding`, // input typed as OnboardingInput
  save: (k, b) => api.save(k, b), // b typed as SerializedJourney<OnboardingState>
  load: (k) => api.load(k),
  remove: (k) => api.remove(k),
});
```

Without the helper, `input` on `keyFor` is `unknown`; with it, every callback is end-to-end typed.

## API reference

Every export you're likely to call, grouped by role.

### From `@modular-react/core` (module authors)

| Export                           | Signature                                                                        | Purpose                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `defineEntry`                    | `<T>(e: ModuleEntryPoint<T>) => ModuleEntryPoint<T>`                             | Identity helper for an entry-point literal. Zero runtime cost.          |
| `defineExit`                     | `<T = void>(s?: ExitPointSchema<T>) => ExitPointSchema<T>`                       | Identity helper for an exit-point literal. Zero runtime cost.           |
| `schema`                         | `<T>() => InputSchema<T>`                                                        | Type-only brand used to carry an input/output shape. Zero runtime cost. |
| `ModuleEntryProps`               | `<TInput, TExits extends ExitPointMap = {}>`                                     | Typed props for an entry component: `{ input, exit, goBack? }`.         |
| `ModuleEntryPoint`               | `{ component, input?, allowBack? }`                                              | Entry-point descriptor shape.                                           |
| `ExitPointSchema`                | `{ output? }`                                                                    | Exit-point descriptor shape.                                            |
| `ExitFn`                         | `<TExits>(name, output?) => void`                                                | The function signature `exit` gets on an entry component.               |
| `EntryPointMap` / `ExitPointMap` | `Record<string, ModuleEntryPoint<any>>` / `Record<string, ExitPointSchema<any>>` | Map shapes on `ModuleDescriptor`.                                       |

### Authoring (`@modular-react/journeys`)

| Export                        | Signature                                                                                                      | Purpose                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defineJourney`               | `<TModules, TState, TOutput?>() => <TInput>(def: JourneyDefinition<TModules, TState, TInput, TOutput>) => def` | Identity helper with full inference on transitions and state. Curried so `TInput` infers from `initialState`. The optional third generic `TOutput` narrows `complete` payloads (and a parent's resume `outcome.payload` when invoked).                                                                                                 |
| `defineJourneyHandle`         | `<TModules, TState, TInput, TOutput>(def) => JourneyHandle<string, TInput, TOutput>`                           | Builds a typed token from a journey definition so modules and shells can call `runtime.start(handle, input)` without importing the journey's runtime code. Carries `TOutput` so a parent's resume sees `outcome.payload` typed end-to-end.                                                                                             |
| `invoke`                      | `<TInput, TOutput>({ handle, input, resume }) => { invoke: InvokeSpec<TInput, TOutput> }`                      | Typed builder for the `{ invoke }` arm of `TransitionResult`. Cross-checks `input` against the handle's `TInput` — a bare object literal won't. See [Composing journeys](#composing-journeys-invoke--resume).                                                                                                                          |
| `validateJourneyGraph`        | `(journeys: readonly RegisteredJourney[]) => void`                                                             | Static cycle check over the directed graph derived from each journey's `invokes` field. Run automatically by `validateJourneyContracts`; exported separately for shells that compose registrations across plugin boundaries. See [Cycle and recursion safety](#cycle-and-recursion-safety).                                            |
| `isJourneySystemAbort`        | `(payload: unknown) => payload is JourneySystemAbortReason`                                                    | Type guard that narrows an `unknown` abort payload to the runtime's discriminated `JourneySystemAbortReason` union. Returns `false` for author-supplied aborts so a `{ abort: { reason: "user-cancelled" } }` does not collide with the system codes. See [Cycle and recursion safety - Failure surface](#cycle-and-recursion-safety). |
| `selectModule`                | `<TModules>() => <TKey>(key, cases) => StepSpec<TModules>`                                                     | Exhaustive state-driven dispatch helper for transition handlers - see [the pattern](#pattern---exhaustive-state-driven-module-dispatch-selectmodule). Missing branches are a compile error.                                                                                                                                            |
| `selectModuleOrDefault`       | `<TModules>() => <TKey>(key, cases, fallback) => StepSpec<TModules>`                                           | Sibling of `selectModule` accepting a partial cases map plus an explicit fallback `StepSpec` - see [the pattern](#pattern---fallback-dispatch-selectmoduleordefault). Use when most discriminator values funnel through a generic module.                                                                                              |
| `defineJourneyPersistence`    | `<TInput, TState>(adapter) => JourneyPersistence<TState, TInput>`                                              | Types `keyFor`'s `input` against `TInput`, `load`/`save` against `TState`.                                                                                                                                                                                                                                                             |
| `createWebStoragePersistence` | `<TInput, TState>({ keyFor, storage? }) => JourneyPersistence<TState, TInput>`                                 | Stock `localStorage` / `sessionStorage` adapter. SSR-safe, auto-clears corrupt JSON entries. Pass `storage` to override the backing store.                                                                                                                                                                                             |
| `createMemoryPersistence`     | `<TInput, TState>({ keyFor, initial?, clone? }) => MemoryPersistence<TInput, TState>`                          | `Map`-backed adapter for tests/SSR. Exposes `size()` / `entries()` / `clear()`. Deep-clones on `save` and `load` by default.                                                                                                                                                                                                           |

### Rendering + context (`@modular-react/journeys`)

| Export                | Purpose                                                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JourneyProvider`     | Context provider for the runtime and optional `onModuleExit`. Mount once at the shell root.                                                                                                                                         |
| `useJourneyContext`   | Reads the current provider value, or `null`.                                                                                                                                                                                        |
| `JourneyOutlet`       | Renders the current step of a journey instance. Handles loading, error boundary, terminal, and abandon-on-unmount. By default walks the active call chain and renders the leaf — pass `leafOnly={false}` for layered presentations. |
| `useJourneyCallStack` | `(runtime, rootId) => readonly InstanceId[]` — returns the live root → … → leaf chain. Subscribes to every link so the array re-resolves when the chain shifts.                                                                     |
| `ModuleTab`           | Renders a single module entry outside a route. Non-journey counterpart to `JourneyOutlet`.                                                                                                                                          |

### Runtime + validation (`@modular-react/journeys`)

| Export                                                          | Purpose                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createJourneyRuntime`                                          | Low-level runtime factory. Normally called by the registry; exported for advanced use (test harnesses, custom hosts).                                                                                                                                                                 |
| `validateJourneyContracts`                                      | Cross-checks a journey's transitions and `moduleCompat` against registered modules. Runs automatically at `resolveManifest()` / `resolve()`; exported for custom validation flows.                                                                                                    |
| `validateJourneyDefinition`                                     | Structural sanity check on a definition's own shape. Runs automatically in `registerJourney`.                                                                                                                                                                                         |
| `parseRange` / `parseVersion` / `satisfies` / `satisfiesParsed` | Subset of `npm` semver used by the `moduleCompat` validator. Useful when an app wants to run the same compatibility math against a custom registry (e.g. plugin-host scenarios). See [Pattern - module compatibility (`moduleCompat`)](#pattern---module-compatibility-modulecompat). |
| `SemverParseError`                                              | Thrown by `parseRange` / `parseVersion` on malformed input.                                                                                                                                                                                                                           |
| `JourneyValidationError`                                        | Aggregated validation error. `.issues: readonly string[]`.                                                                                                                                                                                                                            |
| `JourneyHydrationError`                                         | Thrown from `hydrate` / async-load when the blob is unusable.                                                                                                                                                                                                                         |
| `UnknownJourneyError`                                           | Thrown from `runtime.start(journeyId, input)` when `journeyId` is not registered. Catch this specifically in shell-state rehydration loops (see [Rehydrating shell-level work](#rehydrating-shell-level-work-tabs-task-queues-drafts)); surface anything else as a real bug.          |

### Runtime methods (the `JourneyRuntime` returned as `manifest.journeys`)

| Method                                  | Description                                                                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start(handle, input)`                  | **Preferred.** Start or resume an instance via a handle (`defineJourneyHandle`); `input` is type-checked end-to-end. Idempotent per persistence key.           |
| `start(journeyId, input)`               | String-id form for dynamic dispatch (e.g. navbar `{ kind: "journey-start", journeyId }`). Accepts any `input`.                                                 |
| `hydrate(journeyId, blob)`              | Explicit read-only hydrate. Persistence-unlinked. Returns `InstanceId`.                                                                                        |
| `getInstance(id)`                       | Current snapshot of an instance, or `null`. Stable-identity between changes (for `useSyncExternalStore`).                                                      |
| `listInstances()` / `listDefinitions()` | Enumerate. Useful for admin tooling.                                                                                                                           |
| `isRegistered(journeyId)`               | Cheap "is this id known?" predicate. Use to filter persisted shell state before calling `start()` - keeps the expected-drop path out of the exception channel. |
| `subscribe(id, listener)`               | Subscribe to change notifications for one instance. Returns unsubscribe.                                                                                       |
| `end(id, reason?)`                      | Force-terminate. Fires `onAbandon` if active; treats `loading` as a direct abort without firing `onAbandon`.                                                   |
| `forget(id)` / `forgetTerminal()`       | Drop terminal instances from memory. `forget` is a no-op on active/loading; `forgetTerminal` batches them all.                                                 |

### Registration options (passed to `registry.registerJourney`)

```ts
interface JourneyRegisterOptions<TState = unknown, TInput = unknown> {
  /**
   * Fires after every transition, in addition to the definition's
   * `onTransition`. Useful for shell telemetry that doesn't belong in
   * journey authoring code.
   */
  onTransition?: (ev: TransitionEvent) => void;
  /**
   * Fires when the journey reaches `{ complete }`. Runs after the
   * definition-level `onComplete` (both fire). Shell-level completion
   * analytics belong here.
   */
  onComplete?: (ctx: TerminalCtx<TState>, result: unknown) => void;
  /**
   * Fires on abort (via `{ abort }` transition, a thrown handler, or
   * `runtime.end(id)`). Runs after the definition-level `onAbort`.
   */
  onAbort?: (ctx: TerminalCtx<TState>, reason: unknown) => void;
  /**
   * Overrides the definition's `onAbandon` when `runtime.end(id)` is
   * called on an active instance. Use to swap abandon behaviour for a
   * specific deployment (e.g. "save as completed on end-of-shift" vs
   * the journey author's default "abort").
   */
  onAbandon?: (ctx: AbandonCtx) => TransitionResult;
  /**
   * Layered on top of the definition-level `onHydrate` - runs **after**
   * the definition transforms the blob. Useful for shell-level migrations
   * the journey author doesn't know about (redacting env-specific ids on
   * load, etc.).
   */
  onHydrate?: (blob: SerializedJourney<TState>) => SerializedJourney<TState>;
  /**
   * Observation-only error hook. Fires whenever a step component throws,
   * a transition handler throws, an invoke fails validation (unknown
   * journey id, unknown resume name, `runtime.start` itself threw), a
   * resume handler throws, or a custom `onAbandon` crashes. The runtime
   * still aborts / retries according to the outlet's `onStepError`
   * policy - use this for telemetry, not control flow.
   *
   * The `phase` discriminator lets telemetry distinguish a step-render
   * throw from a control-plane failure: `"step"` for component throws,
   * `"invoke"` for invoke validation / start failures, `"resume"` for
   * resume-handler throws and resume-name lookup failures at child
   * terminal time, `"abandon"` for a custom `onAbandon` crash.
   */
  onError?: (
    err: unknown,
    ctx: {
      step: JourneyStep | null;
      phase: "step" | "invoke" | "resume" | "abandon";
    },
  ) => void;
  /**
   * Optional. Without it, journeys live in memory only - every
   * `runtime.start()` mints a fresh instance and nothing is written to
   * storage.
   */
  persistence?: JourneyPersistence<TState>;
  /**
   * Maximum `history` entries retained (oldest dropped). See the caveat
   * with `allowBack` below.
   */
  maxHistory?: number;
  /**
   * Optional nav contribution. When set, the journeys plugin emits a
   * navigation item for this journey so pure launchers don't need a
   * shadow module to host them. The contributed item carries
   * `action: { kind: "journey-start", journeyId, buildInput }`; the
   * shell's navbar dispatcher starts the journey on click.
   */
  nav?: JourneyNavContribution<TInput>;
  /**
   * Cap on the depth of an in-flight invoke chain that includes this
   * journey. Resolved as the **minimum** non-undefined `maxCallStackDepth`
   * across the active chain (ancestors + parent + child). Default: `16`.
   * See [Cycle and recursion safety](#cycle-and-recursion-safety).
   */
  maxCallStackDepth?: number;
  /**
   * Cap on consecutive resume bounces at the same parent step (a "bounce"
   * is a resume returning `{ invoke }` instead of advancing). Default:
   * `8`. Per-parent only — children don't influence their parent's budget.
   */
  maxResumeBouncesPerStep?: number;
}

interface JourneyNavContribution<TInput = unknown> {
  label: string;
  icon?: string | React.ComponentType<{ className?: string }>;
  group?: string;
  order?: number;
  hidden?: boolean;
  meta?: unknown;
  /** Builds the journey's `input` at click time. Typed against `TInput`. */
  buildInput?: (ctx?: unknown) => TInput;
}
```

**Journey-contributed nav.** Set `options.nav` on `registerJourney` when the journey is reachable from a top-level navbar entry without a dedicated launcher module. The journeys plugin collects every `nav` block at manifest time and merges them into `manifest.navigation` alongside module-contributed items. Items the plugin emits carry an `action: { kind: "journey-start", journeyId, buildInput }` - the framework stays agnostic about how the shell dispatches the action; the shell's navbar renderer switches on `action` to start the journey via `runtime.start(journeyId, buildInput?.())`.

Apps with a narrowed `TNavItem` (typed i18n labels, typed action union, typed meta bag) should supply a `buildNavItem` adapter on `journeysPlugin({ buildNavItem })` to reshape the plugin's default item into the app-narrowed type:

```ts
journeysPlugin<AppNavItem>({
  buildNavItem: (defaults, raw) => ({
    ...defaults,
    meta: { analytics: `launch-${raw.journeyId}` },
  }),
});
```

See the React Router example shell (`examples/react-router/customer-onboarding-journey/shell/`) for an end-to-end wiring: the `quick-bill` journey surfaces itself as the navbar "Start a quick bill" button; the shell's `TopNav` component renders items based on whether they carry an `action` or a plain `to`.

### Serialized shape (persistence)

```ts
interface SerializedJourney<TState> {
  definitionId: string;
  version: string;
  instanceId: string;
  status: "active" | "completed" | "aborted";
  step: { moduleId: string; entry: string; input: unknown } | null;
  history: ReadonlyArray<{ moduleId: string; entry: string; input: unknown }>;
  /** Index-aligned with `history`; `null` for entries without a rollback snapshot. */
  rollbackSnapshots?: ReadonlyArray<TState | null>;
  /** Present only on terminal blobs - mirrors the transition's `complete`/`abort` payload. */
  terminalPayload?: unknown;
  state: TState;
  startedAt: string;
  updatedAt: string;
  /**
   * Set when this instance has invoked a child journey that hasn't yet
   * resumed. `childPersistenceKey` is `null` when the child journey has
   * no persistence configured. Cleared on resume / cascade-end.
   */
  pendingInvoke?: {
    childJourneyId: string;
    childInstanceId: string;
    childPersistenceKey: string | null;
    resumeName: string;
  };
  /**
   * Set on a child instance whose parent invoked it. Mirrors the
   * parent's `pendingInvoke` so a child blob loaded out-of-order on
   * reload still knows which parent to resume.
   */
  parentLink?: {
    parentInstanceId: string;
    resumeName: string;
  };
}
```

### Testing (`@modular-react/journeys/testing`)

| Export               | Purpose                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `simulateJourney`    | Headless simulator: fires exits / goBack, exposes `step` / `currentStep` (throws if terminal) / `state` / `history` / `status` / `transitions` / `terminalPayload` / `serialize()`, no React. |
| `JourneySimulator`   | Type for the object returned by `simulateJourney`.                                                                                                                                            |
| `createTestHarness`  | Wraps a live `JourneyRuntime` so tests can fire exits, call `goBack`, and inspect instance internals without mounting `<JourneyOutlet>`. Replaces reaching for `getInternals` directly.       |
| `JourneyTestHarness` | Type returned by `createTestHarness`.                                                                                                                                                         |

### From the router runtime packages

| Export                                    | Purpose                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `registry.registerJourney(def, options?)` | Adds a journey to the registry. Structural check runs immediately; contract check at resolve time.          |
| `manifest.journeys`                       | The `JourneyRuntime` bound to the resolved registry. Always non-null (no-op when no journey is registered). |
| `manifest.moduleDescriptors`              | Map of module id → descriptor. Consumed by `<ModuleTab>` and by any code rendering a module entry directly. |
| `ResolveManifestOptions.onModuleExit`     | Shell-level fallback for module exits fired through `<ModuleTab>`. Wire to analytics or global tab-close.   |

## Example projects

Complete, runnable walk-throughs live under `examples/`:

- [`examples/react-router/customer-onboarding-journey/`](../../examples/react-router/customer-onboarding-journey/) - React Router integration.
- [`examples/tanstack-router/customer-onboarding-journey/`](../../examples/tanstack-router/customer-onboarding-journey/) - TanStack Router integration with the same modules and journey.

Each `customer-onboarding-journey` example demonstrates:

- `defineEntry` / `defineExit` across three modules (profile, plan, billing).
- `defineJourney` composing them with typed transitions and a shared state.
- `registry.registerJourney(...)` with a localStorage persistence adapter - reload the page mid-flow and the tab resumes at the last step.
- A minimal tabbed shell mounting `<JourneyOutlet>` and `<ModuleTab>` side-by-side.
- `WorkspaceActions.openTab({ kind: 'journey', … })` as the shell-facing API, with `openModuleTab` kept as a `@deprecated` shim.

The `integration-setup-journey` examples demonstrate the [`selectModule` / `selectModuleOrDefault`](#pattern--exhaustive-state-driven-module-dispatch-selectmodule) dispatch helpers paired with slot-driven discovery:

- [`examples/react-router/integration-setup-journey/`](../../examples/react-router/integration-setup-journey/) - React Router integration with Playwright coverage of every dispatch branch.
- [`examples/tanstack-router/integration-setup-journey/`](../../examples/tanstack-router/integration-setup-journey/) - TanStack Router mirror.

What they show:

- A generic `integration-picker` module that reads `useSlots<AppSlots>().integrations` and renders a row per contributing module - the picker stays agnostic of which integrations exist.
- Modules contribute themselves to the `integrations` slot at registration time. Two of them (`github`, `strapi`) own dedicated configure components; two (`contentful`, `notion`) are headless `defineSlots` modules with no UI.
- The journey's `chosen` transition uses `selectModuleOrDefault` to route github + strapi to their dedicated steps and funnel everything else through `generic-integration`.
- An inline note on when to swap to `selectModule` (exhaustive) instead - useful if every kind earns its own dedicated module.

The `journey-invoke` examples demonstrate [Composing journeys (invoke / resume)](#composing-journeys-invoke--resume) — a parent (`checkout`) suspends mid-flow to run a child (`verify-identity`), picks up the child's typed terminal payload, and continues:

- [`examples/react-router/journey-invoke/`](../../examples/react-router/journey-invoke/) - React Router integration.
- [`examples/tanstack-router/journey-invoke/`](../../examples/tanstack-router/journey-invoke/) - TanStack Router mirror.

What they show:

- The `invoke()` helper threading the child handle's `TInput` / `TOutput` through to the parent's transition — wrong-shaped `input` is a compile error.
- The sibling `resumes` map keyed identically to `transitions`, with a `ChildOutcome<TOutput>` discriminated union narrowing `outcome.payload` for the completed branch.
- Both parent and child registered with persistence adapters — reload mid-verification and the runtime auto-rehydrates the call chain via `pendingInvoke.childPersistenceKey` and relinks parent ↔ child.
- A `<JourneyOutlet>` rendering the leaf of the active call chain (the default), plus `useJourneyCallStack` driving a small "call stack" banner.
- An `onTransition` hook that filters on `kind` to log invoke / resume hops distinctly from ordinary step transitions.
