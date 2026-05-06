# Remote Capabilities + Journey Orchestration (TanStack Router)

A runnable example that combines two `@modular-react/core` patterns on a single page:

1. **Remote capability manifests (cumulative topology).** Generic integrations are delivered as JSON from the backend, merged together with `mergeRemoteManifests`, and rendered through one shared catalog component without any code change per integration.
2. **Journey-driven dispatch to dedicated vs generic configure steps.** Clicking **Configure** on a tile starts the `integration-setup` journey. Its `start()` function uses `selectModuleOrDefault` to dispatch by integration `id` — Salesforce and HubSpot land on dedicated configure modules with bespoke fields; Zendesk, Mixpanel, Pipedrive (and any future kind without a dedicated module) land on the generic configure step.

This is the TanStack Router twin of [`react-router/remote-capabilities`](../../react-router/remote-capabilities/README.md) plus the journey-orchestration story from [`tanstack-router/integration-setup-journey`](../integration-setup-journey/README.md). The two patterns interlock cleanly: the remote manifest decides _what_ exists, the journey decides _how each kind is configured_.

## What this example shows

- **Capability-gated catalog tile.** `IntegrationsPage` renders every integration via the same `<IntegrationCard>` component — auth badge, filter chips, and capability-gated action chips are all read from the typed `IntegrationDefinition`. Adding a new integration on the backend lights up a new card with the right metadata, zero FE changes.
- **Capability-tailored configure UI via journey dispatch.** Two integrations earn dedicated configure modules:
  - `salesforce` — instance URL + sandbox/production toggle on top of OAuth
  - `hubspot` — portal id + private-app token
    Everything else funnels through `generic-integration`'s configure step, which reads `authentication.type` from the manifest to vary its field copy without forking into per-integration components.
- **TanStack-specific routing glue.** The catalog module's `createRoutes` uses `createRoute` + `lazyRouteComponent` (TanStack's frozen-tree code-splitting story) instead of React Router's `lazy`. `useNavigation` and `<Outlet />` come from `@tanstack/react-router` / `@tanstack-react-modules/runtime`.
- **Standard `recalculateSlots()` reactivity.** The integrations store drives both the async fetch result _and_ the per-session "connected" set. A single `integrationsStore.subscribe(recalculateSlots)` wiring in `main.tsx` re-merges slots whenever either changes.

## Layout

```text
remote-capabilities/
├── app-shared/
│   └── src/index.ts             # IntegrationKind, IntegrationDefinition, AppSlots,
│                                # AppRemoteManifest, IntegrationsStore, IntegrationsClient
│
├── modules/
│   ├── integration-catalog/     # Owns /integrations route, lifecycle.onRegister fetch,
│   │                            # dynamicSlots(deps) reading the merged remote manifest
│   ├── salesforce/              # Dedicated configure entry — instance URL + OAuth env
│   ├── hubspot/                 # Dedicated configure entry — portal id + private-app token
│   └── generic-integration/     # Fallback configure entry — single API-key field
│
├── journeys/
│   └── integration-setup/       # The journey + selectModuleOrDefault dispatch
│                                # (called from `start()`, no separate picker step)
│
└── shell/
    ├── public/integrations.json # The "backend" response (edit to simulate backend changes)
    ├── src/main.tsx             # registry + journeysPlugin + recalculateSlots subscription
    ├── src/services/integrations-client.ts
    ├── src/stores/integrations.ts
    └── src/components/          # RootLayout, ShellLayout, Sidebar, Home
```

## Run it

From the repository root:

```bash
pnpm install
pnpm turbo run build --filter="./packages/*"           # build library dist/ so types resolve
pnpm --filter "@example-tsr-remote-capabilities/shell" dev
```

Open the printed URL (default `http://localhost:5176`), navigate to **Integrations** in the sidebar. You should see four cards (Salesforce, HubSpot, Zendesk, Mixpanel) loaded from the JSON. Click **Configure** on any tile:

- **Salesforce** opens the bespoke OAuth form (instance URL + production/sandbox).
- **HubSpot** opens the bespoke API form (portal id + private-app token).
- **Zendesk** / **Mixpanel** open the generic configure form, titled with the kind they came from.

After save, the tile sprouts a **Connected** badge and the button flips to **Reconfigure**.

### Try the zero-FE-change promise

1. With the dev server running, open `shell/public/integrations.json`.
2. Add a new manifest entry for an unrecognized kind by widening `IntegrationKind` in `app-shared/src/index.ts` to include it (e.g. `"pipedrive"`):

   ```json
   {
     "id": "integration:pipedrive",
     "version": "1.0.0",
     "slots": {
       "integrations": [
         {
           "id": "pipedrive",
           "name": "Pipedrive",
           "category": "crm",
           "icon": "crm",
           "description": "Sales pipeline management.",
           "authentication": { "type": "oauth" },
           "filters": [{ "id": "search", "type": "search", "query": "term={value}" }],
           "capabilities": {
             "contactSync": { "version": 1, "data": { "direction": "push" } }
           }
         }
       ]
     }
   }
   ```

3. Reload. The Pipedrive tile appears with the right badges, and clicking **Configure** opens the **generic** configure form because `pipedrive` doesn't have a dedicated module — the journey's `selectModuleOrDefault` fallback handled it automatically.

## Tests

### Unit tests (catalog module)

```bash
pnpm --filter "@example-tsr-remote-capabilities/integration-catalog" test
```

Covers the boundary `dynamicSlots` exposes:

- merged slots from pre-seeded manifests
- empty slots when the fetch hasn't completed
- `onRegister` writing to the store via the injected `setManifests`
- error path going through `setError` + `setStatus("error")`

### E2E tests (journey dispatch)

```bash
pnpm --filter "@example-tsr-remote-capabilities/shell" test:e2e
```

These run on **every PR in CI** via the `examples-e2e` matrix in `.github/workflows/ci.yml`. Coverage:

- catalog renders one tile per remote manifest, with capability-gated chips
- Salesforce branch hits the dedicated configure module (asserts the bespoke instance URL field)
- HubSpot branch hits the dedicated module (asserts the bespoke portal id + token fields)
- Zendesk branch falls through to generic
- Mixpanel branch also falls through to generic
- Cancel on a configure step aborts without marking connected
- Two back-to-back journeys stay isolated
- Reconfiguring a connected integration restarts a fresh journey instance

## Key points illustrated

- `AppRemoteManifest = RemoteModuleManifest<AppSlots, RemoteNavigationItem>` — the wire contract type.
- `integrations-client.ts` validates the payload structurally at the one place it enters the type system.
- The catalog module's `requires: ["integrations", "integrationsClient"]` declares the dependency contract.
- `dynamicSlots: (deps) => mergeRemoteManifests(deps.integrations.manifests).slots` — one line to turn fetched manifests into shell-visible contributions.
- The journey's `start()` calls `select(state.integration.id, { salesforce, hubspot }, fallback)` — dispatch happens at journey boot, not in a transition, because the catalog tile already chose which integration to configure.
- `integrationsStore.subscribe(recalculateSlots)` in `main.tsx` is the bridge that drives live UI from both the async fetch and journey terminations.

## Related reading

- Guide: [Remote Capability Manifests](../../../docs/remote-capability-manifests.md)
- Sibling example: [`integration-setup-journey`](../integration-setup-journey/README.md) — same dispatch pattern, with a slot-driven picker instead of a remote manifest catalog
- Sibling example: [`react-router/remote-capabilities`](../../react-router/remote-capabilities/README.md) — same remote-manifest pattern on React Router, without journey orchestration
- API: [`@modular-react/core`](../../../packages/core), [`@modular-react/journeys`](../../../packages/journeys), [`@tanstack-react-modules/runtime`](../../../packages/tanstack-router-runtime)
