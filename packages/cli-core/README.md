# @modular-react/cli-core

Internal foundation for the modular-react CLI binaries. Both
[`@react-router-modules/cli`](../react-router-cli) and
[`@tanstack-react-modules/cli`](../tanstack-router-cli) are thin
preset wrappers around this package: the commands, prompts, project
detection, file transforms, and router-agnostic templates all live here.

If you're scaffolding a project, install one of the router-specific
binaries — not this package.

## What's in here

- Command implementations: `init`, `create module`, `create store`,
  `create journey`. Each is a factory that takes a `CliPreset` and
  returns a [`citty`](https://github.com/unjs/citty) command.
- Project detection (`resolveProject`) and scope detection
  (`detectScope`).
- File transforms that edit `shell/src/main.tsx`, `shell/package.json`,
  `app-shared/src/index.ts`, and `pnpm-workspace.yaml` (`addModuleToMain`,
  `addStoreToAppShared`, `addJourneyToMain`, `ensureJourneysInWorkspace`).
- Router-agnostic templates: workspace files, `app-shared` package
  metadata, store stub, journey package + definition + persistence.

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
    router: "your-router",
    routerVersion: "^1.0.0",
  },
  docs: { shellPatterns: "shell-patterns-your-router.md" },
  templates: {
    appSharedIndex,        // your `app-shared/src/index.ts` template
    shellMain,             // your `shell/src/main.tsx` template
    shellRootLayout,
    shellShellLayout,
    shellSidebar,
    shellViteDedupe: ["react", "react-dom", "react/jsx-runtime", "your-router", ...],
    moduleDescriptor,      // your `defineModule({...})` template
    modulePage,
    moduleListPage,
    moduleDetailPanel,
    moduleTest,
  },
};

runCli(preset);
```

The router-agnostic bits (project layout, journeys, stores, package
metadata) come from this package automatically.
