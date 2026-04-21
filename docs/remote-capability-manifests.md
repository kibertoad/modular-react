# Remote Capability Manifests

This guide covers a pattern for driving parts of your modular app from **backend-delivered JSON manifests**. The backend enumerates which "generic capabilities" (third-party integrations, partner catalogs, feature packs, tenant-scoped extensions) the frontend should expose, and the frontend renders them through pre-existing components — no FE code change needed to light up a new one.

> **Prerequisite:** this guide assumes you understand the module descriptor, slots, and `dynamicSlots` from [Shell Patterns (Fundamentals)](shell-patterns.md). Remote manifests are a thin layer on top of those primitives — they do not introduce a new module registration path.

## When this pattern is useful

Use remote capability manifests when **the set and contents of some capabilities change independently of FE releases**, and those capabilities can be rendered by a small number of existing components that only differ by data.

Concretely, the pattern shines when all of these are true:

1. **The capability list is large or open-ended.** Salesforce, HubSpot, Zendesk, Pipedrive, and the next partner you integrate next quarter. Hard-coding each one means shipping FE to onboard every integration.
2. **Capabilities are homogeneous.** They share a component or render strategy — an iframe, a catalog tile, a command palette entry, a route-less tool launcher — and only their data differs (name, icon id, URL, category, permissions).
3. **The backend is the source of truth.** Enablement (per-tenant, per-feature-flag, per-license, per-environment) is decided server-side. The FE should display whatever the backend returns for the current user and nothing else.
4. **Updates need to be near-real-time.** A sales ops admin flips "HubSpot enabled" on the backend; the tile appears on next fetch, without a frontend deploy.

Typical shapes this unlocks:

- **Generic integrations module** — a catalog of CRMs/ERPs/ticketing systems the current tenant is licensed for. Adding one is a backend config change.
- **Partner / marketplace surfaces** — a command palette entry per installed partner app; the shell knows nothing about specific partners.
- **Plugin-style capability packs** — "reporting pack", "admin pack", "trial features" each contributing commands, catalog entries, or badge metadata.
- **Per-tenant customization** — same FE binary, different visible capabilities per customer, decided at login.

The net effect: **adding a new generic capability is a backend-only change.** The frontend already renders anything the shape allows — the backend just adds it to the response.

### When NOT to use this

Remote manifests deliberately do **not** deliver React components, routes, or business logic. If the new capability needs any of those, it must ship as code. Signals you're fighting the pattern:

- You're trying to encode a component reference as a string and map it in the FE. That reinvents the module system. Ship the module as code and use [`registerLazy`](shell-patterns.md) for code-splitting.
- You're trying to ship per-capability logic (validators, effects, route loaders) via JSON. Keep that in a local module; let the manifest only carry data.
- Capabilities are few and stable. One line per capability in a local module array is simpler than a fetch + store + `dynamicSlots` round trip.

## What a remote manifest can carry

Remote manifests are a **strict subset** of a [`ModuleDescriptor`](../packages/core/src/types.ts) — only data that survives a round trip through JSON.

| Contribution                              | Remote? | Why                                                                                  |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `slots`                                   | Yes     | Plain data, concatenated into the app's slot map.                                    |
| `navigation` (string `to`, string `icon`) | Yes     | Plain data. The shell maps icon identifiers to local components.                     |
| `meta`                                    | Yes     | Plain data, surfaced for catalog UIs.                                                |
| `component`, `zones`                      | No      | React components cannot cross the wire.                                              |
| `createRoutes`                            | No      | Route builders are framework-specific functions returning live component references. |
| `dynamicSlots`, `lifecycle`               | No      | Functions.                                                                           |
| `requires`, `optionalRequires`            | No      | Dependency contracts belong to the consuming code, not the remote payload.           |

The library ships a narrowed type that enforces this subset at compile time:

```ts
import type { RemoteModuleManifest, RemoteNavigationItem } from "@modular-react/core";
```

