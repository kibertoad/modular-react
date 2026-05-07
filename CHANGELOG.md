# Changelog

This repo releases via the `release-same-version` label (see `.github/workflows/publish.yml`): every package in the workspace ships the same version bump per release, even packages without code changes. This file exists so consumers can tell a content release from an alignment bump.

Per-package detail lives in the GitHub release tagged `<npm-name>@<version>`.

## Unreleased

### Behavior changes

- **`@modular-react/core`** — `buildNavigationManifest` (and therefore `useNavigation`) now breaks ties on `order` by preserving insertion order instead of label string comparison. Items declared first render first when `order` is unset or equal: modules in registration order, items in the order declared in each module's `navigation` array, plugin-contributed items last. Labels are no longer a tiebreaker — the previous fallback sorted by i18n-key name (e.g. `appShell.nav.assets` < `appShell.nav.projects`), which produced surprising orderings unrelated to translated text. Apps that relied (intentionally or not) on alphabetical-by-key fallback should set explicit `order` values to lock in the desired sequence.

## 2026-04-19 — `@modular-react/*@1.2.0`, `@*-modules/*@2.3.0`

Released alongside PR adjustments to PR #14 (Lokalise PoC gaps follow-up).

### Changed (substantive)

- **`@modular-react/core`** — new exports: `mergeRouteStaticData` (router-agnostic merge helper used by `useZones` / `useRouteData`) and `AnyModuleDescriptor<TNavItem>` (alias for `ModuleDescriptor<any, any, any, TNavItem>` — internal-plumbing shorthand). Internal: `buildNavigationManifest`, `collectDynamicSlotFactories`, and `warnIgnoredLazyFields` now accept the alias rather than positional `any` filler.
- **`@react-router-modules/core`** — re-exports its own router-narrowed `AnyModuleDescriptor` (preserves the React Router `createRoutes` signature).
- **`@tanstack-react-modules/core`** — same as above for TanStack Router.
- **`@react-router-modules/runtime`** — `useZones` and `useRouteData` now delegate merge logic to `mergeRouteStaticData` in core. No behavior change; deduplicates merge logic across the two runtimes.
- **`@tanstack-react-modules/runtime`** — same as above.

### Peer-dep ranges

Runtime and router-core packages tightened their `@modular-react/core` peer range to `^1.2.0` because they consume the new export. All other workspace-to-workspace peer/dev ranges updated to the new minor line for coherence.

### Alignment bumps (no code change)

These packages are published at the new minor version to keep the workspace coherent, but carry no source changes:

- `@modular-react/react@1.2.0`
- `@modular-react/testing@1.2.0`
- `@react-router-modules/cli@2.3.0`
- `@react-router-modules/testing@2.3.0`
- `@tanstack-react-modules/cli@2.3.0`
- `@tanstack-react-modules/testing@2.3.0`
