# Changesets

This folder is the release queue. Every PR that changes shipped library code
under `packages/*` adds one or more changeset files here; the release
automation drains them.

## Adding a changeset

```bash
pnpm changeset
```

Pick the packages you touched, pick `patch` / `minor` / `major` for each, and
write a one-line summary in the consumer's voice — the text lands verbatim in
that package's `CHANGELOG.md` and in the GitHub release notes. Commit the
generated `.changeset/*.md` file with the rest of your PR.

Docs-only, test-only, and CI-only PRs need no changeset. The `Changeset`
check on the PR enforces this: it fails when `packages/*` changed and no
changeset was added. Add the `skip-release` label to override it for a
deliberate no-release change (a comment-only edit to shipped source, say).

## How a release happens

1. Your PR merges to `main` with its changeset.
2. `release.yml` runs `changeset version`, which drains `.changeset/*.md` into
   version bumps + `CHANGELOG.md` entries, and opens a **Version Packages** PR
   with the result.
3. That PR is merged automatically, and the follow-up run publishes every
   package whose version is not yet on npm, then pushes the git tags and
   creates the GitHub releases.

Nothing is published from a feature PR — only from the merged Version Packages
PR. So batching: several feature PRs merged before the Version Packages PR
lands are released together, in one bump per package.

## What is not versioned here

- Private packages (`privatePackages: false`) — the example shells and the
  catalog SPA source.
- Public-by-omission example workspaces, matched by the `ignore` globs
  `@example/*` and `@example-*/*`.

## Notes on the config

- `onlyUpdatePeerDependentsWhenOutOfRange: true` — the React and Vue bindings
  declare `@modular-frontend/*` as a wide-ranged `peerDependency`
  (`>=0.1.0 <2.0.0`). Without this flag changesets treats _any_ release of a
  peer dependency as a breaking change for its dependents and majors them.
  With it, a dependent is only bumped when the new version actually falls
  outside the declared range.
- Internal deps are all `workspace:*`, which `pnpm publish` rewrites to the
  exact version at pack time. A dependent therefore does need a release when
  its dependency moves, which is what `updateInternalDependencies: "patch"`
  gives us.
