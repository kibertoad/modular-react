# @modular-react/cli-core

Internal foundation for the modular-react CLI binaries. The
[`@react-router-modules/cli`](../react-router-cli),
[`@tanstack-react-modules/cli`](../tanstack-router-cli), and
[`@modular-vue/cli`](../vue-cli) binaries are thin preset wrappers around
this package: the commands, prompts, project detection, file transforms,
and framework-agnostic templates all live here.

If you're scaffolding a project, install one of the router-specific
binaries — not this package.

## What's in here

This package's public surface is intentionally tiny — `buildCli`,
`runCli`, and the `CliPreset` types in `src/index.ts`. Everything else
is internal machinery the commands rely on:

- Command implementations under `src/commands/`: `init` (with an opt-in
  `--with-catalog` flag), `create module`, `create store`, `create journey`,
  and `create catalog`. Each is a factory that takes a `CliPreset` and
  returns a [`citty`](https://github.com/unjs/citty) command. Wired together
  by `buildCli`.
- Project layout detection (`utils/resolve-project.ts`) and scope
  detection (`utils/detect-scope.ts`).
- File transforms (`utils/transform.ts`) that edit `shell/src/main.tsx`,
  `shell/package.json`, `app-shared/src/index.ts`, and
  `pnpm-workspace.yaml` to wire newly scaffolded pieces in. Anchored on
  comment markers and predictable shapes that the CLI's own templates
  emit.
- Centralized runtime-package version pins in `runtime-versions.ts` —
  bump in one place to refresh every generated `package.json`.
- Router-agnostic templates under `src/templates/`: workspace files,
  `app-shared` and shell package metadata, the shared `http-client`,
  journey package metadata (`package.json` + `index` + `tsconfig`), and
  the root `catalog.config.ts`. Framework-specific bodies (JSX/SFC
  source, stores, `vite.config.ts`, `index.html`, journey definition +
  persistence) come from the preset — see below.

## Adding a router integration

Implement a `CliPreset`:

```ts
import { runCli, type CliPreset } from "@modular-react/cli-core";

const preset: CliPreset = {
  cliName: "your-router-modules",
  cliVersion: "0.1.0",
  cliDescription: "modular-react CLI (Your Router integration)",
  packages: {
    core: "@your-router-modules/core",
    runtime: "@your-router-modules/runtime",
    testing: "@your-router-modules/testing",
    journeys: "@your-router-modules/journeys", // journeys binding the scaffolded packages import
    router: "your-router",
    routerVersion: "^1.0.0",
  },
  docs: { shellPatterns: "shell-patterns-your-router.md" },
  scaffold: {
    entryMain: "main.tsx", // shell entry file name
    viewExt: "tsx", // extension for generated view/component files
  },
  templates: {
    appSharedIndex, // your `app-shared/src/index.ts` template
    shellMain, // your `shell/src/main.tsx` template
    shellRootLayout,
    shellShellLayout,
    shellSidebar,
    shellViteConfig, // your `shell/vite.config.ts` (plugin + dedupe list)
    shellIndexHtml, // your `shell/index.html`
    shellAuthStore, // your `shell/src/stores/auth.ts`
    shellConfigStore, // your `shell/src/stores/config.ts`
    shellHome, // your `shell/src/components/Home.*`
    moduleDescriptor, // your `defineModule({...})` template
    modulePage,
    moduleListPage,
    moduleDetailPanel,
    moduleTest,
    storeFile, // your `create store` scaffold
    journeyDefinition, // your journey definition body
    journeyPersistence, // your journey persistence adapter
  },
};

runCli(preset);
```

The router-agnostic bits (project layout, journey package metadata,
package.json/tsconfig scaffolding, workspace + catalog wiring) come from
this package automatically; the framework-specific bodies above are the
only pieces a preset supplies.