`RemoteNavigationItem` narrows `to` to `string` and `icon` to `string` — the two fields on a regular [`NavigationItem`](../packages/core/src/types.ts) that aren't JSON-safe. `RemoteModuleManifest` refuses the non-serializable `ModuleDescriptor` fields up front, so the type itself documents the wire contract.

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│ Backend                                                       │
│                                                               │
│  GET /api/integrations                                        │
│  → RemoteModuleManifest[]                                     │
│                                                               │
│  (Add a new integration = one row here, no FE deploy)         │
└──────────────────────────────┬────────────────────────────────┘
                               │ fetch + validate at wire boundary
                               ▼
┌───────────────────────────────────────────────────────────────┐
│ Shell (frontend)                                              │
│                                                               │
│  integrationsStore                                            │
│    { status, manifests: RemoteModuleManifest[] }              │
│                     ▲                                         │
│                     │ writes on fetch                         │
│                     │                                         │
│  modules/integrations  ← one local module                     │
│    lifecycle.onRegister(deps) → fetch + writeToStore          │
│    dynamicSlots(deps)          → mergeRemoteManifests(...)    │
│                                                               │
│  integrationsStore.subscribe(manifest.recalculateSlots)       │
└───────────────────────────────────────────────────────────────┘
```

**Key idea: one local module owns every remote manifest.** It fetches them, stores them, and re-exposes their slot contributions via `dynamicSlots`. The registry's existing `recalculateSlots()` signal handles the "fetch resolved, rerender the shell" path. The module registry is never touched after boot.

This keeps the library's single ingress path — eager `register` before `resolve()` — and avoids inventing a second, weaker module system.

## Step 1: Define the wire contract

Pick the slot / nav / meta shapes you want backends to target. Alias `RemoteModuleManifest` to your slot and nav-item types so the response is typed end-to-end:

```ts
// app-shared/src/remote.ts
import type { RemoteModuleManifest, RemoteNavigationItem } from "@modular-react/core";
import type { AppSlots } from "./slots";
import type { AppNavMeta, AppNavLabel } from "./nav";

type AppRemoteNavItem = RemoteNavigationItem<AppNavLabel, AppNavMeta>;

export type AppRemoteManifest = RemoteModuleManifest<AppSlots, AppRemoteNavItem>;
```

Document this type for the backend team. If you use an OpenAPI / JSON Schema pipeline, generate the server-side type from it — the payload contract is now just "an `AppRemoteManifest[]`".

### Namespace remote ids

`mergeRemoteManifests` throws on duplicate ids **within the remote set**, but does not cross-check against your locally-registered modules. Pick a naming convention so remote ids can't collide with local ones — e.g. prefix them `integration:salesforce`, `partner:atlassian`, `pack:admin`. This also makes the merged `meta` map easy to filter when the shell renders a catalog view.

## Step 2: Validate at the network boundary

`RemoteModuleManifest` is a compile-time contract. At runtime, the payload is untrusted — a broken deploy or a legacy server can hand you anything. Validate at the one place where the data enters your type system. Use zod or valibot; a hand-rolled guard is fine if you want zero deps.

```ts
// services/integrations-client.ts
import { z } from "zod";
import type { AppRemoteManifest } from "@myorg/app-shared";

const RemoteNavItemSchema = z.object({
  label: z.string(),
  to: z.string(),
  icon: z.string().optional(),
  group: z.string().optional(),
  order: z.number().optional(),
  hidden: z.boolean().optional(),
  meta: z.record(z.unknown()).optional(),
});

const RemoteManifestSchema = z.object({
  id: z.string(),
  version: z.string(),
  slots: z.record(z.array(z.unknown())).optional(),
  navigation: z.array(RemoteNavItemSchema).optional(),
  meta: z.record(z.unknown()).optional(),
});

