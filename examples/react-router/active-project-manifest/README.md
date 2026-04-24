# Active Project Manifest Example (React Router)

A runnable example of the **swap** topology of the [Remote Capability Manifests](../../../docs/remote-capability-manifests.md) pattern: exactly one manifest is active at a time, and switching projects _replaces_ it rather than merging with what was there.

Contrast with the sibling [`remote-capabilities`](../remote-capabilities/README.md) example, which demonstrates the **cumulative** topology (a catalog of integrations, all simultaneously visible, merged with `mergeRemoteManifests`).

Both examples share the exact same `IntegrationDefinition` slot item and nearly identical capability-gated shared components — the whole point is that the library doesn't care which topology you pick. Only the store shape and a single line in `dynamicSlots` differ.

## What this demonstrates

- **Swap topology.** The store holds `activeManifest: AppRemoteManifest | null`, not an array. `dynamicSlots` reads it directly: `deps.integrations.activeManifest?.slots ?? {}` — no `mergeRemoteManifests` call.
- **Fetch on user action, not at boot.** The module has **no `lifecycle.onRegister`**. Fetching is triggered when the user picks a project in the sidebar (`selectProject(id)` on the store). Each project has its own manifest endpoint.
- **The same capability-gated shared component.** `IntegrationPage.tsx` is structurally identical to the cumulative example's `IntegrationCard`: auth badge, filter chips, and action buttons are all decided by the active manifest's declared capabilities. Swap to a project with only `importTracking` → only "Start import" renders. Swap to one with no write capabilities → you get the "read-only integration" hint instead.
- **Stale-fetch guard.** If the user clicks between projects rapidly, the store's `selectProject` drops the earlier fetch's result when its `activeProjectId` no longer matches — a tiny detail but important for swap UX.

## Run it

From the repository root:

```bash
pnpm install                                                   # installs everything
pnpm turbo run build --filter="./packages/*"                   # build library dist/ so types resolve
pnpm --filter active-project-shell dev                         # start this example's dev server
```

Open the printed URL. Click a project in the sidebar, then open **Integration** — you'll see the rendered card morph as you switch between _Project Alpha_ (Salesforce, OAuth, import + sync), _Project Beta_ (Zendesk, API key, import only), and _Project Gamma_ (Mixpanel, API key, read-only).

### Try swapping

1. With the dev server running, pick _Project Alpha_ in the sidebar. Note the OAuth badge, two filter chips, two action buttons.
2. Click _Project Gamma_. Same card component renders, but now you see an API-key badge, one daterange chip, and the "No write capabilities — read-only integration" hint.
3. Open `shell/public/projects/project-gamma.json` and add a `contactSync` capability:

   ```json
   "capabilities": {
     "contactSync": { "version": 1, "data": { "direction": "push" } }
   }
   ```

4. Re-click _Project Gamma_ in the sidebar (the fetch is not cached between clicks). The "Sync contacts (push)" button appears — no FE change, no rebuild.

## File tour

```
active-project-manifest/
├── app-shared/
│   └── src/index.ts           # AppDependencies, AppSlots (single `integration` slot),
│                              # IntegrationDefinition (rich slot-item shape),
│                              # IntegrationsStore shape (swap, not merge),
│                              # Project type (for the picker)
│
├── modules/integrations/
│   ├── src/index.ts           # defineModule — dynamicSlots reads activeManifest,
│   │                          # NO lifecycle.onRegister
│   ├── src/index.test.ts      # resolveModule tests for the module
│   └── src/pages/
│       └── IntegrationPage.tsx  # shared component — reads the single active
│                                # integration and conditionally renders UI
│
└── shell/
    ├── public/projects/
    │   ├── project-alpha.json     # one manifest per project (the "backend")
    │   ├── project-beta.json
    │   └── project-gamma.json
    ├── src/main.tsx           # registry wiring + recalculateSlots subscription
    ├── src/projects.ts        # hard-coded project list for the picker
    ├── src/services/
    │   └── integrations-client.ts  # fetch + validate a single manifest
    ├── src/stores/
    │   └── integrations.ts    # store factory with async selectProject action
    └── src/components/
        ├── ProjectPicker.tsx  # the control that drives the swap
        ├── Sidebar.tsx, ShellLayout.tsx, Home.tsx, RootLayout.tsx
```

## Key points illustrated

- `AppSlots.integration: readonly IntegrationDefinition[]` — the slot is still an array because slot items _are_ arrays, but it holds zero or one entry at a time in the swap topology.
- `dynamicSlots: (deps) => deps.integrations.activeManifest?.slots ?? {}` — one line. The helper used by the cumulative example (`mergeRemoteManifests`) isn't needed here because there's nothing to merge.
- Async fetch lives on the store as `selectProject`, closed over the `IntegrationsClient` that was injected when the store was created. UI code stays dumb.
- Stale-fetch guard in `selectProject`: `if (get().activeProjectId !== projectId) return;` after `await` — the usual cautious-async pattern for rapid-switch UIs.

## Tests

From the repository root:

```bash
pnpm --filter @example-active/integrations-module test
```

The test file exercises the full module boundary with `resolveModule` from `@modular-react/testing`:

- Slots come from the pre-seeded active manifest.
- Empty slots when no project is active.
- The module has no `onRegister` — fetching is UI-driven.

## Related reading

- Guide: [Remote Capability Manifests](../../../docs/remote-capability-manifests.md) — see the "Storing: merge-many vs swap-one" section.
- Sibling example: [Remote Capabilities (cumulative topology)](../remote-capabilities/README.md).
- Fundamentals: [Shell Patterns](../../../docs/shell-patterns.md) (slots, `dynamicSlots`, `recalculateSlots`).
- API: [`@modular-react/core`](../../../packages/core).
