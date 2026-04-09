# Workspace Patterns

This guide covers patterns for building **workspace-style applications** with the modular-react framework — apps where the shell renders modules in tabs, panels, and drawers rather than via URL routes. Contact center agent desktops, trading platforms, and admin consoles are typical examples.

> **Prerequisite:** This guide builds on [Shell Patterns (Fundamentals)](shell-patterns.md), which covers the shared foundation: layout grids, slots, command palettes, cross-store coordination, and module-to-shell communication. Read that first.
>
> Workspace patterns are router-agnostic. Every hook and descriptor field shown here works identically with `@react-router-modules/*` and `@tanstack-react-modules/*` — only the imports differ. Use whichever runtime your shell already uses. Where route fallback behavior matters, the [React Router](shell-patterns-react-router.md) and [TanStack Router](shell-patterns-tanstack-router.md) companion docs show the route-declaration syntax.

## When to use workspace patterns

Use these patterns when your app has:

- **Tabbed workspaces** — users open and close content tabs within a persistent shell
- **Component-only modules** — modules render via the shell (not via URL routes)
- **Per-session state** — each customer/ticket/case has its own tab state, notes, etc.
- **Contextual panels that change per tab** — the active tab determines what shows in a sidebar

If your app is a traditional page-navigated SPA where modules own routes, the core framework + [Shell Patterns](shell-patterns.md) are sufficient.

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  Shell Layout (rootComponent)                               │
│                                                             │
│  ┌──────┐ ┌──────────────────────────────────┐ ┌─────────┐ │
│  │ Mode │ │ Workspace                        │ │ Detail  │ │
│  │ Rail │ │ ┌──────────────────────────────┐  │ │ Panel   │ │
│  │      │ │ │ Tab Strip                    │  │ │         │ │
│  │ nav  │ │ ├──────────────────────────────┤  │ │ zones.  │ │
│  │ items│ │ │                              │  │ │ detail  │ │
│  │      │ │ │  Active Tab Content          │  │ │ Panel   │ │
│  │      │ │ │  (module component)          │  │ │         │ │
│  │      │ │ │                              │  │ │         │ │
│  │      │ │ └──────────────────────────────┘  │ │         │ │
│  └──────┘ └──────────────────────────────────┘ └─────────┘ │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Notes / Drawer                                          ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

The shell owns the layout. In workspace apps, the **shell controls which module is currently rendered** — not the URL. The most common pattern is a tab strip where each tab renders one module's content, but the same architecture works for any shell-managed content switching: a single content area that swaps between modules, a drawer, a modal, or a split view. Modules don't know how the shell presents them; the shell decides when and where to render each module's `component`.

Modules contribute content through five channels:

| What                  | Mechanism                         | Example                                         |
| --------------------- | --------------------------------- | ----------------------------------------------- |
| Navigation items      | `navigation` on module descriptor | Mode rail links, sidebar items                  |
| Global contributions  | `slots` on module descriptor      | Command palette entries, tab type registrations |
| Route-specific panels | Route-level zones                 | Detail panel for a route-based page             |
| Tab-active panels     | `zones` on module descriptor      | Contextual panel when a module tab is active    |
| Runtime state         | Shared Zustand stores             | Active tab, session state, panel visibility     |

