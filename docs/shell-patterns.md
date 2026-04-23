# Shell Patterns (Fundamentals)

This guide covers patterns for building shell applications with the modular-react framework. A "shell" is the host app that composes modules into a unified UI, from simple sidebar-and-content layouts to multi-zone dashboards.

> **Router-specific additions:** The framework ships two router integrations on top of a shared foundation. Topics that depend on the router (declaring per-route zones, auth guards, module route trees) live in companion docs:
>
> - [Shell Patterns for React Router](shell-patterns-react-router.md)
> - [Shell Patterns for TanStack Router](shell-patterns-tanstack-router.md)
>
> Everything in this document is router-agnostic. Import hooks from either `@react-router-modules/runtime` or `@tanstack-react-modules/runtime`; both re-export the shared primitives from `@modular-react/react`.

> **Building a workspace-style app** (tabbed workspaces, component-only modules, per-session state)? See [Workspace Patterns](workspace-patterns.md) after reading this guide. It builds on the foundation covered here.

## Package layout

The framework is organized as three layers:

| Layer                    | Packages                                                                | Purpose                                                                                         |
| ------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Shared foundation        | `@modular-react/core`, `@modular-react/react`, `@modular-react/testing` | Router-agnostic: types, slot/navigation builders, React contexts and hooks, validation, stores. |
| React Router integration | `@react-router-modules/core`, `@react-router-modules/runtime`, …        | `defineModule` returning `RouteObject[]`, registry that builds a React Router instance.         |
| TanStack Router          | `@tanstack-react-modules/core`, `@tanstack-react-modules/runtime`, …    | `defineModule` using `createRoute` / `getParentRoute`, registry that builds a TanStack Router.  |

A shell app imports from exactly one of the two router integrations. The pattern code throughout this guide is identical across both; only the route construction and the auth guard wiring differ (see the companion docs). You can also write router-neutral code (shared stores, cross-module contracts, typed hooks) once and reuse it.

## Multi-Zone Shell Layout

A basic shell has a sidebar and a content area. A complex shell has multiple zones: a mode rail, a customer banner, a main content area, a contextual panel.

### Defining layout zones

The shell's `rootComponent` owns the entire layout. Use CSS Grid to define zones, and populate them from navigation, slots, zones, and shared stores:

```typescript
// shell/src/components/Layout.tsx
import { Outlet } from 'react-router' // or '@tanstack/react-router'
import { useNavigation, useSlots, useZones } from '@react-router-modules/runtime'
// ^ or '@tanstack-react-modules/runtime' (both re-export the same hook names)
import type { AppSlots, AppZones } from '@myorg/app-shared'

export function Layout() {
  const navigation = useNavigation()
  const slots = useSlots<AppSlots>()
  const zones = useZones<AppZones>()
  const DetailPanel = zones.detailPanel

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '64px 1fr 320px',
      gridTemplateRows: 'auto 1fr',
      minHeight: '100vh',
    }}>
      {/* Mode rail - populated from navigation groups */}
      <ModeRail navigation={navigation} />

      {/* Main content - routes render here */}
      <main>
        <Outlet />
      </main>

      {/* Contextual panel - populated from route zones */}
      {DetailPanel && (
        <aside>
          <DetailPanel />
        </aside>
      )}
    </div>
  )
}
```

### Which mechanism for which zone

| Zone content                                                        | Source                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Navigation links and mode switches                                  | `useNavigation()`: modules declare `navigation` items       |
| Commands, badges, aggregated contributions                          | `useSlots()`: modules declare `slots` contributions         |
| Route-specific UI for layout regions (detail panel, header actions) | `useZones()`: the active route declares route-level zones   |
| Active selection, panel visibility                                  | Shared Zustand store (runtime state)                        |
| Route-based page content                                            | `<Outlet />`: the router renders the active module's routes |

> **How a route declares zones differs by router.** React Router reads them from the route's `handle` field; TanStack Router reads them from `staticData`. See the companion docs.

## Command Palette Pattern

A command palette aggregates entries from multiple framework sources into a single searchable overlay. Each source serves a distinct purpose:

| Source                             | What it provides              | Example                   |
| ---------------------------------- | ----------------------------- | ------------------------- |
| `useSlots().systems`               | Iframe-based external systems | "Open Salesforce"         |
| `useModules()` + `getModuleMeta()` | Journey/component modules     | "Set up Direct Debit"     |
| `useSlots().commands`              | Module-specific actions       | "Create New Invoice"      |
| `useNavigation()`                  | Route-based navigation        | "Go to Billing Dashboard" |

### Define the command slot

Commands are always self-executing: the module provides `onSelect` and the shell calls it:

