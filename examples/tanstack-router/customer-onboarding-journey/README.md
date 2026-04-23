# Customer onboarding journey example (TanStack Router)

End-to-end demonstration of the **journeys** abstraction (`@modular-react/journeys`) on the TanStack Router runtime. Mirrors the [React Router twin](../../react-router/customer-onboarding-journey/) with the same modules, the same journey, and the same shell behavior — the only differences are router glue.

An enablement-team rep walks a new customer through sign-up:

1. Open the **profile** module to confirm the customer's account and get a plan suggestion.
2. Depending on the conversation, branch into **plan** to pick a subscription, or straight into **billing** if the customer already knows what they want.
3. Plan selection feeds into **billing** — either a one-off payment for the first month, or a free-trial activation (no charge).
4. Journey completes, the tab closes.

Modules are journey-unaware: each declares typed entry points and typed exit points. The journey declares the transitions. The shell only mounts `<JourneyOutlet>` and wires tab close on completion.

## What this example shows

- `defineEntry` / `defineExit` on each module (profile, plan, billing).
- `defineJourney` composing the three modules with typed transitions.
- `registry.registerJourney(...)` on `@tanstack-react-modules/runtime` with a **localStorage persistence adapter** — reload the page mid-flow and the journey resumes where you left off.
- `<JourneyOutlet>` rendering the current step inside a tab; `onFinished` closes the tab.
- `WorkspaceActions.openTab({ kind: 'journey', ... })` as the shell-facing API, with `openModuleTab` kept as a `@deprecated` shim.
- TanStack `rootComponent` + `indexComponent` hosting a routeless tab workspace: the root layout renders `<TabStrip>` and an `<Outlet />`; the index route renders either the customer picker (Home) or the active tab's content.

## Layout

```text
app-shared/                  AppDependencies, AppSlots, WorkspaceActions
modules/
  profile/                   entry: review
  plan/                      entry: choose (allowBack: 'preserve-state')
  billing/                   entries: collect (allowBack: 'rollback'), startTrial
journeys/
  customer-onboarding/       the journey definition
shell/                       minimal tabbed shell + localStorage persistence
```

## Running

From the repo root:

```bash
pnpm install
pnpm --filter customer-onboarding-shell-tsr dev
```

Open the printed URL (default `http://localhost:5175`), click **Start for Alice Martin**. Walk through the flow; reload mid-step to see persistence-backed recovery.

## Differences from the React Router variant

| Concern                  | React Router version                                       | TanStack Router version (this example)                                           |
| ------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Runtime package          | `@react-router-modules/runtime`                            | `@tanstack-react-modules/runtime`                                                |
| Router package           | `react-router`                                             | `@tanstack/react-router`                                                         |
| Root composition         | `rootComponent: Shell` with Home + TabContent as siblings. | `rootComponent: Shell` (sidebar + `<Outlet />`) with a routed `indexComponent`.  |
| Index content            | Inline conditional inside Shell.                           | Dedicated `HomeOrTab` component wired as `indexComponent`.                       |
| `useNavigation` consumer | Not used here (no nav items).                              | Not used here either — journeys sit on top of navigation, independent of routes. |

The journey logic, module contracts, and persistence layer are byte-identical between the two examples. That's the point: journeys don't depend on the router integration.

## Why a separate example

Journeys are a distinct concern from the CMS/integration story in the other `integration-manager` examples; mixing them would clutter both. See the [journeys package README](../../../packages/journeys/README.md) for the full contract and API surface.