> The fourth row — descriptor-level `zones` — is a shared `ModuleDescriptor` field and works identically across both routers. Row three (route-specific panels) is the one that varies: [React Router uses `handle`](shell-patterns-react-router.md#route-zones), [TanStack Router uses `staticData`](shell-patterns-tanstack-router.md#route-zones).

## Step 1: Define the contracts in app-shared

```typescript
// app-shared/src/index.ts
import { createSharedHooks } from "@react-router-modules/core";
// ^ or "@tanstack-react-modules/core" — createSharedHooks is identical in both
import type { ComponentType } from "react";

// ---- Zones (layout regions that change per active content) ----

export interface AppZones {
  contextualPanel?: ComponentType;
  headerActions?: ComponentType;
}

// For TanStack Router only — augment staticData so it type-checks at createRoute.
// React Router does not need augmentation; handle is unknown and narrowed by useZones<AppZones>().
declare module "@tanstack/router-core" {
  interface StaticDataRouteOption extends AppZones {}
}

// ---- Slots (global contributions from all modules) ----

export interface CommandDefinition {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly onSelect: () => void;
}

export interface AppSlots {
  commands: CommandDefinition[];
  systems: SystemRegistration[];
  subNavSections: SubNavSection[];
}

// ---- Services ----

export interface WorkspaceActions {
  openModuleTab: (moduleId: string) => void;
  openSectionTab: (sectionId: string) => void;
}

// ---- Shared dependencies ----

export interface AppDependencies {
  auth: AuthStore;
  sessions: SessionsStore;
  ui: UIStore;
  httpClient: { get: (url: string) => Promise<unknown> };
  workspace: WorkspaceActions;
}

// ---- Module metadata for catalog discovery ----
// Define your own metadata shape - the framework passes it through via TMeta generic.

export interface WorkflowMeta {
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly category: string;
  readonly estimatedTime?: string;
  readonly keepOpenOnComplete?: boolean;
  readonly addNoteOnComplete?: boolean;
}

// ---- Typed hooks ----

export const { useStore, useService, useReactiveService, useOptional } =
  createSharedHooks<AppDependencies>();
```

The `declare module "@tanstack/router-core"` augmentation is only needed if you're using the TanStack Router integration. Skip it for React Router apps.

## Step 2: Workspace tab state

The tab/workspace system is **shell-owned state**, not a framework concern. Use a plain Zustand store:

```typescript
// shell/src/stores/workspace.ts
import { createStore } from "zustand/vanilla";

export interface WorkspaceTab {
  id: string;
  type: "directory" | "iframe" | "native-workflow";
  title: string;
  workflowId?: string; // for native-workflow tabs
  iframeUrl?: string; // for iframe tabs
  closeable: boolean;
  lastAccessedAt: number;
}

export interface TabStateBySession {
  tabs: WorkspaceTab[];
  activeTabId: string;
}

export const workspaceTabsStore = createStore<WorkspaceTabsState>((set, get) => ({
  tabStateBySession: {},

  getCurrentTabs: (sessionId) => {
    return get().tabStateBySession[sessionId]?.tabs ?? [createDirectoryTab()];
  },

  getActiveTab: (sessionId) => {
    const tabState = get().tabStateBySession[sessionId];
    if (!tabState) return null;
    return tabState.tabs.find((t) => t.id === tabState.activeTabId) ?? null;
  },

  openTabForSession: (sessionId, tab) =>
    set((state) => {
      // Activate existing tab or append new one, with LRU eviction
      // ...
    }),

  // closeTab, switchTab, etc.
}));
```

### Cross-store coordination for tab initialization

When a new session is selected, initialize its tab state. Use Zustand's `subscribe` API (see [Cross-Store Coordination](shell-patterns.md#cross-store-coordination)):

```typescript
sessionsStore.subscribe((state, prev) => {
  if (state.activeSessionId === prev.activeSessionId) return;
  const id = state.activeSessionId;
  if (!id) return;

  const tabs = workspaceTabsStore.getState();
  if (!tabs.tabStateBySession[id]) {
    workspaceTabsStore.setState({
      tabStateBySession: {
        ...tabs.tabStateBySession,
        [id]: { tabs: [createDirectoryTab()], activeTabId: "directory" },
      },
    });
  }
});
```

## Step 3: Modules as workspace components

Workspace modules use `component` instead of `createRoutes`. The shell renders them in tabs. They declare `meta` for catalog discovery and `zones` for contextual panels:

```typescript
// modules/onboarding-flow/src/index.ts
import { defineModule } from "@react-router-modules/core"; // or "@tanstack-react-modules/core"
import { lazy } from "react";
import { OnboardingPanel } from "./OnboardingPanel.js";

export default defineModule<AppDependencies, AppSlots, WorkflowMeta>({
  id: "onboarding-flow",
  version: "0.1.0",

  // The shell renders this in a workspace tab
  component: lazy(() => import("./OnboardingFlow.js")),

  // Catalog metadata - shell reads via useModules() + getModuleMeta()
  meta: {
    name: "Customer Onboarding",
    description: "Walk through the new customer setup process",
    icon: "UserPlus",
    category: "setup",
    estimatedTime: "5-10 mins",
  },

  // Zones - shell reads via useActiveZones() when this module's tab is active
  zones: {
    contextualPanel: OnboardingPanel,
  },

  requires: ["auth", "httpClient"],
});
```

Both `component` and `zones` live on the shared `ModuleDescriptor`, so this module definition is valid against either integration's `defineModule`.

### Module components receive standard props

The shell defines a standard props interface for workspace components:

```typescript
export interface WorkflowProps {
  customerId: string;
  accountNumber: string;
  onComplete: (result?: unknown) => void;
  onCancel: () => void;
  initialState?: unknown;
}
```

## Step 4: Descriptor zones and useActiveZones

Tab-based modules can't declare zones on a route because they aren't rendered via routes. Instead, they declare `zones` on the module descriptor:

```typescript
zones: {
  contextualPanel: OnboardingPanel,
  headerActions: OnboardingHeaderActions,
}
```

The shell reads zones from both routes and the active module using `useActiveZones`:

```typescript
import { useActiveZones } from '@react-router-modules/runtime'
// ^ or '@tanstack-react-modules/runtime' — identical API
import type { AppZones } from '@myorg/app-shared'

function ShellLayout() {
  // Derive the active module ID from workspace tab state
  const activeTab = getActiveTabForCurrentSession()
  const activeModuleId =
    activeTab?.type === 'native-workflow' ? activeTab.workflowId : null

  const zones = useActiveZones<AppZones>(activeModuleId)
  const ContextualPanel = zones.contextualPanel

  return (
    <div className="grid ...">
      {/* ... other zones ... */}
      <aside>
        {ContextualPanel ? <ContextualPanel /> : <DefaultPanel />}
      </aside>
    </div>
  )
}
```

**How `useActiveZones` works:**

1. Collects route zones via `useZones()` (from `handle` on React Router matched routes, or `staticData` on TanStack matched routes).
2. If `activeModuleId` is provided, looks up the module's `zones` field from `useModules()`.
3. Merges both — **module wins** for the same key.
4. When `activeModuleId` is `null`, returns route zones only.

This gives the shell one code path regardless of whether the active content is route-based or tab-based.

### How tab switches update zones

When the user clicks a different tab, the zone layout updates through a reactive chain — no imperative wiring needed:

```
User clicks tab "Billing"
  → workspaceTabsStore updates activeTabId
    → ShellLayout re-renders (subscribed to the store)
      → derives activeModuleId = "billing" from the new active tab
        → useActiveZones("billing") returns billing module's zones
          → layout renders BillingContextPanel in the aside
```

Each step is a standard React/Zustand subscription. The shell layout subscribes to the tab store, derives `activeModuleId` from the active tab, and passes it to `useActiveZones`. When the tab changes, React re-renders the layout and `useActiveZones` returns the new module's zones automatically.

When switching to a tab that has no module (e.g. a directory tab or an iframe tab), `activeModuleId` resolves to `null`, and `useActiveZones(null)` falls back to route zones only. If no route contributes zones either, every zone key is `undefined` and the shell renders its fallback content.

## Step 5: Directory page from module catalog

The shell builds a browsable directory of available modules using `useModules()` and `getModuleMeta()`:

```typescript
import { useModules, getModuleMeta } from '@react-router-modules/runtime'
import type { WorkflowMeta } from '@myorg/app-shared'

function DirectoryPage() {
  const modules = useModules()

  // Only show modules that have catalog metadata
  const discoverable = modules.filter((m) => getModuleMeta<WorkflowMeta>(m)?.category)

  // Group by category
  const byCategory = Map.groupBy(discoverable, (m) =>
    getModuleMeta<WorkflowMeta>(m)!.category
  )

  return (
    <div>
      {[...byCategory.entries()].map(([category, mods]) => (
        <section key={category}>
          <h2>{capitalize(category)}</h2>
          <div className="grid grid-cols-3 gap-4">
            {mods.map((mod) => {
              const meta = getModuleMeta<WorkflowMeta>(mod)!
              return (
                <Card key={mod.id}>
                  <h3>{meta.name}</h3>
                  <p>{meta.description}</p>
                  <button onClick={() => openModuleTab(mod.id)}>
                    {meta.estimatedTime ? 'Start' : 'Open'}
                  </button>
                </Card>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
```

Category labels fall back to `capitalize(category)` — no hardcoded label map needed.

## Step 6: Tab rendering from module catalog

When a tab is active, the shell looks up the module and renders its `component`:

```typescript
import { useModules } from '@react-router-modules/runtime'

function WorkspaceContent({ activeTab, customerId, accountNumber, sessionId }) {
  const modules = useModules()

  if (activeTab.type === 'directory') return <DirectoryPage />

  if (activeTab.type === 'iframe') {
    return <IframeContainer url={activeTab.iframeUrl} title={activeTab.title} />
  }

  // native-workflow - look up the module
  const mod = modules.find((m) => m.id === activeTab.workflowId)
  if (!mod?.component) return <p>Module "{activeTab.workflowId}" not found</p>

  return (
    <WorkflowWrapper
      workflowId={activeTab.workflowId}
      customerId={customerId}
      accountNumber={accountNumber}
      sessionId={sessionId}
      tabId={activeTab.id}
    />
  )
}
```

### Workflow wrapper

The wrapper handles completion behavior and error boundaries:

```typescript
function WorkflowWrapper({ workflowId, customerId, accountNumber, sessionId, tabId }) {
  const modules = useModules()
  const mod = modules.find((m) => m.id === workflowId)
  const meta = getModuleMeta<WorkflowMeta>(mod!)

  const handleComplete = (result?: unknown) => {
    saveWorkflowState(workflowId, result)

    // Respect module's completion preferences
    if (meta?.addNoteOnComplete !== false) {
      addNote(sessionId, `Workflow completed: ${meta?.name ?? workflowId}`)
    }
    if (!meta?.keepOpenOnComplete) {
      closeTab(sessionId, tabId)
    }
  }

  const Component = mod!.component!
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSpinner />}>
        <Component
          customerId={customerId}
          accountNumber={accountNumber}
          onComplete={handleComplete}
          onCancel={() => closeTab(sessionId, tabId)}
          initialState={loadWorkflowState(workflowId)}
        />
      </Suspense>
    </ErrorBoundary>
  )
}
```

Modules control their own completion behavior via `WorkflowMeta`:

- `keepOpenOnComplete: true` — tab stays open, module shows its own post-completion UI
- `addNoteOnComplete: false` — no automatic note on completion

## Step 7: Per-session state with scoped stores

For apps where each session has independent state, use `createScopedStore`:

```typescript
import { createScopedStore } from "@react-router-modules/core";
// ^ or "@tanstack-react-modules/core" — identical API

const sessionTabs = createScopedStore<TabState>(() => ({
  tabs: [{ id: "directory", type: "directory", title: "Directory", closeable: false }],
  activeTabId: "directory",
}));

// In a component - subscribe to this session's tab state
function Workspace({ sessionId }: { sessionId: string }) {
  const { tabs, activeTabId } = sessionTabs.useScoped(sessionId);
  // ...
}

// Cleanup when session ends
sessionTabs.remove(sessionId);
```

## How modules trigger workspace actions

Modules should never import store instances directly. Expose a workspace actions service via `AppDependencies`:

```typescript
// app-shared/src/index.ts
export interface WorkspaceActions {
  openModuleTab: (moduleId: string) => void;
  openSectionTab: (sectionId: string) => void;
}
```

The shell provides the implementation. Modules only know the interface:

```typescript
import { useService } from '@myorg/app-shared'

function InvoiceActions({ invoiceId }: { invoiceId: string }) {
  const workspace = useService('workspace')

  return (
    <button onClick={() => workspace.openModuleTab('payments')}>
      Pay Invoice
    </button>
  )
}
```

## Zone initial state and tab navigation

Zones are reactive — they re-derive on every route change and tab switch. There is no implicit default and no "sticky" carry-over from a previous page or tab.

**Initial render:** When no route or module contributes a zone, every key is `undefined`. The shell layout should render fallback content:

```typescript
{zones.contextualPanel ? <zones.contextualPanel /> : <DefaultPanel />}
```

**Tab switch:** When the user switches from a tab whose module declares `zones: { contextualPanel: BillingPanel }` to a tab whose module declares no zones, `contextualPanel` reverts to whatever the route hierarchy provides — or `undefined` if no route sets it either. This is intentional: the shell always reflects the currently active content, not the previously active content.

**Persistent zones across tabs:** If a zone should always be present regardless of the active tab, set it on a parent layout route (via `handle` on React Router, `staticData` on TanStack Router). Module descriptor zones override route zones for the same key, so the route value acts as a fallback when the active module doesn't contribute that zone.

## Summary: what goes where

| Concern                              | Owned by | Mechanism                                                     |
| ------------------------------------ | -------- | ------------------------------------------------------------- |
| Layout grid, zone placement          | Shell    | `rootComponent` with CSS Grid                                 |
| Module identity and catalog metadata | Modules  | `meta` on descriptor → `useModules()`                         |
| Module renderable component          | Modules  | `component` on descriptor → `useModules()`                    |
| Tab-active contextual panels         | Modules  | `zones` on descriptor → `useActiveZones()`                    |
| Route-specific panels/actions        | Modules  | `handle` (RR) or `staticData` (TSR) → `useActiveZones()`      |
| Navigation items                     | Modules  | `navigation` on descriptor                                    |
| Command palette entries              | Modules  | `slots.commands`                                              |
| Directory page                       | Shell    | Reads `useModules()`, filters by `meta`                       |
| Tab state, active tab                | Shell    | Zustand store                                                 |
| Per-session state                    | Shell    | `createScopedStore`                                           |
| Tab rendering                        | Shell    | Looks up module by id via `useModules()`, renders `component` |

The framework provides the composition primitives. The shell owns the workspace architecture. Modules stay standalone and testable — they declare what they contribute, the shell decides where it goes.