```typescript
// app-shared/src/index.ts
export interface CommandDefinition {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly icon?: string;
  readonly shortcut?: string;
  readonly onSelect: () => void;
}

export interface AppSlots {
  commands: CommandDefinition[];
}
```

### When to use commands vs other mechanisms

`slots.commands` is for actions the module can execute itself. Don't use it for:

- **Workflow launching**: use `meta` instead; the shell discovers workflows via `useModules()`
- **Navigation**: use `navigation` on the module descriptor
- **System launching**: use a domain-specific slot (e.g. `slots.systems`)

```typescript
import { defineModule } from "@react-router-modules/core"; // or '@tanstack-react-modules/core'

export default defineModule<AppDependencies, AppSlots>({
  id: "billing",
  slots: {
    commands: [
      // Module owns the action - it knows what to do
      {
        id: "billing:new-invoice",
        label: "Create New Invoice",
        group: "actions",
        onSelect: () => {
          /* open modal, navigate, etc. */
        },
      },
    ],
  },
  // Sidebar link - framework builds NavigationManifest
  navigation: [{ label: "Billing", to: "/billing", group: "finance" }],
  // Discovery in directory/command palette - shell reads via useModules()
  meta: { name: "Billing", category: "finance", icon: "CreditCard" },
});
```

### Shell renders the palette

The shell aggregates all sources. Journey modules appear via `useModules()`, not `slots.commands`:

```typescript
import { useSlots, useModules, getModuleMeta, useNavigation } from '@react-router-modules/runtime'
import type { AppSlots, WorkflowMeta } from '@myorg/app-shared'

function CommandPalette({ search }: { search: string }) {
  const { systems, commands } = useSlots<AppSlots>()
  const modules = useModules()
  const navigation = useNavigation()

  // Journey modules from catalog
  const workflows = modules
    .filter((m) => m.component && getModuleMeta<WorkflowMeta>(m)?.category)
    .map((m) => ({ entry: m, meta: getModuleMeta<WorkflowMeta>(m)! }))

  // Module-contributed commands (self-executing actions)
  const grouped = Map.groupBy(commands, (cmd) => cmd.group ?? 'other')

  return (
    <div>
      {/* Systems from slots */}
      {systems.map((sys) => (
        <button key={sys.id} onClick={() => openSystem(sys)}>{sys.name}</button>
      ))}

      {/* Journey modules from catalog */}
      {workflows.map(({ entry, meta }) => (
        <button key={entry.id} onClick={() => openJourney(entry, meta)}>{meta.name}</button>
      ))}

      {/* Module-contributed actions */}
      {[...grouped.entries()].map(([group, items]) => (
        <div key={group}>
          <h3>{group}</h3>
          {items.map((cmd) => (
            <button key={cmd.id} onClick={cmd.onSelect}>{cmd.label}</button>
          ))}
        </div>
      ))}

      {/* Navigation from module descriptors */}
      {navigation.items.map((item) => (
        <button key={item.to} onClick={() => navigate(item.to)}>{item.label}</button>
      ))}
    </div>
  )
}
```

This code is identical across both routers. The hooks are re-exported from each runtime package and come from the shared `@modular-react/react` layer.

### Decision guide for module-to-shell actions

| "I want to..."                          | Use                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Appear in the directory/command palette | `meta` (shell discovers via `useModules()`)                                 |
| Add a sidebar link                      | `navigation` on module descriptor                                           |
| Contribute a self-contained action      | `slots.commands` with `onSelect`                                            |
| Trigger an imperative shell action      | `useService('workspace')` (see [Workspace Patterns](workspace-patterns.md)) |

## Auth Guard Pattern (concept)

Both runtimes expose an `authenticatedRoute` option on `registry.resolve()`. It creates a pathless layout route that sits between the root and the module routes. Protected routes (index + all module routes) nest inside it; public routes (login, signup) go in `shellRoutes`, which sits outside the boundary.

```
Root (runs for all routes: observability, feature flags)
├── /login       (public, in shellRoutes, outside the auth boundary)
├── /signup      (public, in shellRoutes)
└── _authenticated layout (the authenticatedRoute, auth guard runs here)
    ├── /        (indexComponent)
    └── /billing, /users, …  (module routes)
```

The separation is structural:

- The `rootComponent`'s before-route hook (`loader` or `beforeLoad`, depending on router) runs for **every** route, including `/login`. Use it for observability, analytics, feature flags, not auth.
- `authenticatedRoute`'s guard runs **only** for protected routes. Throw a redirect from it to send unauthenticated users elsewhere.

The hook name (`loader` vs `beforeLoad`), the argument shape, and the `Component` vs `component` casing differ between routers. See the router-specific companion docs for working examples:

