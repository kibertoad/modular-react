# `@example/catalog` — demo discovery portal

This example builds a populated [`@modular-react/catalog`](../../packages/catalog/) from the **tanstack-router** examples in this monorepo. It is the easiest way to see what a real catalog looks like once it has multiple modules and journeys to display.

The config (`catalog.config.ts`) scans **two** sibling example apps:

- `examples/tanstack-router/customer-onboarding-journey/` — three modules (`profile`, `plan`, `billing`) and one journey (`customer-onboarding`)
- `examples/tanstack-router/journey-invoke/` — three modules (`age-verify`, `checkout-review`, `checkout-confirm`) and two journeys (`checkout`, `verify-identity`)

That's six modules and three journeys — enough to exercise the filter rail, the pivot pages (`/teams/checkout`, `/domains/commerce`, …), and a custom facet (`Compliance`).

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter @example/catalog start
```

`start` runs `build` (harvests descriptors, emits `dist-catalog/`) followed by `serve` (zero-dep static server bound to `127.0.0.1:4321`). Open the printed URL in a browser.

If you want to iterate on the SPA itself, do that under `packages/catalog/spa-src/` — those changes flow through to the catalog package's `dist-spa/` next time you `pnpm --filter @modular-react/catalog build:spa`.

## Individual scripts

```bash
pnpm --filter @example/catalog build       # harvest + write dist-catalog/
pnpm --filter @example/catalog serve       # host the existing dist-catalog/
pnpm --filter @example/catalog clean       # rm -rf dist-catalog/
```

## End-to-end tests

The `tests/` directory ships a [Playwright](https://playwright.dev) suite that drives the generated SPA against this fixture and asserts the visible behavior:

- module/journey list rendering and counts
- filter rail URL round-trip (team / domain / status / custom facet)
- pivot pages (`/teams/...`, `/domains/...`, `/tags/...`)
- module detail page with the Runbook extension tab (mock on-call + deploys)

```bash
pnpm --filter @example/catalog test:e2e:install  # one-time: install Chromium
pnpm --filter @example/catalog test:e2e
```

The Playwright config builds the catalog once and starts the bundled `serve` command as a webServer before the tests run, so there's nothing else to keep alive in another terminal.

## What this is not

Not the SPA's own dev environment — that lives at `packages/catalog/spa-src/` and runs against a fixture catalog. This package is a demo of the public CLI flow exactly as a host repo would consume it.
