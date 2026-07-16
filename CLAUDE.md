# Project conventions

## Formatting and linting (oxfmt / oxlint)

This repo uses `oxfmt` and `oxlint` workspace-wide, driven from the root. There is
no per-package formatter config.

- Lint check: `pnpm lint` (runs `turbo run typecheck && oxfmt --check . && oxlint .`).
- Autofix: `pnpm lint:fix` (runs `oxfmt --write . && oxlint --fix .`).

Always run oxfmt over the entire repo. Never target individual files or a
subpath (`oxfmt --write packages/foo`, `oxfmt src/x.ts`). Run from the repo root
against `.` only:

```bash
oxfmt --write .    # or: pnpm lint:fix
```

Two reasons:

1. Run from a subpath, oxfmt reports "No config found, using defaults" and
   produces misleading results, flagging files the root run would leave alone.
2. On Windows, a full `oxfmt --write .` produces large file churn (often 150+
   files touched). This is expected and safe. Most of it is line-ending
   (CRLF/LF) normalization, not real formatting change. Git absorbs the
   EOL-only changes at commit time, so the committed diff keeps only the
   meaningful formatting changes. Do not try to avoid this churn by narrowing
   the scope to individual files.

So: after code changes, run `pnpm lint:fix` (or `oxfmt --write .`) once over the
whole repo, then commit. The staged diff will be clean even though the working
tree showed a lot of touched files.

### After formatting

- **Do not rerun tests after formatting.** Formatting only rewrites whitespace,
  line endings, and layout — it never changes runtime behavior, so tests that
  passed before `oxfmt --write .` still pass after it. Run the test suite once
  against the meaningful code change; the format pass does not invalidate that
  result.
- **Do not check formatting results directly.** Never run `oxfmt --check .` (or
  inspect the reformatted files) to confirm formatting "worked". `oxfmt --write .`
  is authoritative — if it exits cleanly the tree is formatted. A separate
  `--check` pass, especially from a subpath, reports "No config found, using
  defaults" and produces misleading results. Trust the `--write` and move on.
