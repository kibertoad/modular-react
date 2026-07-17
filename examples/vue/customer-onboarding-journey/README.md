# Customer Onboarding Journey — Vue Router

A multi-module onboarding flow (`profile → plan → billing`) composed with [`@modular-vue/journeys`](../../../packages/vue-journeys). Shows entry/exit contracts, branching, serializable shared state, a lazy-loaded step, and workspace-tab persistence — the Vue analog of the React Router [customer-onboarding-journey](../../react-router/customer-onboarding-journey) example.

## Layout

```text
app-shared/                domain types (PlanTier, PlanHint, …), AppSlots,
                           the WorkspaceActions contract, typed composables
journeys/
  customer-onboarding/     the journey definition (framework-neutral) + typed handle
modules/
  profile/                 review step — suggests a plan, branches to plan or billing (SFC)
  plan/                    tier picker — charge now vs start a trial (SFC)
  billing/                 collect payment (lazy) or start trial (SFC)
shell/                     the Vite app: registers modules + the journey, hosts the
                           JourneyOutlet in a workspace tab, persists to localStorage
```

## Run it

```bash
pnpm install
pnpm --filter "@example-vue-onboarding/shell" dev
```

Pick a customer to start the journey. State persists to `localStorage` on every transition — reload mid-flow and the tab resumes at the exact step.

## Key files to read

- `journeys/customer-onboarding/src/customer-onboarding.ts` — the journey graph: `start`, `transitions` (with a branch and terminal-only annotations), `initialState`, `onAbandon`, `onHydrate`, and `moduleCompat`. Identical to the React source bar the import path.
- `modules/profile/src/ReviewProfile.vue` — a journey step as a module entry SFC. `defineProps<ModuleEntryProps<Input, Exits>>()` receives `{ input, exit, goBack }`.
- `modules/billing/src/index.ts` — a **lazy** `collect` entry (`lazy: () => import('./CollectPayment.vue')`) with `allowBack: "rollback"`, plus an eager `startTrial` entry.
- `shell/src/main.ts` — `createRegistry(...).use(journeysPlugin())`, `registerJourney(..., { persistence })`, `resolveManifest()`, and tab rehydration.
- `shell/src/components/TabContent.vue` — hosts `<JourneyOutlet>`; the runtime comes from the `<JourneyProvider>` threaded into the manifest's `Providers`.

## How it differs from the React Router example

Same journey engine, framework-forced differences:

- **The journey definition is unchanged** except for importing from `@modular-vue/journeys`. Journeys are framework-neutral — the engine is shared.
- **Steps are SFCs.** A journey step is a module entry component; the outlet passes `{ input, exit, goBack, goForward }`, which the SFC declares via `defineProps<ModuleEntryProps<…>>()`.
- **The shell owns the router and uses `resolveManifest()` (framework mode).** The manifest's `Providers` component wraps `<router-view>` and threads the journeys plugin's `<JourneyProvider>`, so a `<JourneyOutlet>` reads the runtime from context with no hand-wiring.
- **Tab state is Vue reactivity, not zustand.** The workspace-tabs store is a `reactive` singleton persisted with a `watch`; components read it directly.
