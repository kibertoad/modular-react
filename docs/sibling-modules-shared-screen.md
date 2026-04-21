# Sibling modules sharing a screen

Some products expose what looks like "one screen, parameterized" — an integration manager, a tenant settings page, a generic dataset browser — where several feature modules should all land in the same UI but with different data, columns, actions, or feature flags. This guide shows how to model that with modular-react primitives, without inventing new concepts like "mode modules", "capability gates", or shell-owned product screens.

The canonical example: an app with three integration modules (Contentful, Strapi, GitHub). All three render the same `<IntegrationManager>` screen, but the columns, buttons, and feature flags differ per integration.

## TL;DR — the shape

1. **One shared component** (`IntegrationManager`) in a shared package. Plain React, configured via props.
2. **One shared config type** (`IntegrationConfig` / `IntegrationFeatures`) in `app-shared`. All integration modules agree on the shape.
3. **Each integration is its own module**. Each owns its own route, renders the shared component with its own config, and mirrors the same config onto the route's `handle` / `staticData` so shell zones can read it.
4. **Shell zones adapt** to the active integration via `useRouteData<AppRouteData>()`. They don't know the names of specific integrations — they read the typed config and render accordingly.

No new module type. No new zone type. No capability registry. No scope primitive. Just the existing module + route + handle/staticData + useRouteData stack.

## Why this is the right shape

The temptation is to make one of:

- **A shell-owned `/integrations/:type` route** that reads modules' contributions. This couples the shell to a product concept ("integrations") — next time another shared screen shows up, the shell grows another branch. Shells should stay generic.
- **A central `integration-manager` module that the three plug into.** Valid only if the manager has significant shared state, data fetching, or tab coordination. For the "render differently based on config" case, a shared component is enough and avoids cross-module coupling.
- **A new module type or capability primitive.** Premature specialization. Module uniformity is load-bearing in this library — a second kind of module creates a taxonomy that keeps branching. The per-integration variance is just data, and data is what module config objects are for.

The sibling-module pattern keeps each integration self-contained (delete the module → the integration is gone), keeps the manager a plain React component (testable without the framework), and keeps the shell agnostic (it only knows "a route is active and declared this typed data").

## Step-by-step

### 1. Declare the shared config type in `app-shared`

The vocabulary lives here. Every integration module will conform to these types.

```typescript
// app-shared/src/integrations.ts

/**
 * Feature flags that an integration can toggle. Flat bag of primitives —
 * booleans, numbers, small arrays. Shared across all integrations so the
 * Integration Manager can check them uniformly.
 */
export interface IntegrationFeatures {
  readonly allowAssigningLanguagesToFolders?: boolean;
  readonly limitImportToOnlyBaseLanguage?: boolean;
  readonly maxBatchSize?: number;
  readonly supportedImportTags?: readonly ImportTag[];
}

export interface ImportTag {
  readonly id: string;
  readonly title: string;
}

/**
 * Column shown in the Integration Manager's content-items table. Each
 * integration declares its own column set.
 */
export interface ColumnDefinition {
  readonly id: string;
  readonly title: string;
  readonly type: "string" | "date" | "number";
}

/**
 * The full per-integration config passed to `<IntegrationManager>`.
 * Modules construct one of these and render the component with it.
 */
export interface IntegrationConfig {
  readonly id: string;
  readonly displayName: string;
  readonly features: IntegrationFeatures;
  readonly columns: readonly ColumnDefinition[];
}

/**
 * What shell zones read via `useRouteData<AppRouteData>()`. The module
 * mirrors its `IntegrationConfig` onto route `handle` / `staticData` under
 * the `integration` key; the shell's header and command zones read it.
 */
export interface AppRouteData {
  readonly integration?: IntegrationConfig;
  readonly pageTitle?: string;
}
```

Export the types from `app-shared/src/index.ts` so every module + the shell can import them.

### 2. Build `<IntegrationManager>` as a shared component

Plain React. No module framework imports. Lives in its own workspace package (`@myorg/integration-manager`) or in `app-shared` if small.

