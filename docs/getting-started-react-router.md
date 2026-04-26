# Getting started with React Router

This guide walks you from zero to a running modular React Router app. It assumes you already use (or are comfortable with) React Router v7 and want to split your app into self-contained feature modules.

For router-agnostic fundamentals, see [Shell Patterns](./shell-patterns.md). For React Router specific mechanics (zones via `handle`, `authenticatedRoute`, public `shellRoutes`), see [Shell Patterns for React Router](./shell-patterns-react-router.md).

## Prerequisites

- **Node 22+** and **pnpm**
- **React 19**, **React Router v7**, **zustand 5** (the versions the scaffold pins)
- Familiarity with React Router v7 route objects

You don't need an existing project; the CLI scaffolds one for you. Already have a React Router app? Scaffold a throwaway first to see the structure, then follow the [migration sketch](#migrating-an-existing-app) at the bottom of this guide.

### About the package manager

The scaffold produces a **pnpm workspace**: `pnpm-workspace.yaml`, `workspace:*` dependencies, and scripts that use `pnpm --filter` / `pnpm -r`. This is the supported setup.

- **Yarn Berry (v2+)** and **Bun** both understand the `workspace:*` protocol and can be used after scaffolding if you rename `pnpm-workspace.yaml` to a `workspaces` field in the root `package.json` and rewrite the scripts. Nothing in the runtime or CLI is pnpm-specific beyond the scaffold output.
- **npm is not supported.** npm doesn't implement the `workspace:*` protocol, so `npm install` in a scaffolded project will fail to resolve the workspace packages.
- **Turborepo** is orthogonal; it runs on top of any package manager. If you use Turborepo, keep pnpm underneath and add `turbo.json` afterwards.

## Mental model

Three roles, one contract:

- **Shell** (`shell/`): the host app. Owns stores, services, layouts, the registry, and `main.tsx`. The shell is where you run the app from.
- **Modules** (`modules/<name>/`): self-contained feature packages. Each module describes everything it contributes: routes, navigation items, commands, zone fills, and the dependencies it needs from the shell. A module never imports from the shell.
- **app-shared** (`app-shared/`): the typed contract between the two. It declares three interfaces every module is generic over:
  - **`AppDependencies`**: the stores and services the shell provides (auth store, config store, http client, …). Modules read from these via typed hooks.
  - **`AppSlots`**: the static contributions the shell collects across all modules (e.g. a `commands` bar).
  - **`AppZones`**: per-route layout regions a module can fill (e.g. a detail panel on the right). The active route's contributions are what the shell renders.

Every module signature looks like `defineModule<AppDependencies, AppSlots>({ … })`. That's how TypeScript catches, at compile time, a module asking for a store the shell doesn't provide.

## 1. Scaffold a project

```bash
npx @react-router-modules/cli init my-app --scope @myorg --module dashboard
cd my-app
pnpm install
pnpm dev
```

- `my-app` is the project (and root package) name.
- `--scope @myorg` is the npm scope used for workspace package names (`@myorg/app-shared`, `@myorg/dashboard-module`, …). Pick something unique to your org; it never has to be published.
- `--module dashboard` seeds the first feature module. Omit the flag to be prompted interactively.

The CLI creates a pnpm workspace with three sub-packages and wires them together. After `pnpm dev` the shell boots on Vite's default port (5173).

### What you see on first run

