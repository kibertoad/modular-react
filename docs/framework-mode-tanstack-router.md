# Framework-Mode Integration (TanStack Router & TanStack Start)

This guide shows how to use `@tanstack-react-modules/runtime` alongside TanStack Router file-based routing (`@tanstack/router-plugin`) or **TanStack Start**. The Vite plugin owns route discovery and type generation (`routeTree.gen.ts`), the host owns `createRouter`, and — with Start — the framework owns SSR and server functions. The registry owns everything else: shared dependencies, slots, navigation, zones, module lifecycle.

**For a new TanStack Router app or any TanStack Start app, this is the recommended path.** The alternative (`registry.resolve()`) gives up file-based discovery and generated types.

## Framework mode vs `resolve()`

`resolve()` calls `createRouter({ routeTree })` directly on a tree the library assembles imperatively from each module's `createRoutes(parentRoute)`. It's the shortest path to a working app — one call and you're rendering — but you give up what the TanStack plugin provides:

| Feature                                                                   | Framework mode (`resolveManifest`) | `resolve()`          |
| ------------------------------------------------------------------------- | ---------------------------------- | -------------------- |
| File-based route discovery (`routeTree.gen.ts`)                           | ✅                                 | ❌ — imperative only |
| Generated route types (typed params / loaders / search schemas)           | ✅                                 | ❌                   |
| SSR / server functions (TanStack Start)                                   | ✅                                 | ❌                   |
| HMR on route files                                                        | ✅                                 | ❌ — full reload     |
| Library owns router creation<sup>1</sup>                                  | ❌                                 | ✅                   |
| Single-file wiring<sup>2</sup> (app's full shape in one `resolve()` call) | ❌                                 | ✅                   |

<sup>1</sup> In framework mode, the library _intentionally_ defers router creation to the host so you can keep the plugin's route discovery, type generation, and (with Start) SSR. The ❌ here is the tradeoff that unlocks everything above — not a regression.

<sup>2</sup> The ❌ is similarly the inverse of the ✅s above: when file-based discovery and generated types are owned by the framework, route shape lives on disk instead of in a `resolve()` call. Most apps find this a net win; plugin-host apps that need every module's full shape in one place are the counter-case.

Pick `resolve()` only when the tradeoff genuinely favors it:

- **Plugin-host apps** where modules arrive at runtime (external bundles, remote federation) and you can't pre-place route files for them on disk.
- **CSR-only tools** with no need for typed params, SSR, or route-file HMR — a tiny internal dashboard where the one-call wiring is the point.
- **Legacy setups** predating file-based routing that haven't migrated yet. `resolve()` exists so you don't have to migrate to use this library.

For everything else — greenfield apps, anything shipping to real users, anything that benefits from typed routes, and all of TanStack Start — use `resolveManifest()`. The setup is a few more lines (one `registry.ts`, one `__root.tsx` wrap, one `router.ts`), and you keep the full TanStack developer experience.

Read [Getting started with TanStack Router](getting-started-tanstack-router.md) first for the library-agnostic tour of modules and slots. This document focuses on the integration seam.

## What `resolveManifest()` does

`resolveManifest()` returns everything the registry can assemble **without creating a router**:

```ts
interface ResolvedManifest<TSlots> {
  Providers: React.ComponentType<{ children: React.ReactNode }>;
  navigation: NavigationManifest;
  slots: TSlots;
  modules: readonly ModuleEntry[];
  recalculateSlots: () => void;
}
```

- `Providers` wraps the full modular-react context stack — shared deps, navigation, slots, modules, recalculate signal, and any `providers?` option you passed. Place it around `<Outlet />` in your `__root.tsx`.
- The rest matches `resolve()`.

No `Router` is created. The host calls `createRouter({ routeTree })` as usual.

> **No `routes` field.** TanStack modules build routes via `createRoute({ getParentRoute: () => parent, ... })` — the parent is bound at construction time, so the resulting route can't be grafted into a host's already-composed file-based tree. In framework mode the host owns route composition (file-based or a hand-built `routeTree`), module `createRoutes` declarations are silently ignored, and modules contribute only navigation/slots/zones/lifecycle. The React Router counterpart does expose `manifest.routes` — that only works there because `RouteObject[]` is a flat mountable array; the TanStack route shape doesn't admit the same pattern.

## The idempotent registry

`resolveManifest()` is idempotent — call it as many times as you want. The first call does the work (validation, `onRegister` hooks, provider wiring) and caches the result. Later calls return the same manifest.

**Options are honored only on the first call.** Passing options on a subsequent call throws, so misconfiguration is loud instead of silently ignored. The recommended pattern is to resolve once in a shared module and import the manifest wherever it's needed:

```ts
// app/registry.ts
import { createRegistry } from "@tanstack-react-modules/runtime";
import portalModule from "./modules/portal";
import type { AppDependencies, AppSlots } from "./types";
import { I18nProvider } from "./providers/i18n";
import { authStore, httpClient } from "./services";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
  slots: { commands: [] },
});

registry.register(portalModule);

export const manifest = registry.resolveManifest({
  providers: [I18nProvider],
});
```

```tsx
// app/routes/__root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { manifest } from "../registry";

export const Route = createRootRoute({
  component: () => (
    <manifest.Providers>
      <Outlet />
    </manifest.Providers>
  ),
});
```

```ts
// app/router.ts
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});
```

Nothing in `router.ts` references the registry. That's intentional — route **shape** is declared on disk by the TanStack plugin; the module contributes navigation, slots, zones, and lifecycle, not route files.

## Auth, 404, shell routes in framework mode

All of these move out of `resolveManifest()` options and into route files / `beforeLoad` guards:

| `resolve()` option   | Framework-mode equivalent                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `rootComponent`      | `component` on `createRootRoute` in `app/routes/__root.tsx`                                                  |
| `indexComponent`     | `app/routes/index.tsx` (or whatever file maps to `/`)                                                        |
| `notFoundComponent`  | `notFoundComponent` option on `createRootRoute`                                                              |
| `authenticatedRoute` | A pathless layout route (`app/routes/_authenticated.tsx`) with a `beforeLoad` guard                          |
| `shellRoutes`        | Regular files in `app/routes/` outside the `_authenticated` layout                                           |
| `beforeLoad` (root)  | `beforeLoad` on `createRootRoute` in `__root.tsx`                                                            |
| `providers`          | Still on `resolveManifest({ providers })` — applied to the context tree                                      |
| `slotFilter`         | Still on `resolveManifest({ slotFilter })` — applied to the dynamic-slots pipeline                           |

The two options that remain on `resolveManifest()` — `providers` and `slotFilter` — are about the context tree, not about routing. They stay because the `Providers` component owns them.

### `_authenticated.tsx` — minimal layout-route auth guard

Concrete sketch of the framework-mode equivalent to `authenticatedRoute` on `resolve()`:

```tsx
// app/routes/_authenticated.tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const res = await fetch("/api/auth/session");
    if (!res.ok) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: () => <Outlet />,
});
```

Any route file placed under `app/routes/_authenticated/` is guarded by this `beforeLoad`. Public routes (`app/routes/login.tsx`, `app/routes/signup.tsx`) sit at the root level, outside the layout.

Under `resolve()`, the library built this tree for you. In framework mode, you declare it with a `_authenticated` layout file + a regular `beforeLoad` — fewer library concepts, full type safety from the TanStack plugin's generated route types.

## TanStack Start specifics

TanStack Start builds on TanStack Router file-based mode with SSR, server entry files, and server functions. The integration seam the module registry cares about — `__root.tsx` wrapping and the host-owned `createRouter` — is the same; Start's extras (server functions, `createStartHandler`, etc.) are orthogonal.

```tsx
// app/router.tsx — Start convention: export a `createRouter` factory
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
  });
}
```

```tsx
// app/routes/__root.tsx — same wrap as the pure file-based case
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Meta, Scripts } from "@tanstack/start";
import { manifest } from "../registry";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <html>
      <head>
        <Meta />
      </head>
      <body>
        <manifest.Providers>
          <Outlet />
        </manifest.Providers>
        <Scripts />
      </body>
    </html>
  );
}
```

The `app/registry.ts` file is identical to the non-Start example. The modular-react packages do not touch `window`, `document`, `localStorage`, or any browser-only global at import or resolve time, so importing `registry.ts` from both the server entry (`app/ssr.tsx`) and the client entry (`app/client.tsx`) is safe. If your own `providers` include browser-only code, guard those with the same SSR pattern you'd use outside of the module system (e.g. `useEffect` for client-only subscriptions).

### Server functions are outside the module registry

`createServerFn()` and its caller components live in your route files — the registry doesn't see them. If a module wants to expose a server-side API, export a `createServerFn` from the module package and have route files import it directly. The registry still delivers shared deps and navigation; server boundaries are a layer above it.

## Testing

`resolveManifest()` is fully testable without a router. The `Providers` component mounts the same context stack `resolve()` uses, so hooks like `useNavigation`, `useSlots`, `useModules`, and `useStore` work in tests that only render `<Providers>`:

```tsx
import { render } from "@testing-library/react";
import { createRegistry } from "@tanstack-react-modules/runtime";
import { useNavigation } from "@modular-react/react";

const registry = createRegistry({ stores: { auth: authStore }, services: { httpClient } });
registry.register(billingModule);
const { Providers } = registry.resolveManifest();

function Probe() {
  const nav = useNavigation();
  return (
    <ul>
      {nav.items.map((i) => (
        <li key={i.label}>{i.label}</li>
      ))}
    </ul>
  );
}

const { getByText } = render(
  <Providers>
    <Probe />
  </Providers>,
);
expect(getByText("Billing")).toBeInTheDocument();
```

For tests that exercise real routing, use the existing `@tanstack-react-modules/testing` utilities.

## Rules of thumb

- **Pick a mode early.** The registry commits on first call — mixing `resolve()` and `resolveManifest()` throws. Decide whether the library or the host owns the router before you start registering modules.
- **Resolve once.** Put `resolveManifest()` in a shared module (`app/registry.ts` or similar) and import the manifest from every callsite. The idempotency safety net exists so a slip-up is loud, not so you have a license to scatter calls.
- **Route shape on disk, everything else in modules.** Modules still own navigation, slots, zones, lifecycle, and shared-deps requirements. Their `createRoutes` declarations are ignored in framework mode — move that logic into route files using the TanStack file conventions.
- **Typed DI and startup validation.** Both work identically: `createSharedHooks<AppDependencies>()` and `requires: [...]` do what they always did. `Providers` delivers the dependency container; no router involvement.

## See also

- [Getting started with TanStack Router](getting-started-tanstack-router.md) — for the library-owns-router path.
- [Shell Patterns for TanStack Router](shell-patterns-tanstack-router.md) — module route shape, zones via `staticData`, auth guards.
- [`useRouteData`](shell-patterns-tanstack-router.md#route-data-non-component-staticdata) — non-component route metadata (headerVariant, page titles).
- [Navigation: typed labels, dynamic hrefs, meta](navigation.md) — the full `NavigationItem` generic surface.
