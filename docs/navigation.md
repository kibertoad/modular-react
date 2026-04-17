# Navigation: typed labels, dynamic hrefs, meta

`NavigationItem` has three optional generics. They all default to permissive shapes, so existing apps keep compiling; opt in one at a time as you want stricter typing.

```ts
interface NavigationItem<TLabel extends string = string, TContext = void, TMeta = unknown> {
  readonly label: TLabel;
  readonly to: TContext extends void ? string : string | ((ctx: TContext) => string);
  readonly icon?: string | ComponentType<{ className?: string }>;
  readonly group?: string;
  readonly order?: number;
  readonly hidden?: boolean;
  readonly meta?: TMeta;
}
```

## The typical pattern: one alias, used everywhere

Declare the alias in your `app-shared` package so every module and the shell agree:

```ts
// app-shared/src/nav.ts
import type { NavigationItem } from "@modular-react/core";
import type { ParseKeys } from "i18next";
import type { Action } from "./permissions";

export interface NavContext {
  workspaceId: string;
}

export interface NavMeta {
  action?: Action;
  badge?: "beta" | "new";
  analyticsId?: string;
}

export type AppNavItem = NavigationItem<ParseKeys, NavContext, NavMeta>;
```

Thread it through `defineModule`:

```ts
// modules/portal/src/index.ts
import { defineModule } from "@react-router-modules/core";
import type { AppDependencies, AppSlots, AppNavItem } from "@myorg/app-shared";

export default defineModule<AppDependencies, AppSlots, Record<string, unknown>, AppNavItem>({
  id: "portal",
  version: "1.0.0",
  navigation: [
    {
      label: "appShell.nav.portalRequests", // ParseKeys — typo = compile error
      to: ({ workspaceId }) => `/portal/${workspaceId}/requests`, // typed context
      meta: { action: "managePortalRequests" }, // typed meta
    },
  ],
});
```

And read with the same type on the shell:

```tsx
// components/Sidebar.tsx
import { useNavigation } from "@modular-react/react";
import { resolveNavHref } from "@modular-react/core";
import { useTranslation } from "react-i18next";
import type { AppNavItem } from "@myorg/app-shared";
import { usePermissions } from "./permissions";
import { useWorkspaceId } from "./workspace";

export function Sidebar() {
  const nav = useNavigation<AppNavItem>();
  const { t } = useTranslation();
  const { canPerform } = usePermissions();
  const workspaceId = useWorkspaceId();

  const visible = nav.items.filter((item) => !item.meta?.action || canPerform(item.meta.action));

  return (
    <ul>
      {visible.map((item) => (
        <li key={item.label}>
          <a href={resolveNavHref(item, { workspaceId })}>{t(item.label)}</a>
          {item.meta?.badge && <span className="badge">{item.meta.badge}</span>}
        </li>
      ))}
    </ul>
  );
}
```

Three things dropped out of the sidebar that had to live there before:

- **Permission filtering** is now per-item, declared by the owning module. No more `MODULE_NAV_ITEM_ACTIONS` map keyed on stringly-typed labels.
- **Dynamic hrefs** are the module's concern. The shell hands over the context; the module owns URL construction.
- **Typed i18n keys** catch typos at compile time. `label: "appShell.nav.typo"` fails TypeScript if it isn't a valid `ParseKeys` entry.

## Each generic in isolation

You don't have to adopt all three. Pick the ones that pay for themselves.

### `TLabel extends string` — typed i18n labels

Narrow labels to an i18n key union so typos fail at compile time.

```ts
type NavKey = "appShell.nav.home" | "appShell.nav.billing";
type AppNavItem = NavigationItem<NavKey>;

defineModule<AppDependencies, AppSlots, Record<string, unknown>, AppNavItem>({
  navigation: [
    { label: "appShell.nav.home", to: "/" }, // ✅
    { label: "appShell.nav.typo", to: "/" }, // ❌ Type '"appShell.nav.typo"' is not assignable
  ],
});
```

