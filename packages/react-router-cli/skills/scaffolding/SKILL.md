---
name: scaffolding
description: Use when a consumer asks to scaffold or extend a React Router modular-react workspace with @react-router-modules/cli: init, create module, create store, create journey, generated workspace wiring, or CLI-first fixes.
sources:
  - ../../README.md
  - ../../../../docs/getting-started-react-router.md
  - ../../../../docs/framework-mode-react-router.md
---

# React Router CLI scaffolding

Prefer `@react-router-modules/cli` for generated workspaces and routine additions. The CLI updates workspace files, package manifests, registry wiring, and shared types together.

## Commands

Bootstrap a workspace:

```sh
npx @react-router-modules/cli init my-app --scope @myorg --module dashboard
```

Add a module:

```sh
npx @react-router-modules/cli create module billing --route billing --nav-group finance
```

Add a store:

```sh
npx @react-router-modules/cli create store auth
```

Add a journey:

```sh
npx @react-router-modules/cli create journey customer-onboarding --modules profile,plan,billing --persistence
```

## Workflow

1. Check whether the workspace matches the generated layout.
2. Use the CLI for module, store, and journey additions when possible.
3. Fill in page logic, journey transitions, and entry/exit contracts after generation.
4. Install changed dependencies, then typecheck.

## Generated workspace assumptions

- The scaffold targets Node 22+ and pnpm workspaces.
- npm is not supported for scaffolded workspaces because it does not support `workspace:*`.
- Generated route integration follows React Router v7 framework mode unless the app explicitly uses library-owned routing.

## Common mistakes

- Do not add a module only by creating a package directory. The shell registry and package metadata also need wiring.
- Do not hand-edit generated transform markers unless changing the CLI templates themselves.
- Do not use `@modular-react/cli-core` directly in consumer apps; it is the internal foundation for router-specific CLIs.
- Do not leave scaffolded journey transitions as placeholders.
