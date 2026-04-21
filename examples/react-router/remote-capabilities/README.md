# Remote Capabilities Example (React Router)

A runnable example of the [Remote Capability Manifests](../../../docs/remote-capability-manifests.md) pattern: generic integrations are delivered as JSON from the backend, and the frontend renders them through pre-existing components without any code change per integration.

## What this demonstrates

- **One local module** (`modules/integrations/`) fetches manifests in `lifecycle.onRegister` and exposes their contributions via `dynamicSlots`.
- **A Zustand store** (`shell/src/stores/integrations.ts`) holds fetched manifests so `dynamicSlots(deps)` can read them and `recalculateSlots()` has something to subscribe to.
- **The shell** (`shell/src/main.tsx`) wires the registry, passes a mock `integrationsClient` service, and subscribes the store to `recalculateSlots` so the UI re-renders when the fetch resolves.
- **The "backend"** (`shell/public/integrations.json`) is a static JSON file served by Vite. Real HTTP fetch, no server required — swap the URL for a real endpoint in production.

## Run it

```bash
pnpm install
pnpm dev
```

Open the printed URL, navigate to **Integrations** in the sidebar. You should see four tiles (Salesforce, HubSpot, Zendesk, Mixpanel) loaded from the JSON.

### Try the zero-FE-change promise

1. With the dev server running, open `shell/public/integrations.json`.
2. Add a new manifest entry at the end of the array — e.g.:

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
           "description": "Sales pipeline management."
         }
       ]
     }
   }
   ```

3. **Refresh the browser.** The new tile appears. No source edit, no TypeScript compile, no rebuild — the same thing that would happen if a real backend had added a row to its response.

## File tour

```
remote-capabilities/
├── app-shared/
│   └── src/index.ts           # AppDependencies, AppSlots, AppRemoteManifest type alias,
│                              # IntegrationsStore shape, IntegrationsClient service
│
├── modules/integrations/
│   ├── src/index.ts           # defineModule with lifecycle.onRegister + dynamicSlots
│   ├── src/index.test.ts      # resolveModule tests for the module
│   └── src/pages/
│       └── IntegrationsPage.tsx
│
└── shell/
    ├── public/
    │   └── integrations.json  # the "backend" response (edit to simulate backend changes)
    ├── src/main.tsx           # registry wiring + recalculateSlots subscription
    ├── src/services/
    │   └── integrations-client.ts  # fetch + validate at the wire boundary
    ├── src/stores/
    │   └── integrations.ts    # Zustand store holding fetched manifests
    └── src/components/        # shell chrome (sidebar, layouts)
```

## Key points illustrated

- `AppRemoteManifest = RemoteModuleManifest<AppSlots, RemoteNavigationItem>` — the wire contract type.
- `integrations-client.ts` validates the payload structurally at the one place it enters the type system.
- The module's `requires: ["integrations", "integrationsClient"]` declares the deps the pattern needs.
- `dynamicSlots: (deps) => mergeRemoteManifests(deps.integrations.manifests).slots` — one line to turn fetched manifests into shell-visible contributions.
- `integrationsStore.subscribe(recalculateSlots)` in `main.tsx` is the bridge that makes async-fetched data drive live UI.

## Tests

```bash
pnpm --filter @example/integrations-module test
```

The test file exercises the full module boundary with `resolveModule` from `@modular-react/testing`:

- Static slots derived from pre-seeded manifests.
- Empty slots when the fetch hasn't completed.
- `onRegister` writing to the store via the injected `setManifests`.
- Error path going through `setError` + `setStatus("error")`.

## Related reading

- Guide: [Remote Capability Manifests](../../../docs/remote-capability-manifests.md)
- Fundamentals: [Shell Patterns](../../../docs/shell-patterns.md) (slots, `dynamicSlots`, `recalculateSlots`)
- API: [`@modular-react/core`](../../../packages/core)