`i18next`'s `ParseKeys` union (or the equivalent for your i18n library) plugs in directly.

### `TContext` — dynamic hrefs

Some URLs can't be known statically — workspace-scoped paths, feature-flagged routes, active-tab-scoped routes. Declare the context your shell hands over at render time:

```ts
interface NavContext {
  workspaceId: string;
}
type AppNavItem = NavigationItem<string, NavContext>;

defineModule<AppDependencies, AppSlots, Record<string, unknown>, AppNavItem>({
  navigation: [
    { label: "Requests", to: ({ workspaceId }) => `/portal/${workspaceId}/requests` },
    { label: "Settings", to: "/settings" }, // still fine — static string
  ],
});
```

Resolve to a concrete href with `resolveNavHref(item, context)`:

```ts
import { resolveNavHref } from "@modular-react/core";
const href = resolveNavHref(item, { workspaceId: "ws-42" });
// → "/portal/ws-42/requests" or "/settings"
```

- Static strings pass through unchanged — context is ignored.
- Function `to` without a context throws a helpful error (`"<label>": no context was provided`) rather than rendering `undefined`.

If every item in your app uses the same context shape, define `NavContext` once in `app-shared` and thread it through the alias. If contexts vary per section, you can pass a wider union (`NavContext = { workspaceId?: string; projectId?: string }`) and let each item's `to` function read what it needs.

### `TMeta` — app-owned item metadata

The library treats `meta` as opaque. Use it for anything the module wants to attach to an item that the framework shouldn't opinionate on:

```ts
interface NavMeta {
  action?: Action; // permission filter
  badge?: "beta" | "new"; // UI badge
  analyticsId?: string; // event name on click
  featureFlag?: string; // gate visibility
}
type AppNavItem = NavigationItem<string, void, NavMeta>;
```

**Permissions** are the motivating case. Before `meta`, apps ended up with a label→action map in the sidebar — stringly-typed, breaks silently when labels change, and the rule lives outside the owning module. With `meta.action` on each item, the module declares its rules, and the shell filters generically:

```ts
const visible = nav.items.filter((item) => !item.meta?.action || canPerform(item.meta.action));
```

**Badges, analytics ids, feature flags** follow the same pattern. Anything that's app-shaped rather than library-shaped belongs in `meta`.

## `resolveNavHref` semantics

```ts
resolveNavHref<TContext>(
  item: Pick<NavigationItem<string, TContext, unknown>, "to" | "label">,
  context?: TContext,
): string
```

| Input                                                | Behavior                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `to: "/foo"`, no context                             | Returns `"/foo"`                                                        |
| `to: "/foo"`, any context                            | Returns `"/foo"` — context ignored                                      |
| `to: (ctx) => "/x/" + ctx.id`, context `{ id: "1" }` | Returns `"/x/1"`                                                        |
| `to: () => "/x"`, no context                         | Throws: `"<label>": no context was provided`                            |
| `to: 42` (invalid shape)                             | Throws: `"<label>": invalid \`to\` field (expected string or function)` |

The function takes a `Pick<..., "to" \| "label">` rather than the full item, so you can pass any object with those two fields — useful for tests or intermediate representations.

## Do I have to use generics?

No. `NavigationItem` defaults to `label: string, to: string, meta: unknown` — existing modules keep compiling unchanged. The generics are opt-in, and each one pays for itself independently. Common adoption paths:

1. Start with `TMeta` for permissions (the highest-leverage single change — removes a stringly-typed map from shell code).
2. Add `TContext` when the first workspace-scoped route appears.
3. Add `TLabel` once i18n keys stabilise enough that typos become the dominant navigation bug.

## See also

- [Shell Patterns (Fundamentals)](shell-patterns.md) — rest of the shell surface.
- `@modular-react/core` README — full type reference.
