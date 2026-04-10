# @react-router-modules/cli 

Scaffolding CLI for modular-react (React Router integration). Creates projects, modules, and stores with full wiring.

## Commands

```bash
react-router-modules init <name> --scope @myorg --module dashboard   # New project
react-router-modules create module <name> --route billing             # New module
react-router-modules create store <name>                              # New Zustand store
```

All commands support interactive (prompts) and non-interactive (flags) modes. See the [main README](https://github.com/kibertoad/modular-react#cli-reference) for full documentation.

## Development

Requires Node.js 22+.

```bash
pnpm build          # Compile TypeScript
pnpm dev            # Watch mode
```

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

The setup script uses `link:` overrides to point `@react-router-modules/core` and `@react-router-modules/runtime` to the local built packages.

To re-scaffold from scratch:

```bash
pnpm clean             # Remove dist + test artifacts
pnpm build             # Rebuild CLI
pnpm test:e2e:setup    # Re-scaffold
```
