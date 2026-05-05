---
name: catalog-setup
description: Use when adding @modular-react/catalog discovery: catalog.config.ts, descriptor meta fields, modular-react-catalog build or serve, harvest roots, resolver selection, static SPA deployment, or cross-reference graph troubleshooting.
sources:
  - ../../README.md
  - ../../../../README.md
---

# Catalog setup

Use `@modular-react/catalog` for a searchable discovery portal over modules and journeys. It is a build-time harvester plus static SPA; it does not need a server runtime after build.

## Basic config

Create `catalog.config.ts` in the workspace root:

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

Build and preview:

```sh
pnpm exec modular-react-catalog build
pnpm exec modular-react-catalog serve dist-catalog
```

## Descriptor metadata

Add catalog metadata to each module or journey `meta` block. Prefer concise, searchable values:

```ts
meta: {
  name: "Billing",
  description: "Issues invoices and processes payments.",
  ownerTeam: "billing-platform",
  domain: "finance",
  tags: ["payments", "invoicing"],
  status: "stable",
  links: {
    docs: "https://internal/docs/billing",
    source: "https://github.com/acme/web/tree/main/packages/billing",
  },
}
```

## Resolver choices

- Use `defaultExport` for `export default defineModule(...)` or `export default defineJourney(...)`.
- Use `namedExport` when descriptors are named exports.
- Use `objectMap` when one file exports a map of descriptors.
- Use `custom` only for legacy or unusual layouts.

## Cross-reference graph

The catalog precomputes journey and module cross-links at build time. For static transition recovery, keep common journey returns as direct object literals:

```ts
return { next: { module: "plan", entry: "select" } };
return { abort: "cancelled" };
return { complete: output };
```

## Common mistakes

- Do not point `roots` at built `dist` files. Harvest source descriptors.
- Do not use broad globs that scan tests, generated files, or examples unless that output is intentional.
- Do not omit `ownerTeam`, `domain`, and `status` in large workspaces; those fields drive useful facets.
- Do not expect unresolved helper returns or computed module ids to appear as transition destinations in the SPA.
- Do not deploy anything except the generated static output directory.