export async function fetchIntegrationManifests(
  httpClient: HttpClient,
): Promise<AppRemoteManifest[]> {
  const raw = await httpClient.get("/api/integrations");
  const parsed = z.array(RemoteManifestSchema).parse(raw);
  return parsed as AppRemoteManifest[];
}
```

Tighten the per-slot schemas (`z.array(z.object({ id: z.string(), ... }))` etc.) to the actual item shapes your app expects. `mergeRemoteManifests` intentionally does not re-validate — once a value is typed as `RemoteModuleManifest`, downstream code trusts it.

### Fetching with React Query

If your app already uses React Query (see [Shell Patterns → React Query: server data](shell-patterns.md#react-query-server-data)), it's the natural transport for this payload: caching, deduplication, background refetch, and stale-while-revalidate come for free. Keep the validation step — it runs inside the `queryFn`, so the cache stores validated values only.

```ts
queryClient.fetchQuery({
  queryKey: ["integrations"],
  queryFn: () => fetchIntegrationManifests(httpClient),
  staleTime: 5 * 60_000,
});
```

Whether you hold the result in React Query's cache or mirror it into a Zustand store is a shell-level choice; `mergeRemoteManifests` doesn't care where the array came from.

## Step 3: Hold fetched manifests in a store

A small Zustand store is the simplest fit — `dynamicSlots` runs outside React and reads a snapshot.

```ts
// stores/integrations-store.ts
import { createStore } from "zustand/vanilla";
import type { AppRemoteManifest } from "@myorg/app-shared";

interface IntegrationsState {
  status: "idle" | "loading" | "ready" | "error";
  manifests: readonly AppRemoteManifest[];
  setManifests(manifests: readonly AppRemoteManifest[]): void;
  setStatus(status: IntegrationsState["status"]): void;
}

export const integrationsStore = createStore<IntegrationsState>()((set) => ({
  status: "idle",
  manifests: [],
  setManifests: (manifests) => set({ manifests, status: "ready" }),
  setStatus: (status) => set({ status }),
}));
```

Register it as a store on the registry (same pattern as any other Zustand store in the app) and add `integrations: IntegrationsState` to your `AppDependencies` so modules can read `deps.integrations` in `dynamicSlots`.

## Step 4: One local "integrations" module

```ts
// modules/integrations/index.ts
import { defineModule, mergeRemoteManifests } from "@modular-react/core";
import type { AppDependencies, AppSlots } from "@myorg/app-shared";
import { fetchIntegrationManifests } from "../../services/integrations-client";
import { integrationsStore } from "../../stores/integrations-store";

export default defineModule<AppDependencies, AppSlots>({
  id: "integrations",
  version: "1.0.0",
  requires: ["httpClient"],

  lifecycle: {
    async onRegister(deps) {
      integrationsStore.getState().setStatus("loading");
      try {
        const manifests = await fetchIntegrationManifests(deps.httpClient);
        integrationsStore.getState().setManifests(manifests);
      } catch (err) {
        integrationsStore.getState().setStatus("error");
        console.error("[integrations] failed to fetch manifests", err);
      }
    },
  },

  dynamicSlots: (deps) => mergeRemoteManifests(deps.integrations.manifests).slots,
});
```

Then, wherever your shell wires `recalculateSlots()`:

```ts
// app/registry.ts
import { integrationsStore } from "./stores/integrations-store";

export const manifest = registry.resolveManifest();
integrationsStore.subscribe(manifest.recalculateSlots);
```

Now: when the fetch completes, the store updates, `recalculateSlots()` fires, `dynamicSlots(deps)` re-runs, and the shell re-renders with the integrations merged in. Adding a new integration is a backend change — the FE picks it up on next fetch, without a deploy.

## Navigation from remote manifests

`dynamicSlots` only recomputes **slots**. The registry's `NavigationManifest` is built once at resolve time from each module's static `navigation` field.

Two options for remote-driven navigation:

1. **Model navigation as a slot.** Declare a `remoteNavigation: readonly RemoteNavigationItem[]` slot in `AppSlots` and render it in your shell next to the static nav. This is the lower-friction choice and it's what `mergeRemoteManifests(...).navigation` is for — feed it into that slot.

2. **Block boot on the fetch.** Fetch manifests _before_ calling `createRegistry` / `resolveManifest`, then pass the remote navigation items as part of the integrations module's static `navigation`. Simpler at read time, but every app boot now waits on the network.

Most apps want option 1.

## SSR considerations

For the TanStack Start and React Router framework-mode paths, the first render happens on the server. If your integrations module only fetches in `onRegister`, the SSR render is empty and the client "fills in" on hydration.

Two well-behaved options:

- **Fetch in the loader.** Both routers give you per-route loaders; call `fetchIntegrationManifests` there, write into a store that ships to the client via the router's data-dehydration mechanism, and keep `dynamicSlots` pointed at the same store. The SSR HTML already contains the integrations.
- **Fetch server-side, inline into the HTML.** A framework-owned escape hatch (e.g. TanStack Start server functions, RR v7 loaders at the root) that seeds `integrationsStore` before the React tree renders.

If SSR isn't a concern, the client-only pattern in Step 4 is fine.

## Testing

Two layers are worth testing separately:

**1. The merge logic** — purely a property of `mergeRemoteManifests`. Call it directly; no module / registry needed:

```ts
import { mergeRemoteManifests } from "@modular-react/core";
import type { AppRemoteManifest } from "@myorg/app-shared";