```typescript
// integration-manager/src/IntegrationManager.tsx
import type { IntegrationConfig } from "@myorg/app-shared";

export interface IntegrationManagerProps {
  readonly config: IntegrationConfig;
}

export function IntegrationManager({ config }: IntegrationManagerProps) {
  return (
    <section>
      <header>
        <h1>{config.displayName}</h1>
      </header>

      <table>
        <thead>
          <tr>
            {config.columns.map((col) => (
              <th key={col.id}>{col.title}</th>
            ))}
          </tr>
        </thead>
        {/* rows fetched/rendered here */}
      </table>

      {config.features.allowAssigningLanguagesToFolders ? <LanguageFolderAssigner /> : null}
      {config.features.limitImportToOnlyBaseLanguage ? <BaseLanguageImportBanner /> : null}
    </section>
  );
}
```

The component knows nothing about Contentful, Strapi, or GitHub. It reads the typed config and renders.

### 3. Each integration is its own module

Each module owns its route, renders the shared component with its own config, and mirrors the config onto `handle` / `staticData` so shell zones can read it.

**React Router:**

```tsx
// modules/contentful/src/index.tsx
import { defineModule } from "@react-router-modules/core";
import type { RouteObject } from "react-router";
import type {
  AppDependencies,
  AppRouteData,
  AppSlots,
  IntegrationConfig,
} from "@myorg/app-shared";
import { IntegrationManager } from "@myorg/integration-manager";

const contentfulConfig: IntegrationConfig = {
  id: "contentful",
  displayName: "Contentful",
  features: {
    allowAssigningLanguagesToFolders: true,
    supportedImportTags: [
      { id: "entry_title", title: "Entry title" },
      { id: "content_type", title: "Content type" },
    ],
  },
  columns: [
    { id: "type", title: "Content type", type: "string" },
    { id: "updatedAt", title: "Last updated", type: "date" },
  ],
};

const handle: AppRouteData = {
  integration: contentfulConfig,
  pageTitle: "Contentful",
};

export default defineModule<AppDependencies, AppSlots>({
  id: "contentful",
  version: "1.0.0",
  requires: ["auth", "httpClient"],

  createRoutes: (): RouteObject[] => [
    {
      path: "integrations/contentful",
      Component: () => <IntegrationManager config={contentfulConfig} />,
      handle,
    },
  ],

  navigation: [
    {
      label: "Contentful",
      to: "/integrations/contentful",
      group: "integrations",
      order: 10,
    },
  ],
});
```

**TanStack Router:**

```tsx
// modules/contentful/src/index.tsx
import { defineModule } from "@tanstack-react-modules/core";
import { createRoute } from "@tanstack/react-router";
import type { AppDependencies, AppSlots, IntegrationConfig } from "@myorg/app-shared";
import { IntegrationManager } from "@myorg/integration-manager";

const contentfulConfig: IntegrationConfig = {
  /* same shape as above */
};

export default defineModule<AppDependencies, AppSlots>({
  id: "contentful",
  version: "1.0.0",
  requires: ["auth", "httpClient"],

  createRoutes: (parentRoute) =>
    createRoute({
      getParentRoute: () => parentRoute,
      path: "integrations/contentful",
      component: () => <IntegrationManager config={contentfulConfig} />,
      staticData: {
        integration: contentfulConfig,
        pageTitle: "Contentful",
      },
    }),

  navigation: [
    {
      label: "Contentful",
      to: "/integrations/contentful",
      group: "integrations",
      order: 10,
    },
  ],
});
```

Repeat for Strapi (`modules/strapi/`) and GitHub (`modules/github/`). Each module lives in its own workspace package and pins its own config. Adding a new integration is `create module <name>`, drop in a config object, register it.

### 4. Type the definition site (optional but recommended)

By default, React Router's `RouteObject.handle` is `unknown` and TanStack Router's `staticData` is an empty interface. Declare an ambient module augmentation in `app-shared` so typos in `handle` / `staticData` become compile errors across every module.

**React Router:** React Router v7 types `RouteObject.handle` as `unknown` and doesn't expose a module-augmentation target for narrowing it. Type the handle at the call site with `satisfies` or an explicit type annotation:

```typescript
const handle: AppRouteData = { integration: contentfulConfig }; // checked
// or inline with `satisfies`:
handle: { integration: contentfulConfig } satisfies AppRouteData,
```

