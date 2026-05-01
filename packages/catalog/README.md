# @modular-react/catalog

Build a deployable, static **discovery portal** for the modules and journeys in your modular-react codebase. Point it at one or more directories, configure how descriptors are exposed, and get back a directory of HTML/JS/CSS/JSON you can host on any static server.

> **Status:** v0.2 — harvester, CLI, and SPA are stable. URL-driven filter state, pivot pages, and the build-time extension API are all in. The catalog also pre-computes a cross-reference graph (entry/exit usage, journey-to-journey invocations, module-to-journey launches) and recovers transition destinations from journey source via static analysis. Catalog `schemaVersion` is `"2"`.

## Why

In a portal where many teams contribute features, "is there already a module that does X?" is the question that sinks productivity. This package answers it: it scans your monorepo, harvests every `defineModule(...)` and `defineJourney(...)` it finds, surfaces them as a navigable, searchable catalog, and pre-computes facets (owner team, domain, tags, status) for filtering.

## Install

```bash
pnpm add -D @modular-react/catalog
```

## 5-minute setup

Create `catalog.config.ts` at the root of the workspace you want to scan:

```ts
import { defineCatalogConfig } from "@modular-react/catalog";

export default defineCatalogConfig({
  out: "dist-catalog",
  title: "Acme Portal",
  roots: [
    {
      name: "modules",
      pattern: "packages/*/src/index.ts",
      resolver: "defaultExport",
    },
    {
      name: "journeys",
      pattern: "journeys/*/src/index.ts",
      resolver: "defaultExport",
    },
  ],
  theme: {
    brandName: "Acme Portal",
    primaryColor: "#0E7C66",
  },
});
```

Run the build:

```bash
pnpm exec modular-react-catalog build
```

You get a `dist-catalog/` directory containing:

```
dist-catalog/
  index.html         # SPA entry
  assets/            # JS / CSS bundles
  catalog.json       # Harvested model — modules, journeys, facets
  manifest.json      # Build sidecar (counts, source roots, package version)
  theme.json         # Theme tokens consumed by the SPA at runtime
  theme.css          # CSS custom properties applied before JS executes
```

Deploy that directory to any static host (S3 + CloudFront, GitHub Pages, nginx, Caddy, …). No server-side runtime is needed.

## Local hosting

A zero-dependency static server is bundled for previewing the build locally and for e2e tests:

```bash
pnpm exec modular-react-catalog serve dist-catalog
# → http://127.0.0.1:4321
```

`serve` falls back to `index.html` for unknown paths so deep links work, and binds `127.0.0.1` by default. Override with `--port` (pass `0` to grab a random free port) and `--host`. Suitable for an npm script one-liner; not intended for production.

## Recommended descriptor metadata

The catalog reads officially-supported metadata fields out of every module's and journey's `meta` block. These fields are typed into `meta` via the `CatalogMeta` interface from `@modular-react/core`, so you get autocomplete out of the box without importing anything from this package.

```ts
import { defineModule } from "@modular-react/core";

export default defineModule({
  id: "billing",
  version: "1.2.0",
  meta: {
    name: "Billing",
    description: "Issues invoices and processes payments.",
    ownerTeam: "billing-platform",
    domain: "finance",
    tags: ["payments", "invoicing"],
    status: "stable",
    since: "1.0.0",
    links: {
      docs: "https://internal/docs/billing",
      source: "https://github.com/acme/web/tree/main/packages/billing",
      slack: "https://acme.slack.com/archives/CXYZ",
    },
  },
  // …routes, slots, navigation, etc.
});
```

| Field         | Type                                         | Use                                                 |
| ------------- | -------------------------------------------- | --------------------------------------------------- |
| `name`        | `string`                                     | Display name on cards and detail pages              |
| `description` | `string`                                     | One-line summary in lists, full text on detail      |
| `ownerTeam`   | `string`                                     | Pivot for "what does team X own?"                   |
| `domain`      | `string`                                     | Coarse capability area (`finance`, `onboarding`, …) |
| `tags`        | `readonly string[]`                          | Free-form discovery tags                            |
| `status`      | `"experimental" \| "stable" \| "deprecated"` | Lifecycle hint badge                                |
| `since`       | `string`                                     | First version where the descriptor appeared         |
| `links`       | `{ docs?, source?, slack?, runbook? }`       | Discovery links surfaced on the detail page         |
| `screenshots` | `readonly string[]`                          | Optional asset URLs                                 |

