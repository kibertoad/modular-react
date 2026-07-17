import { createRequire } from "node:module";
import type { CliPreset } from "@modular-react/cli-core";
import { appSharedIndex } from "./templates/app-shared.js";
import {
  shellMain,
  shellRootLayout,
  shellShellLayout,
  shellSidebar,
  shellViteConfig,
  shellIndexHtml,
  shellAuthStore,
  shellConfigStore,
  shellHome,
} from "./templates/shell.js";
import {
  moduleDescriptor,
  moduleDetailPanel,
  moduleListPage,
  modulePage,
  moduleTest,
} from "./templates/module.js";
import { storeFile } from "./templates/store.js";
import { journeyDefinition, journeyPersistence } from "./templates/journey.js";

const ROUTER_VERSION = "^7.6.0";

// Source the CLI version from this package's own `package.json` so
// `--version` stays in sync with the published package across releases.
const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

export const reactRouterPreset: CliPreset = {
  cliName: "react-router-modules",
  cliVersion: pkg.version,
  cliDescription: "modular-react CLI (React Router integration)",
  packages: {
    core: "@react-router-modules/core",
    runtime: "@react-router-modules/runtime",
    testing: "@react-router-modules/testing",
    journeys: "@modular-react/journeys",
    router: "react-router",
    routerVersion: ROUTER_VERSION,
  },
  docs: {
    shellPatterns: "shell-patterns-react-router.md",
  },
  templates: {
    appSharedIndex,
    shellMain,
    shellRootLayout,
    shellShellLayout,
    shellSidebar,
    shellViteConfig,
    shellIndexHtml,
    shellAuthStore,
    shellConfigStore,
    shellHome,
    moduleDescriptor,
    modulePage,
    moduleListPage,
    moduleDetailPanel,
    moduleTest,
    storeFile,
    journeyDefinition,
    journeyPersistence,
  },
};
