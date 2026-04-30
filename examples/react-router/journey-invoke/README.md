# Journey invoke / resume — React Router example

Demonstrates the `invoke` / `resume` primitive in `@modular-react/journeys`: a
parent journey suspends mid-flow to run a child journey, picks up its typed
terminal payload, and continues. Persistence round-trips both sides so a
reload mid-verification restores the parent and child intact.

## What's in here

- `journeys/checkout/` — the parent. Two steps (`review`, `confirm`) plus an
  `invoke` of the child journey on the way through.
- `journeys/verify-identity/` — the child. Single-step age check, completes
  with an `AgeVerificationToken`.
- `modules/checkout-review/`, `modules/age-verify/`, `modules/checkout-confirm/`
  — three plain modules with typed entry/exit points. They know nothing about
  journeys.
- `shell/` — minimal React Router app. Registers everything and renders one
  `<JourneyOutlet>` that follows the leaf of the call chain.

## Run it

```bash
pnpm install
pnpm --filter @example-rr-invoke/shell dev
```

Open the dev URL Vite prints. Click **Start checkout**, click **Proceed**,
then either complete the verification or decline it. The console logs every
`TransitionEvent` with its `kind` so you can see the parent emit an `invoke`
event, the child emit `step` events, and the parent emit a `resume` event
when control returns.

## Try the reload trick

1. Click **Start checkout** → **Proceed**.
2. With the verify modal showing, **reload the page** (`Cmd+R`).
3. The parent and child both rehydrate from `localStorage`, the runtime
   relinks them, and you land back on the verify step. Complete it and the
   parent advances to confirm exactly as it would have.

The parent's blob carries `pendingInvoke: { childInstanceId, resumeName, … }`;
the child's carries `parentLink: { parentInstanceId, resumeName }`. After
hydrate, the runtime walks the in-memory pairs and rebuilds the parent ↔
child link. Order doesn't matter — the relinker reconciles either way.

## Read the code in this order

1. `app-shared/src/index.ts` — domain types (`OrderSummary`,
   `AgeVerificationToken`).
2. `journeys/verify-identity/src/verify-identity.ts` — the child. Notice the
   third generic on `defineJourney<TModules, TState, TOutput>()` pinning the
   terminal payload type to `AgeVerificationToken`.
3. `journeys/checkout/src/checkout.ts` — the parent. The `review.confirmAge`
   exit handler returns `{ invoke: { handle, input, resume: "afterAgeVerified" } }`,
   and the sibling `resumes` map declares `afterAgeVerified` typed against
   the child's `TOutput`.
4. `shell/src/main.tsx` — wires everything: registers the modules, both
   journeys (with persistence adapters), and renders the outlet.
5. `shell/src/components/Home.tsx` — uses `useJourneyCallStack` to render a
   little banner showing the active call chain.
