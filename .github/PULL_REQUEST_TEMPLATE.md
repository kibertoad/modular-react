<!--
Thanks for contributing! Fill in the sections below and keep the checklist honest.
Delete any section that genuinely doesn't apply.
-->

## What & why

<!-- What does this change do, and why? Link the tracker row / issue if there is one. -->

## How it was verified

<!-- Tests added/updated, `pnpm lint`, manual checks. -->

## Checklist

- [ ] `pnpm lint` passes (typecheck + oxfmt + oxlint).
- [ ] Tests cover the change and pass (`pnpm test`).
- [ ] Docs / READMEs / tracker updated in the same PR where relevant.
- [ ] **Vue impact stated.** If this touches `@modular-frontend/*` (core, engines,
      testing) or adds a capability to a React binding, it also states whether the
      Vue family (`@modular-vue/*`) needs the same change — and either makes it or
      files a follow-up row in
      [`docs/vue-support-tracker.md`](../docs/vue-support-tracker.md). Framework-neutral
      changes that land in a shared `@modular-frontend/*` package usually need no Vue
      follow-up; say so explicitly. (N/A for docs-only or Vue-only PRs.)
