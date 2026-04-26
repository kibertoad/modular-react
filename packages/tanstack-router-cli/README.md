# @tanstack-react-modules/cli

Scaffolding CLI for modular-react (TanStack Router integration). Creates projects, modules, stores, and journeys with full wiring.

## Commands

```bash
# Bootstrap a new pnpm workspace with shell + first module.
tanstack-react-modules init <name> --scope @myorg --module dashboard

# Add a routed module and wire it into the shell + package.json.
tanstack-react-modules create module <name> [--route ROUTE] [--nav-group GROUP]

# Add a Zustand store, declare it in AppDependencies, and inject it.
tanstack-react-modules create store <name>

# Scaffold a typed multi-module workflow (see @modular-react/journeys).
tanstack-react-modules create journey <name> [--modules a,b,c] [--persistence]
```

`create journey` produces a `journeys/<name>/` package with a journey
definition, a typed handle, and (with `--persistence`) a localStorage
adapter under `shell/src/`. It also installs `journeysPlugin()` on the
shell's registry and registers the journey, so the only thing you need
to write yourself is the per-step transitions and module entry/exit
contracts (see [`@modular-react/journeys`](https://github.com/kibertoad/modular-react/blob/main/packages/journeys/README.md)).

All commands support interactive (prompts) and non-interactive (flags)
modes — pass any required positional/flag and the CLI runs without
prompting. Run any command with `--help` for its full flag set.

## Development

Requires Node.js 22+.

```bash
pnpm build          # Compile TypeScript
pnpm dev            # Watch mode
```

The implementation lives in [`@modular-react/cli-core`](https://github.com/kibertoad/modular-react/tree/main/packages/cli-core); this package only supplies the TanStack Router-specific preset (template fragments + binary metadata). The React Router CLI (`@react-router-modules/cli`) reuses the same core with a different preset.

## Testing

### Unit tests (cli-testlab)

Tests CLI commands by executing them as child processes and asserting on output and generated files.

```bash
pnpm test
```

### E2E tests (Playwright)

Smoke tests that validate the full framework end-to-end: scaffold a project via CLI, start the dev server, and interact with the served UI using Playwright.

```bash
pnpm test:e2e:setup    # Scaffold project, build framework, install deps
pnpm test:e2e:server   # Start vite dev server on port 5188 (run in background)
pnpm test:e2e          # Run Playwright tests against the running server
```

The setup script uses `link:` overrides to point `@tanstack-react-modules/core` and `@tanstack-react-modules/runtime` to the local built packages.

To re-scaffold from scratch:

```bash
pnpm clean             # Remove dist + test artifacts
pnpm build             # Rebuild CLI
pnpm test:e2e:setup    # Re-scaffold
```