Open [`http://localhost:5173`](http://localhost:5173). You'll land on the **Home** page with a "Login as Demo User" button in the header. The sidebar already shows the dashboard module's navigation entries. The scaffold ships with a no-op auth guard, so module routes are reachable even before you log in, but pages that read the auth store will show "Please log in …" until you click the login button.

Click **Login as Demo User**, then navigate to **Dashboard List** in the sidebar. You'll see the list page in the main area and a detail panel on the right. Navigate back to **Dashboard** and the detail panel disappears; it's contributed by the list route, not the module.

## 2. What you got

```
my-app/
├── app-shared/                    # Shared contract: AppDependencies, AppSlots, AppZones, typed hooks
│   └── src/
│       ├── index.ts               # The contract: the single place all modules depend on
│       └── types.ts               # Domain types (User, LoginCredentials, …)
├── shell/                         # The host app: owns stores, services, layouts, main.tsx
│   └── src/
│       ├── main.tsx               # Registry wiring + app bootstrap
│       ├── components/
│       │   ├── RootLayout.tsx     # Runs for every route (public + protected)
│       │   ├── ShellLayout.tsx    # Authenticated chrome (sidebar, header, detail panel)
│       │   ├── Sidebar.tsx        # Navigation built from module contributions
│       │   └── Home.tsx           # Index route
│       ├── stores/
│       │   ├── auth.ts            # Zustand store: login / logout / user
│       │   └── config.ts          # Zustand store: apiBaseUrl, env, appName
│       └── services/
│           └── http-client.ts     # Wretch instance, auth-aware via defer()
└── modules/
    └── dashboard/                 # The first feature module
        └── src/
            ├── index.ts           # defineModule(...): the module descriptor
            ├── pages/
            │   ├── DashboardDashboard.tsx   # "<ModuleName>Dashboard": the index page convention
            │   └── DashboardList.tsx
            └── panels/
                └── DetailPanel.tsx          # Contributed into the shell's detail panel zone
```

### The `<ModuleName>Dashboard.tsx` convention

The scaffold names every module's index page `<PascalName>Dashboard.tsx`. A module called `dashboard` yields `DashboardDashboard.tsx`; a module called `billing` would yield `BillingDashboard.tsx`. It's just a naming convention; rename the file and update the `lazy()` import in the descriptor if you'd rather have something else.

### The `-module` suffix

Packages under `modules/` are published as `@myorg/<name>-module`. The suffix is there so module packages never collide with the non-module packages you already have in your workspace (or plan to add). When the shell imports from them, it uses the full package name: `import dashboard from '@myorg/dashboard-module'`.

### Choice of HTTP client

The scaffold bakes in [`wretch`](https://github.com/elbywan/wretch) + [`@lokalise/frontend-http-client`](https://github.com/lokalise/frontend-http-client) as the `httpClient` type in `AppDependencies`. Swap it for `fetch`, `axios`, `ky`, or anything else. Just change the type in `app-shared/src/index.ts` and the implementation in `shell/src/services/http-client.ts`. The framework doesn't care.

## 3. Tour the first module

Open `modules/dashboard/src/index.ts`. This is the entire module definition:

```typescript
import { defineModule } from "@react-router-modules/core";
import type { RouteObject } from "react-router";
import type { AppDependencies, AppSlots, AppZones } from "@myorg/app-shared";
import { DashboardDetailPanel } from "./panels/DetailPanel.js";

export default defineModule<AppDependencies, AppSlots>({
  id: "dashboard",
  version: "0.1.0",

  meta: {
    name: "Dashboard",
    description: "Dashboard module",
    category: "general",
  },

  createRoutes: (): RouteObject => ({
    path: "dashboard",
    children: [
      {
        index: true,
        lazy: () => import("./pages/DashboardDashboard.js").then((m) => ({ Component: m.default })),
      },
      {
        path: "list",
        lazy: () => import("./pages/DashboardList.js").then((m) => ({ Component: m.default })),
        handle: { detailPanel: DashboardDetailPanel } satisfies AppZones,
      },
    ],
  }),

  navigation: [
    { label: "Dashboard", to: "/dashboard", order: 10 },
    { label: "Dashboard List", to: "/dashboard/list", order: 11 },
  ],

  slots: {
    commands: [
      {
        id: "dashboard:refresh",
        label: "Refresh Dashboard",
        group: "actions",
        onSelect: () => window.location.reload(),
      },
    ],
  },

  requires: ["auth"],
});
```

A single object describes everything the module contributes:

- **`meta`**: catalog info the shell can read via `useModules()` and `getModuleMeta()`.
- **`createRoutes`**: a standard React Router `RouteObject` subtree. The runtime mounts it under `authenticatedRoute` so the whole module sits behind whatever auth guard the shell decides. `createRoutes` is **optional**; headless modules (stores, commands, zones only, no routes) simply omit it.
- **`navigation`**: items the `<Sidebar>` in the shell picks up via `useNavigation()`. No manual registration.
- **`slots.commands`**: commands the `<ShellLayout>` header renders as buttons. The demo command reloads the page; replace it with anything callable.
- **`handle: { detailPanel: ... } satisfies AppZones`**: a **route zone**. When `/dashboard/list` is active, the shell reads `useZones<AppZones>().detailPanel` and renders `DashboardDetailPanel` in its right-hand panel. Navigate away and the panel disappears. See [Shell Patterns for React Router § Route Zones](./shell-patterns-react-router.md#route-zones).
- **`requires: ['auth']`**: the registry fails fast at resolve time if the `auth` store isn't provided to it. This is how modules declare their dependencies on shell-provided state.

Visit `/dashboard/list` in the running app. You'll see the list page in the main area and the detail panel on the right. Navigate back to `/dashboard` and the panel goes away.

## 4. Add a second module

From the project root:

```bash
npx @react-router-modules/cli create module billing --route billing
pnpm install
```

(If you prefer not to retype the package name, add `@react-router-modules/cli` to the root `devDependencies` and use `pnpm exec react-router-modules create module billing --route billing`.)

The `create module` command generates `modules/billing/` with the same structure as `dashboard` (plus a starter vitest test under `src/__tests__/`), adds `@myorg/billing-module` to `shell/package.json`, and wires `registry.register(billing)` into `shell/src/main.tsx`. **The `pnpm install` is not optional.** Without it, the new workspace package isn't linked and `pnpm dev` will fail to resolve `@myorg/billing-module`.

Restart `pnpm dev`. You'll see:

- A new **Billing** group in the sidebar (or merged into an existing group if you pass `--nav-group`)
- A **Refresh Billing** button in the header's command bar
- A detail panel on `/billing/list`

No edits to the shell required; the registry discovers everything from the module descriptor.

## 5. Add a store

Stores are the reactive state surface shared across modules. Add one with:

```bash
npx @react-router-modules/cli create store notifications
```

This:

1. Writes `shell/src/stores/notifications.ts` with a Zustand vanilla store.
2. Adds a `NotificationsStore` interface and `notifications: NotificationsStore` field to `AppDependencies` in `app-shared/src/index.ts`.
3. Registers the store with the registry in `shell/src/main.tsx`.

After the CLI finishes, open the generated store file and fill in the state shape and actions. Any module can consume it with `useStore('notifications', (s) => s.unreadCount)`. The `useStore` hook is the typed one exported from `@myorg/app-shared`, so it knows the store exists and what shape it has.

If a module `requires: ['notifications']` and you remove the store, the registry will throw at resolve time, before the app ever boots.

## 6. (Optional) Compose modules into a journey

When a flow spans several modules with shared state — "review profile → choose plan → collect payment", "verify identity → activate trial" — extract it into a typed journey instead of glue code in the shell. Scaffold one with:

```bash
npx @react-router-modules/cli create journey customer-onboarding \
  --modules dashboard,billing --persistence
pnpm install
```

The CLI:

1. Creates `journeys/customer-onboarding/` as a workspace package with the journey definition (`defineJourney`), a typed handle (`defineJourneyHandle`), and an `import type` of each module so the modules type-map stays bundle-free.
2. Installs `journeysPlugin()` on the registry and calls `registry.registerJourney(...)` in `shell/src/main.tsx`.
3. With `--persistence`, generates `shell/src/customer-onboarding-persistence.ts` using `createWebStoragePersistence` (one localStorage key per `(customerId, journeyId)` pair).
4. Adds the journey package and `@modular-react/journeys` to `shell/package.json`.

The generated definition has TODO markers for the `start` step and the per-module `transitions` map. Fill those in by declaring `entryPoints` / `exitPoints` on each composed module (`defineEntry` / `defineExit` from `@modular-react/core`) and wiring the exit branches to the next step.

See [`@modular-react/journeys`](../packages/journeys/README.md) for the full mental model, the `JourneyOutlet`/`ModuleTab` rendering surfaces, and the runtime hooks. The [`examples/react-router/customer-onboarding-journey/`](../examples/react-router/customer-onboarding-journey) example shows a three-module branching flow end to end.

## 7. Turn on the auth guard

The scaffold ships with a no-op auth guard so the app runs immediately. Open `shell/src/main.tsx`. You'll find:

```typescript
authenticatedRoute: {
  loader: () => {
    // TODO: replace with real auth check. Example:
    //   const { isAuthenticated } = authStore.getState()
    //   if (!isAuthenticated) throw redirect('/login')
    return null
  },
  Component: ShellLayout,
},

// shellRoutes: () => [
//   { path: '/login', Component: LoginPage },
// ],
```

To make the guard real:

1. Replace the `loader` body with an actual check that throws `redirect('/login')` (or whichever unauthenticated destination you want) when the user isn't signed in.
2. Uncomment `shellRoutes` and return one or more public routes. `shellRoutes` sits **outside** `authenticatedRoute`, so routes returned from it never hit the loader.
3. Build a real login page that calls `authStore.getState().login(...)` and navigates back to `/`.

For the full pattern (layout route as auth boundary, loader vs. useEffect, per-module role guards), see [Shell Patterns for React Router § Auth Guard Pattern](./shell-patterns-react-router.md#auth-guard-pattern).

## Migrating an existing app

If you already have a React Router v7 app, you don't throw it away. You refactor it in place. There's no automated migration command; the work is mechanical but has to be done module-by-module. Here's the sketch:

1. **Scaffold a throwaway project first.** Run the `init` command in a sibling directory so you have a working reference for the three-package layout, the `main.tsx` wiring, and the scaffolded `app-shared` contract. Keep it open while you migrate.
2. **Carve out `app-shared` in your repo.** Create a new workspace package (`app-shared/` or `@yourorg/app-shared`) and copy the scaffolded `index.ts` + `types.ts` as a starting point. Replace the sample store interfaces (`AuthStore`, `ConfigStore`) with the actual shapes of the stores you already have. The goal: `app-shared` becomes the single place your existing code and future modules both import types from.
3. **Move your existing stores and services under `shell/`.** They probably live in `src/stores/` and `src/services/` today. Move them into `shell/src/stores/` and `shell/src/services/` with minimal changes. Wire them into `createRegistry({ stores, services })`.
4. **Pick the smallest feature and extract it as the first module.** A single feature folder with two or three routes is ideal. Create `modules/<feature>/`, copy the routes out of your current `App.tsx` into `createRoutes()`, move any nav entries into `navigation: [...]`, and register the module with `registry.register(feature)`. Delete the old code paths.
5. **Repeat.** Each subsequent feature extraction is smaller than the last because the shell and `app-shared` stop growing.
6. **Flip the auth guard.** Once two or three modules are extracted and you trust the layout, replace the no-op `loader` in `authenticatedRoute` with whatever guard your old `App.tsx` ran.

The goal isn't "all features are modules on day one." It's "every new feature goes in as a module, and old features get extracted opportunistically." That's usually one or two weeks of part-time work for an app with ~20 routes, not a rewrite.

## Troubleshooting

**"Cannot find module `@myorg/<name>-module`" after `create module`.** You forgot `pnpm install`. The CLI adds the package to `shell/package.json` but doesn't run install for you. Run it from the project root.

**TypeScript says `notifications` doesn't exist on `AppDependencies` after `create store`.** Your editor's TS server is caching the pre-edit `app-shared` types. Restart the TS server (in VS Code: "TypeScript: Restart TS Server"). If that doesn't help, verify `app-shared/src/index.ts` actually contains the new interface and the new `AppDependencies` field.

**`pnpm typecheck` at the project root fails with `TS18002: The 'files' list in config file 'tsconfig.json' is empty`.** Known scaffold bug: the root `tsconfig.json` ships with empty `files` and `references` arrays. Workaround: typecheck each sub-package individually (`cd shell && npx tsc --noEmit`, etc.) or let Vite's dev server handle it. `pnpm dev` and `pnpm build` are unaffected.

**Two modules with the same `id` in their descriptors.** The registry throws `Duplicate module ID "<id>"` at resolve time. Rename one.

**A module declares `requires: ['notifications']` but the store isn't registered.** The registry throws `Module "<id>" requires dependencies not provided by the registry: notifications` at resolve time, before the app ever renders. Either add the store or remove the `requires` entry.

**HMR doesn't pick up changes to a new module's descriptor.** Vite usually handles this, but descriptor-level changes (new routes, new nav items) sometimes need a full `pnpm dev` restart because the module is imported eagerly in `main.tsx`.

## Where to go next

- **[Shell Patterns](./shell-patterns.md)**: router-agnostic fundamentals (slots, zones, commands, stores, cross-store coordination). Read this first if you haven't.
- **[Shell Patterns for React Router](./shell-patterns-react-router.md)**: everything specific to the RR integration (`handle`-based zones, `authenticatedRoute` with `loader`, public `shellRoutes`).
- **[Workspace Patterns](./workspace-patterns.md)**: tab-based workspace apps where modules are opened as dynamic tabs rather than mounted at fixed routes.
- **[`@react-router-modules/runtime` README](../packages/react-router-runtime/README.md)**: the runtime API surface (`createRegistry`, `resolve`, hooks).
