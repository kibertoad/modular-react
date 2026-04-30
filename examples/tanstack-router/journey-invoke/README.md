# Journey invoke / resume — TanStack Router example

Same shape as the [React Router variant](../../react-router/journey-invoke/),
just with `@tanstack/react-router` and `@tanstack-react-modules/runtime` for
the routing surround. The parent (`checkout`) invokes the child
(`verify-identity`) mid-flow, picks up the typed terminal payload, and
continues. Both blobs round-trip through `localStorage` so a reload during
the verify step relinks them automatically.

## Run it

```bash
pnpm install
pnpm --filter @example-tsr-invoke/shell dev
```

Vite serves it on port 5176 (the React Router variant uses 5175). Click
**Start checkout**, **Proceed**, then verify or decline. The console logs
every `TransitionEvent` tagged with its `kind`.

## Try the reload trick

Same as the RR variant — start checkout, click Proceed, reload during the
verify step. Both journeys rehydrate; `relinkInvocations()` walks the in-
memory `parent` / `activeChildId` fields to rebuild the runtime's link.

## Read the code in this order

1. `app-shared/src/index.ts` — `OrderSummary`, `AgeVerificationToken`.
2. `journeys/verify-identity/src/verify-identity.ts` — child journey,
   third generic on `defineJourney<TModules, TState, TOutput>()` pins the
   terminal payload type.
3. `journeys/checkout/src/checkout.ts` — parent journey, `invoke` clause
   in the exit handler and the sibling `resumes` map keyed by `[mod][entry]`.
4. `shell/src/main.tsx` — registers everything; renders one outlet that
   follows the leaf of the call chain.
