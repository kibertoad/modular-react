# Customer onboarding journey example

End-to-end demonstration of the **journeys** abstraction (`@modular-react/journeys`). An enablement-team rep walks a new customer through sign-up:

1. Open the **profile** module to confirm the customer's account and get a plan suggestion.
2. Depending on the conversation, branch into **plan** to pick a subscription, or straight into **billing** if the customer already knows what they want.
3. Plan selection feeds into **billing** — either a one-off payment for the first month, or a free-trial activation (no charge).
4. Journey completes, the tab closes.

Modules are journey-unaware: each declares typed entry points and typed exit points. The journey declares the transitions. The shell only mounts `<JourneyOutlet>` and wires tab close on completion.

## What this example shows

- `defineEntry` / `defineExit` on each module (profile, plan, billing).
- `defineJourney` composing the three modules with typed transitions.
- `registry.registerJourney(...)` with a **localStorage persistence adapter** — reload the page mid-flow and the journey resumes where you left off.
- `<JourneyOutlet>` rendering the current step inside a tab; `onFinished` closes the tab.
- `WorkspaceActions.addJourneyTab(...)` for tab bookkeeping after the caller mints an instance via `useJourneyContext().runtime.start(...)`. `openTab({ kind: 'module', ... })` handles plain module tabs; `openModuleTab` is a `@deprecated` shim.
- **Multiple cohesive journeys in one package** — `customer-onboarding`, `plan-switch`, and `quick-bill` all live under `journeys/customer-onboarding/` (each in its own file). Nothing forces one-journey-per-package; a team-owned, same-domain package keeps related journeys together.
- **Router-mode "step 0" with `<ModuleRoute>`** — visit `/launch` to see a launcher module render standalone as a route element. Clicking a workflow option emits a typed exit; the shell's `onModuleExit` dispatcher is the single place that knows which exit maps to which journey. Same pattern works for `<ModuleTab>` in workspace-mode shells.

## Layout

```text
app-shared/                  AppDependencies, AppSlots, WorkspaceActions
modules/
  profile/                   entry: review
  plan/                      entry: choose (allowBack: 'preserve-state')
  billing/                   entries: collect (allowBack: 'rollback'), startTrial
journeys/
  customer-onboarding/       three cohesive growth journeys
    customer-onboarding.ts     full intake → plan → billing
    plan-switch.ts             plan → billing (for existing customers)
    quick-bill.ts              billing only (one-step charge)
shell/                       minimal tabbed shell + localStorage persistence
  launcher-module.tsx          step-0 workflow picker (renders at /launch)
```

## Running

From the repo root:

```bash
pnpm install
pnpm --filter customer-onboarding-shell dev
```

Open the printed URL, click **Start for customer C-1**. Walk through the flow; reload mid-step to see persistence-backed recovery.

## Why a separate example

Journeys are a distinct concern from the CMS/integration story in `integration-manager`; mixing them would clutter both. See the [journeys package README](../../../packages/journeys/README.md) for the full contract and API surface.