- [React Router Auth Guard](shell-patterns-react-router.md#auth-guard-pattern)
- [TanStack Router Auth Guard](shell-patterns-tanstack-router.md#auth-guard-pattern)

## Module-to-Shell Communication

There are five communication channels. Choose based on what kind of data you're passing.

### Slots: static declarations at registration time

Use for things that don't change at runtime: what commands are available, what badge types a module supports.

```typescript
// Module declares once at registration
slots: {
  commands: [{ id: 'billing:export', label: 'Export Report', onSelect: () => downloadReport() }],
}
```

The shell reads these via `useSlots()`. They're collected at `resolve()` time. For slot contributions that depend on runtime state (role, feature flags), use `dynamicSlots` with `recalculateSlots()`; see each runtime's README.

### Shared stores: runtime state

Use for things that change during the app's lifetime: which panel is expanded, what notifications are pending, whether the sidebar is collapsed.

```typescript
const toggleSidebar = useStore("ui", (s) => s.toggleSidebar);
toggleSidebar();
```

Both the module triggering the change and the shell rendering it subscribe to the same Zustand store. The `useStore` hook comes from `createSharedHooks<AppDependencies>()`, which you typically wrap into an `app-shared` package.

### Reactive services: external sources

Use for external sources you subscribe to but don't control: call adapters, presence systems, websocket connections. These are registered in the `reactiveServices` bucket and implement `ReactiveService<T>` (`subscribe` + `getSnapshot`, matching React's `useSyncExternalStore` API).

```typescript
const callState = useReactiveService("call", (s) => s.status);
// Re-renders when the call adapter's state changes
```

Unlike stores (state you own), reactive services wrap external subscriptions. Unlike plain services (static utilities), reactive services trigger re-renders.

### React Query: server data

Use for data fetched from APIs. React Query handles caching, deduplication, and background refetching.

```typescript
// Module A invalidates, Module B auto-refetches
queryClient.invalidateQueries({ queryKey: ["invoices"] });
```

### Route zones: per-route UI contributions

Use for UI components that the currently active route wants rendered in shell layout regions. Unlike slots (static, from all modules), zones change on every navigation and come from the active route hierarchy. The shell reads them via `useZones()`:

```typescript
import { useZones } from '@react-router-modules/runtime' // or '@tanstack-react-modules/runtime'
import type { AppZones } from '@myorg/app-shared'


function Layout() {
  const zones = useZones<AppZones>()
  const DetailPanel = zones.detailPanel

  return (
    <div style={{ display: 'flex' }}>
      <main><Outlet /></main>
      {DetailPanel && <DetailPanel />}
    </div>
  )
}
```

Deeper routes override shallower ones. A billing section root can set a default sidebar, and the invoice detail page can replace it. Routes that don't declare zones contribute nothing.

**Declaring zones on a route is router-specific:**

- React Router reads zones from `route.handle`. See [React Router Route Zones](shell-patterns-react-router.md#route-zones).
- TanStack Router reads zones from `route.staticData` with type augmentation. See [TanStack Router Route Zones](shell-patterns-tanstack-router.md#route-zones).

> **Workspace apps:** If your modules render in tabs (not routes), use `useActiveZones()` instead; it merges route zones with the active module's descriptor zones. See [Workspace Patterns Descriptor Zones](workspace-patterns.md#step-4-descriptor-zones-and-useactivezones).

### Decision guide

| Question                                           | Answer                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| Is it known at module registration time?           | Slots                                                                    |
| Does it vary per route within a module?            | Route zones                                                              |
| Does it change at runtime?                         | Shared store                                                             |
| Is it an external source you subscribe to?         | Reactive service (`useReactiveService`)                                  |
| Does it come from an API?                          | React Query                                                              |
| Does it need to trigger re-renders across modules? | Shared store (Zustand subscriptions) or React Query (cache invalidation) |

## Headless Modules with defineSlots

For modules that only contribute slot data (no component, no routes), use `defineSlots` instead of `defineModule` to reduce boilerplate:

```typescript
import { defineSlots } from "@react-router-modules/core"; // or "@tanstack-react-modules/core"
import type { AppDependencies, AppSlots } from "@myorg/app-shared";

export default defineSlots<AppDependencies, AppSlots>("external-systems", {
  systems: [
    { id: "salesforce", name: "Salesforce", iframeUrl: "...", icon: "Building2", category: "crm" },
  ],
});
```

This is syntactic sugar: the registry sees a normal `ModuleDescriptor` with `version: '0.0.0'` and no component, routes, or lifecycle. Use `defineModule` when the module has any of: `component`, `createRoutes`, `meta`, `zones`, `requires`, or `lifecycle`.

## Optional Dependencies

Modules can declare dependencies they can function without using `optionalRequires`. Missing optional deps log a warning at resolve time instead of throwing:

```typescript
export default defineModule<AppDependencies, AppSlots>({
  id: "billing",
  version: "0.1.0",
  requires: ["httpClient"], // hard requirement: throws if missing
  optionalRequires: ["analytics"], // soft requirement: warns if missing
  // ...
});
```

In components, use `useOptional` to safely access deps that may not be registered:

```typescript
import { useOptional } from "@myorg/app-shared";

function BillingDashboard() {
  const analytics = useOptional("analytics");
  analytics?.track("billing_viewed"); // no-op if analytics not registered
  // ...
}
```

`useOptional` checks all three buckets (stores, then reactive services, then services). Returns `null` if the key isn't registered in any bucket.

## Cross-Store Coordination

When you split a monolith Zustand store into focused stores, you'll often need one store to react to changes in another. Use Zustand's built-in `subscribe` API; it's the idiomatic pattern and requires no framework involvement.

### The pattern

```typescript
// stores/workspace-tabs.ts
import { interactionsStore } from "./interactions-store";
import { workspaceTabsStore } from "./workspace-tabs-store";

// React to interaction changes: initialize tab state for new interactions
interactionsStore.subscribe((state, prev) => {
  if (state.activeInteractionId === prev.activeInteractionId) return;
  const id = state.activeInteractionId;
  if (!id) return;

  const tabs = workspaceTabsStore.getState();
  if (!tabs.tabStateByInteraction[id]) {
    workspaceTabsStore.setState({
      tabStateByInteraction: {
        ...tabs.tabStateByInteraction,
        [id]: createDefaultTabState(),
      },
    });
  }
});
```

Key points:

- `subscribe` receives `(currentState, previousState)`; compare to avoid redundant work.
- Place the subscription in the file of the store that **reacts**, not the one that **triggers**. This keeps the triggering store unaware of its dependents.
- Top-level subscriptions (outside React) live for the app's lifetime. That's fine for shell stores.
- For cleanup, `subscribe` returns an unsubscribe function: `const unsub = store.subscribe(...); unsub()`.

### When to use subscribe vs useEffect

| Situation                                                     | Use                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| Store A reacts to Store B, both are app-level singletons      | `store.subscribe()` at module top level                |
| Component needs to react to a store change with a side effect | `useEffect` + `useStore` selector inside the component |
| Module lifecycle setup that reads store state once            | `onRegister(deps)` (receives a state snapshot)         |

### Module-scoped subscriptions

If a module sets up a subscription during its lifecycle, clean it up on unmount:

```typescript
defineModule({
  id: "billing",
  lifecycle: {
    onMount(deps) {
      // Subscribe to auth changes
      this._unsub = authStore.subscribe((state) => {
        if (!state.isAuthenticated) cleanup();
      });
    },
    onUnmount() {
      this._unsub?.();
    },
  },
});
```

### What NOT to build

Don't add event buses, custom pub/sub, or `connectStores()` helpers. Zustand's `subscribe` already provides exactly the right primitive. Adding an abstraction on top would hide what's happening and make debugging harder. If you find yourself wanting an event bus, that's a signal that the cross-cutting concern should be modeled as a shared store instead.

## Multi-module workflows with shared state

The five channels above cover module-to-shell communication at a single point in time. When a domain workflow spans **several modules in sequence** — e.g. "look at the customer's account → branch into debt negotiation → collect a payment" — lifting that orchestration into the shell's stores keeps working but gradually couples unrelated modules through shared keys in the same store.

[Journeys](journeys.md) are the dedicated abstraction for this case: modules declare typed entry/exit vocabularies, a journey declares the transitions between them, and the shell mounts a `<JourneyOutlet>` inside whatever container it already uses (tab, modal, route element). Journey state is serializable, so mid-flow reload recovery and cross-device hand-off work without any shell-level plumbing. Nothing about the channels above changes — journeys are additive and only relevant if your app actually has multi-module workflows.

## Where to go next

- [Shell Patterns for React Router](shell-patterns-react-router.md): route-level zones via `handle`, `authenticatedRoute` with `loader`, `shellRoutes`, module route shape.
- [Shell Patterns for TanStack Router](shell-patterns-tanstack-router.md): route-level zones via `staticData`, `authenticatedRoute` with `beforeLoad`, `createRoute` / `getParentRoute`.
- [Workspace Patterns](workspace-patterns.md): tabbed workspaces, component-only modules, `useActiveZones`, per-session scoped stores.
- [Journeys](journeys.md): typed multi-module workflows with serializable shared state.