Consumers still read it with the typed generic, so the shell is fully type-checked even though the route-definition side is checked per-call.

**TanStack Router:**

```typescript
// app-shared/src/types.ts
import type { AppRouteData } from "./integrations.js";

declare module "@tanstack/router-core" {
  // StaticDataRouteOption is checked against staticData: { ... }
  interface StaticDataRouteOption extends AppRouteData {}
}
```

Both augmentations are type-only; no runtime cost. Place them once in `app-shared` so every module and the shell pick them up.

### 5. Shell zones read the active integration's config

The shell stays generic. A header-commands slot, a breadcrumb, a detail panel — all of these call `useRouteData<AppRouteData>()` and branch on the typed config.

```typescript
// shell/src/components/HeaderCommands.tsx
import { useRouteData } from "@react-router-modules/runtime"; // or @tanstack-react-modules
import type { AppRouteData } from "@myorg/app-shared";

export function HeaderCommands() {
  const { integration, pageTitle } = useRouteData<AppRouteData>();

  if (!integration) return null;

  return (
    <div role="toolbar">
      <h2>{pageTitle ?? integration.displayName}</h2>
      {integration.features.allowAssigningLanguagesToFolders ? (
        <button>Assign languages to folders…</button>
      ) : null}
      {integration.features.limitImportToOnlyBaseLanguage ? (
        <button>Import base language only</button>
      ) : null}
    </div>
  );
}
```

When the user navigates between `/integrations/contentful` and `/integrations/strapi`, `useRouteData` returns the new config, and the shell re-renders with the right buttons. When the user leaves the integration routes entirely, `integration` is `undefined` and the toolbar hides itself.

### 6. Module commands via `slots.commands` + `dynamicSlots` (optional)

If the command palette should include per-integration entries only while that integration is active, keep them in the module's `dynamicSlots` gated on the current pathname, **or** put them in `handle` / `staticData` and read them from `useRouteData` inside the shell's palette renderer. Both work; the `handle` channel keeps the command tied to the route lifecycle automatically.

## What to avoid

- **Don't make the shared component know about specific integrations.** It reads `IntegrationConfig`. If Contentful needs something Strapi doesn't, add a feature flag (`features.xyz?: boolean`) or a data field; don't branch on `config.id === "contentful"`.
- **Don't put integration-specific types in the shared config.** The types are shared precisely so the Integration Manager stays general. A Contentful-only field belongs inside the Contentful module.
- **Don't invent a "capability gate" at the library level for this.** Capability-style gating (modules included/excluded based on deployment config) is a different pattern — see deployment-level composition in the registry. Here, all three integration modules are always registered; the per-integration variance is per-route data.
- **Don't push this into a shell-owned route.** The shell stays generic. Each integration module owns its own route; the shell only owns zones that react to what's active.

## When not to use this pattern

- Integrations with fundamentally different UIs (a visual editor vs. a tabular browser). Then they're different screens and should be separate components owned by separate modules — not siblings of the same screen.
- Integrations that need to share state across each other. Then a shared store in `app-shared` (or an owning integration-manager module) is the right home; sibling modules sharing a stateless screen doesn't fit.
- Cases where the set of integrations is not known at build time. Then you're in plugin territory — use `registerLazy` or a runtime registration layer; the config-passed-as-props pattern still applies per-plugin.

## Relationship to other patterns

- **[Shell Patterns](shell-patterns.md)** — this pattern builds on `useZones` / `useRouteData` from the fundamentals guide.
- **[Navigation](navigation.md)** — each integration module owns its own nav item. Consider typing `group` (e.g. `"integrations"`) so the sidebar groups them visually.
- **[Workspace Patterns](workspace-patterns.md)** — if the integrations are opened as tabs rather than routes, swap `handle` / `staticData` for `useActiveZones(activeModuleId)`; the rest of the pattern is the same.

## Example

The repository includes a working example of this pattern for both routers:

- `examples/react-router/integration-manager/`
- `examples/tanstack-router/integration-manager/`

Each example is a full workspace with three sibling integration modules (Contentful, Strapi, GitHub), a shared `IntegrationManager` component, typed handle/staticData, and a shell that adapts header commands to the active integration.
