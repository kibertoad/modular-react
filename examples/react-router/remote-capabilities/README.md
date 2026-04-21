# Remote Capabilities Example (React Router)

A runnable example of the **cumulative** topology of the [Remote Capability Manifests](../../../docs/remote-capability-manifests.md) pattern: generic integrations are delivered as JSON from the backend, merged together with `mergeRemoteManifests`, and rendered through pre-existing components without any code change per integration.

For the **swap** topology (one active manifest at a time, replaced on context change), see the sibling [`active-project-manifest`](../active-project-manifest/README.md) example.

## What this demonstrates

This example shows **both** shapes that remote manifests typically take in a real app, on a single page:

1. **Catalog enumeration.** Each manifest contributes one tile to the integrations grid. Adding a new integration is a new JSON entry — the FE ships nothing.
2. **Capability-gated shared component.** The tile for each integration is rendered by **one shared `IntegrationCard` component** (`modules/integrations/src/pages/IntegrationsPage.tsx`). It never hard-codes a specific integration — it reads the manifest's `authentication`, `filters`, and `capabilities` and:
   - shows an auth-type badge (OAuth / API key / …),
   - renders a chip per supported filter,
   - renders action buttons (e.g. **Start import**, **Sync contacts**) **only if** the corresponding capability is declared on that integration.

This is why the rich integration shape (auth / filters / capabilities) lives inside the _slot item type_ (`IntegrationDefinition` in `app-shared`), not at the manifest root — see [Designing the slot item type](../../../docs/remote-capability-manifests.md#designing-the-slot-item-type) in the main guide.

The supporting pieces:

- **One local module** (`modules/integrations/`) fetches manifests in `lifecycle.onRegister` and exposes their contributions via `dynamicSlots`.
- **A Zustand store** (`shell/src/stores/integrations.ts`) holds fetched manifests so `dynamicSlots(deps)` can read them and `recalculateSlots()` has something to subscribe to.
- **The shell** (`shell/src/main.tsx`) wires the registry, passes a mock `integrationsClient` service, and subscribes the store to `recalculateSlots` so the UI re-renders when the fetch resolves.
- **The "backend"** (`shell/public/integrations.json`) is a static JSON file served by Vite. Real HTTP fetch, no server required — swap the URL for a real endpoint in production.

## Run it

The example's packages are nested workspace members of the modular-react monorepo, so inter-package deps (`@modular-react/core`, `@react-router-modules/runtime`, etc.) link to the local `packages/*` sources via `link-workspace-packages=true` — any change you make in `packages/*` is reflected immediately.

From the repository root:

```bash
pnpm install                                                   # installs everything
pnpm turbo run build --filter="./packages/*"                   # build library dist/ so types resolve
pnpm --filter shell dev                                        # start this example's dev server
```

Open the printed URL, navigate to **Integrations** in the sidebar. You should see four cards (Salesforce, HubSpot, Zendesk, Mixpanel) loaded from the JSON. Notice that each card shows a **different** set of controls — Salesforce has both _Start import_ and _Sync contacts_, HubSpot has only _Sync contacts_, Mixpanel has neither — because those buttons are gated by each integration's declared `capabilities`.

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

3. **Refresh the browser.** The new card appears with _OAuth_ badge, one _Search_ filter chip, and a single _Sync contacts (push)_ button — all chosen by the shared component from the JSON it just read. Now try deleting the `capabilities` block, or swapping `"type": "oauth"` for `"apikey"`: the UI morphs accordingly, still with no FE edit, no compile, no rebuild.

## File tour

```
remote-capabilities/
├── app-shared/
│   └── src/index.ts           # AppDependencies, AppSlots, AppRemoteManifest type alias,
│                              # IntegrationDefinition (the rich slot-item shape),
│                              # IntegrationsStore shape, IntegrationsClient service
│
├── modules/integrations/
│   ├── src/index.ts           # defineModule with lifecycle.onRegister + dynamicSlots
│   ├── src/index.test.ts      # resolveModule tests for the module
│   └── src/pages/
│       └── IntegrationsPage.tsx  # shared component — reads capabilities and conditionally
│                                 # renders auth badge, filter chips, action buttons
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

From the repository root:

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
