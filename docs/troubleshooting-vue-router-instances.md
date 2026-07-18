# Troubleshooting: duplicate `vue-router` instances

## Symptom

TypeScript rejects assignments between values that look identical, with an error
like:

```
Type 'RouteRecordRaw' is not assignable to type 'RouteRecordRaw | RouteRecordRaw[]'.
  Type 'import(".../vue-router@5.2.0_<hashA>/...").RouteRecordRaw' is not
  assignable to type 'import(".../vue-router@5.2.0_<hashB>/...").RouteRecordRaw'.
```

The two import paths are the **same version** of `vue-router` but different
virtual-store hashes. Runtime symptoms are possible too — `useRoute()` returning
`undefined`, guards not firing, or `provide`/`inject` misses — whenever your app
and a `@modular-vue/*` package bind to different physical copies.

## Cause

`vue-router@5` folded in `unplugin-vue-router` and now declares `vite`, `pinia`,
and `@vue/compiler-sfc` as **optional peer dependencies**. Package managers key a
package's install location by its resolved peers, so if your dependency tree
resolves `vite` (or its own peer, `rolldown`) at more than one version, you get
**more than one physical copy of `vue-router`** — at the same version. Its public
types are nominally branded (unique symbols + module augmentation), so a
`RouteRecordRaw` from copy A is not assignable to one from copy B.

This is a property of the consumer's dependency graph. `@modular-vue/*` packages
declare `vue`, `vue-router`, and `pinia` as **peer dependencies** (never bundled),
so they never add a second copy — but they also cannot force your app to dedupe
its own tree. That part is the app's responsibility.

## Fix: dedupe to a single `vue-router` (and `vite`)

First, confirm the duplication:

```bash
# pnpm
pnpm why vue-router
# npm
npm ls vue-router
# yarn
yarn why vue-router
```

If more than one instance is listed, pin the peer-forming deps to one version.
Pick the block for your package manager and add it to your app's root
`package.json`:

**pnpm** (`pnpm-workspace.yaml` in a workspace, or `package.json` in a single app):

```yaml
# pnpm-workspace.yaml
overrides:
  vite: 8.1.5 # or your single chosen vite version
```

```jsonc
// package.json (non-workspace pnpm)
{
  "pnpm": {
    "overrides": {
      "vite": "8.1.5",
    },
  },
}
```

**npm:**

```jsonc
{
  "overrides": {
    "vite": "8.1.5",
  },
}
```

**yarn:**

```jsonc
{
  "resolutions": {
    "vite": "8.1.5",
  },
}
```

Then reinstall (`pnpm install` / `npm install` / `yarn`) and re-run the `why`/`ls`
command — you should see a single `vue-router`. Pinning `vite` collapses the
optional-peer context that fractures `vue-router`; if a `rolldown` split is the
driver instead, pin `rolldown` the same way.

> Version numbers above are placeholders — use the single version your app
> actually resolves. The goal is _one_ of each, not any specific value.

## For maintainers of this repo

The workspace guards against reintroducing the split with
`scripts/check-lockfile-dedup.mjs` (run via `pnpm check:lockfile-dedup`), which
fails CI if any guarded package resolves to more than one instance of the same
version. The dedupe itself is enforced by the `vite@8` / `rolldown` entries in
`pnpm-workspace.yaml` `overrides` — see the comments there.