Any keys that aren't part of `CatalogMeta` are still accepted (your `TMeta` flows through unchanged) and surface in the SPA under an "Other metadata" expander on detail pages.

## Cross-links and the transition graph

Beyond the basics, the catalog pre-computes a cross-reference graph the SPA
uses for navigation between related descriptors. Every cross-link is
build-time work — the SPA never scans at render time.

| `CatalogModel` field       | What it indexes                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `journeysByModule`         | `moduleId` → journey ids that reference the module via `transitions`                                                       |
| `journeysByInvokedJourney` | `journeyId` → journey ids that call `invoke` against this journey (reverse of each journey's `invokes`)                    |
| `moduleEntryUsage`         | `moduleId.entryName` → `[{ journeyId, handledExits }]` — which journeys route into this entry, and which exits they handle |
| `moduleExitUsage`          | `moduleId.exitName` → `[{ journeyId, fromEntry, destinations?, aborts?, completes? }]` — handlers and what they route to   |

The module detail page renders entry and exit points as collapsible rows;
expanding one shows the journeys that use it and (for exits) where the
handler routes the flow next.

### Static recovery of transition destinations

`destinations` on `moduleExitUsage` rows is recovered statically from the
journey's source. The harvester parses each journey file with
[`oxc-parser`](https://www.npmjs.com/package/oxc-parser), locates the journey
object literal by `id`, walks `transitions[moduleId][entryName][exitName]`,
and inspects each handler's return statements for one of the three
canonical shapes:

- `{ next: { module: "...", entry: "..." } }` — captured as a destination
- `{ abort: ... }` — sets `aborts: true`
- `{ complete: ... }` — sets `completes: true`

Multiple branches in one handler produce multiple `destinations` entries plus
the matching flags. Handlers whose returns are not statically resolvable —
helper-call returns, computed module/entry names, spreads of an external
object — produce no destinations and the SPA renders the exit without a "→"
arrow rather than guessing. Static analysis is a best effort; correctness on
the easy 90% is the goal, not exhaustive coverage. Parse failures are
collected as non-fatal `HarvestError`s and the journey simply ends up with
empty `transitionDestinations`.

## Resolver styles

Each scan root picks a resolver telling the harvester how to extract descriptors from a file:

| Resolver                              | What it expects                                                         |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `"defaultExport"` (default)           | `export default defineModule({ ... })`                                  |
| `"namedExport"`                       | Any non-default export that quacks like a descriptor                    |
| `{ kind: "namedExport", exportName }` | A specific named export                                                 |
| `"objectMap"`                         | Default export is `{ key: descriptor, ... }` — every value is harvested |
| `{ kind: "custom", select }`          | Custom selector function — full control over what counts                |

```ts
roots: [
  // Standard convention
  { name: "monorepo", pattern: "packages/*/src/index.ts", resolver: "defaultExport" },

  // Vendor bundle that exports a registry object
  { name: "vendor", pattern: "vendor/registry.ts", resolver: "objectMap" },

  // Legacy area with hand-rolled detection
  {
    name: "legacy",
    pattern: "legacy/**/index.ts",
    depth: 4,
    resolver: {
      kind: "custom",
      select: (mod) => Object.values(mod).filter((v) => v && (v as any).kind === "module"),
    },
  },
];
```

`depth` caps how deep `pattern` is allowed to recurse — useful for keeping scans bounded in deep monorepos.

## Enrich hook

Inject org-specific metadata that the descriptor authors didn't (or couldn't) write themselves:

```ts
export default defineCatalogConfig({
  // …
  enrich: async (entry) => ({
    ...entry,
    meta: {
      ...entry.meta,
      ownerTeam: entry.meta.ownerTeam ?? inferOwnerFromCodeowners(entry.sourcePath),
    },
  }),
});
```

The hook fires once per harvested entry, after the resolver and before the catalog model is written. Returning the entry unchanged is a no-op.

## Theme tokens

`theme` in the config is emitted as both `theme.json` (read by the SPA at runtime for things like the brand name) and `theme.css` (a tiny stylesheet of CSS custom properties applied before JS loads, so brand colors appear without flicker):

```ts
theme: {
  brandName: "Acme Portal",
  logoUrl: "/logo.svg",
  primaryColor: "#0E7C66",
  backgroundColor: "#FAFAFA",
}
```

The SPA reads `--catalog-primary` and `--catalog-bg` at runtime; brand name and logo URL come from `theme.json`. For anything beyond these tokens, see "Extension API" below.

## CLI

```bash
modular-react-catalog build [--config path] [--out path] [--cwd path]
```

| Flag       | Default                                         | Use                                                            |
| ---------- | ----------------------------------------------- | -------------------------------------------------------------- |
| `--config` | First match of `catalog.config.{ts,js,mts,mjs}` | Override config path                                           |
| `--out`    | `config.out` ?? `dist-catalog`                  | Override output directory                                      |
| `--cwd`    | `process.cwd()`                                 | Override the project root used for config / pattern resolution |

## Programmatic API

```ts
import { harvest, buildCatalogModel } from "@modular-react/catalog";

const { entries } = await harvest(config, configDir);
const model = buildCatalogModel(entries, {
  title: config.title,
  extensions: config.extensions,
});
// model is JSON-safe — write it however you like.
```

## Extension API

The host can attach extra detail-page tabs and extra filter facets at build time. All extension code runs at build time and is baked into `catalog.json` — there is no extension code on the client.

```ts
import { defineCatalogConfig } from "@modular-react/catalog";

export default defineCatalogConfig({
  roots: [...],
  extensions: {
    facets: [
      {
        key: "compliance",
        label: "Compliance",
        // Returns string | string[] | undefined per entry. Aggregated values
        // become a dropdown in the SPA's filter rail; selections show up in
        // the URL as `?c.compliance=pci`.
        source: (entry) => entry.extraMeta.compliance as string[] | undefined,
      },
    ],
    moduleDetailTabs: [
      {
        id: "runbook",
        label: "Runbook",
        // Either `url` (sandboxed iframe) or `render` (trusted HTML string).
        // Returning undefined hides the tab for that entry.
        url: (entry) => `https://runbooks.internal/modules/${entry.id}`,
      },
      {
        id: "owners-card",
        label: "Owners",
        render: (entry) =>
          entry.meta.ownerTeam
            ? `<p>Owner: <strong>${entry.meta.ownerTeam}</strong></p>`
            : undefined,
      },
    ],
    journeyDetailTabs: [/* same shape as moduleDetailTabs */],
  },
});
```

Notes:

- Extension HTML returned from `render` is rendered directly by the SPA with `dangerouslySetInnerHTML`; it is not sanitized by the app. Always escape or sanitize any user-controlled strings before returning HTML.
- Iframes default to `sandbox="allow-scripts allow-same-origin"` and `referrerPolicy="no-referrer"`. URLs are limited to same-origin or HTTPS targets.
- Tabs that declare both `url` and `render` are rejected at build time.

## Pivot pages

The SPA exposes three pivot routes that show every module and journey matching a single facet value:

- `/teams/$team` — everything owned by a team
- `/domains/$domain` — everything in a domain
- `/tags/$tag` — everything tagged with a value

The team / domain / tag chips on cards and detail pages link straight to these pages.

## Architecture

- **Harvester** (`src/harvester/`): a single Vite SSR server `ssrLoadModule`s every file matching a root's pattern. Loaded modules are passed through the configured resolver, then duck-typed against `ModuleDescriptor` / `JourneyDefinition` shapes. After the runtime walk, journeys are also re-read from disk and statically analyzed via `oxc-parser` to recover transition destinations. Files that throw at load or parse time are reported as non-fatal `HarvestError`s and the run continues.
- **Schema** (`src/schema/`): builds the JSON-safe `CatalogModel` from harvested entries — partitions `meta` into `CatalogMeta` keys + `extraMeta`, derives slot/route/journey-modules info, pre-computes the cross-reference graph (`journeysByModule`, `journeysByInvokedJourney`, `moduleEntryUsage`, `moduleExitUsage`), and resolves any configured extension tabs/facets. Schema is versioned via `CATALOG_SCHEMA_VERSION` (currently `"2"`); the SPA refuses to load a payload whose version doesn't match.
- **CLI** (`src/cli/`): citty-based binary. `build` runs the harvester, writes `catalog.json` + `manifest.json` + `theme.{json,css}`, and copies the prebuilt SPA from `dist-spa/`.
- **SPA** (`spa-src/`): Vite + React 19 + TanStack Router + Tailwind v4 + Base UI primitives (the shadcn Base UI variant). Built once at package publish time; ships inside `dist-spa/` and is copied to the user's output directory by the CLI.