const remotes: AppRemoteManifest[] = [
  {
    id: "integration:sf",
    version: "1.0.0",
    slots: { systems: [{ id: "sf", name: "Salesforce" }] },
  },
  { id: "integration:hs", version: "1.0.0", slots: { systems: [{ id: "hs", name: "HubSpot" }] } },
];

const merged = mergeRemoteManifests(remotes);
expect(merged.slots.systems).toEqual([
  { id: "sf", name: "Salesforce" },
  { id: "hs", name: "HubSpot" },
]);
```

**2. The module's dynamic-slot flow** — use `resolveModule` from `@modular-react/testing`, seeding `deps` with a pre-loaded integrations snapshot so `dynamicSlots(deps)` sees known data:

```ts
import { resolveModule } from "@modular-react/testing";
import integrations from "./modules/integrations";

const result = resolveModule(integrations, {
  deps: {
    integrations: {
      status: "ready",
      manifests: [
        {
          id: "integration:sf",
          version: "1.0.0",
          slots: { systems: [{ id: "sf", name: "Salesforce" }] },
        },
      ],
      setManifests: () => {},
      setStatus: () => {},
    },
    httpClient: { get: async () => [] }, // onRegister runs — give it a benign stub
  },
});

expect(result.slots.systems).toEqual([{ id: "sf", name: "Salesforce" }]);
```

Note that `resolveModule` will invoke `lifecycle.onRegister` — provide a stub `httpClient` that returns an empty array so the fetch path is a no-op, and the `dynamicSlots` result is driven purely by the seeded `deps.integrations.manifests`.

## Anti-patterns to avoid

- **Don't synthesize `component` or `createRoutes` from strings.** Mapping `"IntegrationTile"` to a local component registry reinvents the module system. If a feature legitimately needs its own component, ship it as code and use `registerLazy` for code-splitting.
- **Don't register remote manifests directly via `registry.register(...)`.** Registration is locked after `resolve()` / `resolveManifest()`. Even if you boot-fetch, the "one module owns remote contributions" pattern is strictly simpler — and it's the only option once you also support late-arriving updates.
- **Don't skip validation because the type is narrow.** A TypeScript type is not a runtime guarantee. The wire boundary is where you earn the types you declared; `mergeRemoteManifests` and the rest of the library trust them past that point.
- **Don't concatenate manifests into a fake single descriptor.** Keep them as an array; `mergeRemoteManifests` is what folds them into the shapes the shell actually consumes.
- **Don't share ids between remote manifests and local modules.** `mergeRemoteManifests` only dedupes within the remote set. Prefix remote ids (e.g. `integration:`, `partner:`) to rule out collisions by construction.

## Reference

- Type: [`RemoteModuleManifest`](../packages/core/src/remote-manifest.ts) — JSON-safe subset of `ModuleDescriptor`.
- Type: [`RemoteNavigationItem`](../packages/core/src/remote-manifest.ts) — JSON-safe subset of `NavigationItem`.
- Helper: [`mergeRemoteManifests`](../packages/core/src/remote-manifest.ts) — merges an array into `{ slots, navigation, meta }`, throwing on duplicate ids.
