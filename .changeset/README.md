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

Test-only and CI-only PRs need no changeset, and neither does documentation
outside `packages/*`. The `Changeset` check on the PR enforces this: it fails
when a package's _shipped_ files changed and no changeset was added. Which
files count is the `changedFilePatterns` config below, not "anything under
`packages/*`" — and not "anything but docs" either: only `README.md` and
`CHANGELOG.md` are exempt among a package's Markdown. Add the `skip-release`
label to override the check for a deliberate no-release change to shipped
source (a comment-only edit, say).

## How a release happens

1. Your PR merges to `main` with its changeset.
2. `.github/workflows/publish.yml` runs `changeset version`, which drains
   `.changeset/*.md` into version bumps + `CHANGELOG.md` entries, and opens a
   **chore: version packages** PR with the result.
3. The same workflow run merges that PR and then publishes every package whose
   version is not yet on npm, pushes the git tags, and creates the GitHub
   releases.

Nothing is published from a feature PR — only from the merged version PR. So
batching: several feature PRs merged before the version PR lands are released
together, in one bump per package.

If the version PR cannot be merged automatically, the release run fails rather
than going green with nothing published. Merging that PR by hand releases it:
a merge attributed to a person emits a `push` event, which starts a fresh
release run.

## What is not versioned here

- Private packages (`privatePackages: false`) — the example shells and the
  catalog SPA source.
- Public-by-omission example workspaces, matched by the `ignore` globs
  `@example/*` and `@example-*/*`.

## Notes on the config

- `changedFilePatterns` decides which files inside a package make it "changed"
  for the `Changeset` check. It is a denylist over `**` on purpose: a new kind
  of shipped file needs a changeset by default, and only the things that
  provably do not reach the published tarball's behaviour — tests, test
  fixtures and snapshots, test-runner config, `README.md`, `CHANGELOG.md` — are
  subtracted. Note this is deliberately narrower than "docs": Markdown a
  package carries beyond those two still counts as shipped. Order matters: the
  negations only take effect after `**`.
- Internal deps are all `workspace:*`, which `pnpm publish` rewrites to the
  exact version at pack time. A dependent therefore does need a release when
  its dependency moves, which is what `updateInternalDependencies: "patch"`
  gives us.
- Peer dependents need no config flag. The React and Vue bindings declare
  `@modular-frontend/*` as a wide-ranged `peerDependency` (`>=0.1.0 <2.0.0`),
  and changesets only bumps a peer dependent when the released version falls
  _outside_ the declared range — which these ranges never do. (The
  `onlyUpdatePeerDependentsWhenOutOfRange` flag that used to be needed for this
  is unrelated today: it lives under
  `___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH` and only controls whether
  the `peerDependencies` _range_ in `package.json` is rewritten.)
